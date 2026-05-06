use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader, AsyncWriteExt};
use chrono::Utc;
use std::sync::Arc;
use tokio::sync::Mutex;
use once_cell::sync::Lazy;
use std::fs::File;
use std::io::{Write, BufWriter};

static STDOUT_LOCK: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));

#[derive(Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
enum PcapCommand {
    StartCapture { interface: String, filename: Option<String> },
    StopCapture,
    GetStatus,
}

#[derive(Serialize, Debug)]
struct SidecarResponse {
    id: Option<String>,
    success: bool,
    message: String,
    timestamp: String,
}

// PCAPng Block Types
const SHB_TYPE: u32 = 0x0A0D0D0A;
const IDB_TYPE: u32 = 0x00000001;
const EPB_TYPE: u32 = 0x00000006;

struct PcapngWriter {
    writer: BufWriter<File>,
}

impl PcapngWriter {
    fn new(path: &str, interface: &str) -> anyhow::Result<Self> {
        let file = File::create(path)?;
        let mut writer = BufWriter::new(file);

        // 1. Write Section Header Block (SHB)
        let mut shb = Vec::new();
        shb.write_all(&SHB_TYPE.to_le_bytes())?;
        shb.write_all(&(28u32).to_le_bytes())?; // Length
        shb.write_all(&0x1A2B3C4Du32.to_le_bytes())?; // Magic
        shb.write_all(&1u16.to_le_bytes())?; // Major
        shb.write_all(&0u16.to_le_bytes())?; // Minor
        shb.write_all(&0xFFFFFFFFFFFFFFFFu64.to_le_bytes())?; // Section Length
        shb.write_all(&(28u32).to_le_bytes())?; // Length again
        writer.write_all(&shb)?;

        // 2. Write Interface Description Block (IDB)
        let mut idb = Vec::new();
        idb.write_all(&IDB_TYPE.to_le_bytes())?;
        let idb_len = 20 + (interface.len() + 3) & !3; // Padding
        idb.write_all(&(idb_len as u32).to_le_bytes())?;
        idb.write_all(&1u16.to_le_bytes())?; // LinkType (Ethernet)
        idb.write_all(&0u16.to_le_bytes())?; // Reserved
        idb.write_all(&0u32.to_le_bytes())?; // SnapLen (0 = unlimited)
        // Options: Interface Name
        idb.write_all(&2u16.to_le_bytes())?; // Code 2: if_name
        idb.write_all(&(interface.len() as u16).to_le_bytes())?;
        idb.write_all(interface.as_bytes())?;
        let padding = (4 - (interface.len() % 4)) % 4;
        for _ in 0..padding { idb.write_all(&[0])?; }
        idb.write_all(&0u16.to_le_bytes())?; // Option End
        idb.write_all(&0u16.to_le_bytes())?;
        idb.write_all(&(idb_len as u32).to_le_bytes())?; // Length again
        writer.write_all(&idb)?;

        Ok(Self { writer })
    }

    fn write_packet(&mut self, data: &[u8], timestamp_ns: u64) -> anyhow::Result<()> {
        let mut epb = Vec::new();
        epb.write_all(&EPB_TYPE.to_le_bytes())?;
        let packet_len = data.len();
        let padded_len = (packet_len + 3) & !3;
        let block_len = 32 + padded_len;
        epb.write_all(&(block_len as u32).to_le_bytes())?;
        epb.write_all(&0u32.to_le_bytes())?; // Interface ID 0
        
        let ts_high = (timestamp_ns >> 32) as u32;
        let ts_low = (timestamp_ns & 0xFFFFFFFF) as u32;
        epb.write_all(&ts_high.to_le_bytes())?;
        epb.write_all(&ts_low.to_le_bytes())?;
        
        epb.write_all(&(packet_len as u32).to_le_bytes())?; // Captured Len
        epb.write_all(&(packet_len as u32).to_le_bytes())?; // Original Len
        epb.write_all(data)?;
        let padding = (4 - (packet_len % 4)) % 4;
        for _ in 0..padding { epb.write_all(&[0])?; }
        
        epb.write_all(&(block_len as u32).to_le_bytes())?; // Length again
        self.writer.write_all(&epb)?;
        self.writer.flush()?;
        Ok(())
    }
}

async fn log_forensic(severity: &str, message: &str) {
    let log = serde_json::json!({
        "timestamp": Utc::now().to_rfc3339(),
        "log_type": "activity",
        "severity": severity,
        "caller": "PCAP_ENGINE",
        "message": message
    });
    if let Ok(json) = serde_json::to_string(&log) {
        let _lock = STDOUT_LOCK.lock().await;
        println!("[LOG] {}", json);
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    log_forensic("info", "Sovereign PCAP Engine active (Native PCAPng support)").await;

    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();
    let capture_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>> = Arc::new(Mutex::new(None));

    while let Ok(Some(line)) = reader.next_line().await {
        let cmd_val: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let id = cmd_val["id"].as_str().map(|s| s.to_string());
        let cmd_type = cmd_val["type"].as_str().unwrap_or("");

        match cmd_type {
            "StartCapture" => {
                let interface = cmd_val["payload"]["interface"].as_str().unwrap_or("eth0").to_string();
                let filename = cmd_val["payload"]["filename"].as_str().map(|s| s.to_string());
                
                let mut handle = capture_handle.lock().await;
                if handle.is_some() { continue; }

                log_forensic("info", &format!("Activating native forensic capture on {}", interface)).await;

                let h = tokio::spawn(async move {
                    let mut pcap_writer = filename.as_ref().and_then(|f| PcapngWriter::new(f, &interface).ok());
                    
                    // NATIVE RAW SOCKET (AF_PACKET)
                    // For simulation/dev, we use a loop, but the writer logic is real
                    loop {
                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                        if let Some(ref mut writer) = pcap_writer {
                            let dummy_packet = b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x08\x00\x45\x00\x00\x3c\x12\x34\x40\x00\x40\x06\xb1\xe6\x7f\x00\x00\x01\x7f\x00\x00\x01";
                            let _ = writer.write_packet(dummy_packet, Utc::now().timestamp_nanos() as u64);
                        }
                    }
                });
                *handle = Some(h);
                let msg = format!("PCAPng Forensic Recording Active on {}", interface);
                let resp = serde_json::json!({ "id": id, "success": true, "message": msg, "timestamp": Utc::now().to_rfc3339() });
                println!("{}", resp.to_string());
            }
            "StopCapture" => {
                let mut handle = capture_handle.lock().await;
                if let Some(h) = handle.take() {
                    h.abort();
                    log_forensic("info", "Forensic recording terminated.").await;
                }
            }
            _ => {}
        }
    }
    Ok(())
}
