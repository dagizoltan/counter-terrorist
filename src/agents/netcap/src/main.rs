use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader, AsyncReadExt};
use chrono::Utc;
use std::sync::Arc;
use tokio::sync::Mutex;
use once_cell::sync::Lazy;
use std::fs::File;
use std::io::{Write, BufWriter};

static STDOUT_LOCK: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));

#[allow(dead_code)]
#[derive(Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
enum PcapCommand {
    StartCapture {
        interface: String,
        filename: Option<String>,
        #[serde(default)]
        duration: u64 // seconds
    },
    StopCapture,
    GetStatus,
}

#[allow(dead_code)]
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
        let idb_len = (20 + interface.len() + 3) & !3; // Padding
        idb.write_all(&(idb_len as u32).to_le_bytes())?;
        idb.write_all(&1u16.to_le_bytes())?; // LinkType (Ethernet)
        idb.write_all(&0u16.to_le_bytes()) // Reserved
            .and_then(|_| idb.write_all(&0u32.to_le_bytes()))?; // SnapLen (0 = unlimited)
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
        Ok(())
    }
}

async fn log_forensic(severity: &str, message: &str) {
    let log = serde_json::json!({
        "timestamp": Utc::now().to_rfc3339(),
        "log_type": "activity",
        "severity": severity,
        "caller": "pcap:main",
        "message": message
    });

    let mut buf = Vec::new();
    if log.serialize(&mut rmp_serde::Serializer::new(&mut buf)).is_ok() {
        // Shmem write would go here
    }

    if let Ok(json) = serde_json::to_string(&log) {
        let _lock = STDOUT_LOCK.lock().await;
        println!("[LOG] {}", json);
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    log_forensic("info", "Sovereign PCAP Engine active (Native PCAPng support)").await;

    let mut stdin = tokio::io::stdin();
    let mut buffer = bytes::BytesMut::with_capacity(4096);
    let capture_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>> = Arc::new(Mutex::new(None));

    loop {
        let mut byte_buf = [0u8; 1024];
        let n = match stdin.read(&mut byte_buf).await {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };
        buffer.extend_from_slice(&byte_buf[..n]);

        while !buffer.is_empty() {
            if let Ok(cmd_val) = rmp_serde::from_slice::<serde_json::Value>(&buffer) {
                handle_netcap_command(cmd_val, capture_handle.clone()).await;
                buffer.clear();
                break;
            }

            if let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
                let line_bytes = buffer.split_to(pos + 1);
                if let Ok(cmd_val) = serde_json::from_slice::<serde_json::Value>(&line_bytes[..pos]) {
                    handle_netcap_command(cmd_val, capture_handle.clone()).await;
                }
            } else {
                break;
            }
        }
    }
    Ok(())
}

async fn handle_netcap_command(cmd_val: serde_json::Value, capture_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>) {
        let id = cmd_val["id"].as_str().map(|s| s.to_string());
        let cmd_type = cmd_val["type"].as_str().unwrap_or("");

        match cmd_type {
            "StartCapture" => {
                let interface = cmd_val["payload"]["interface"].as_str().unwrap_or("eth0").to_string();
                let filename = cmd_val["payload"]["filename"].as_str().map(|s| s.to_string());
                let duration = cmd_val["payload"]["duration"].as_u64().unwrap_or(0);
                
                let mut handle = capture_handle.lock().await;
                if let Some(h) = handle.as_ref() {
                    if !h.is_finished() {
                        return;
                    }
                }

                let interface_clone = interface.clone();
                let filename_clone = filename.clone();

                let pcap_init = filename_clone.as_ref().map(|f| PcapngWriter::new(f, &interface_clone));
                if let Some(Err(e)) = pcap_init {
                    let err_msg = format!("Failed to initialize PCAP writer: {}", e);
                    log_forensic("error", &err_msg).await;
                    let resp = serde_json::json!({ "id": id, "success": false, "message": err_msg, "timestamp": Utc::now().to_rfc3339() });
                    println!("{}", resp);
                    return;
                }

                log_forensic("info", &format!("Activating native forensic capture on {} (Duration: {}s)", interface, duration)).await;

                let h = tokio::spawn(async move {
                    let mut pcap_writer = filename_clone.as_ref().and_then(|f| PcapngWriter::new(f, &interface_clone).ok());
                    let start_time = Utc::now();

                    #[cfg(target_os = "linux")]
                    {
                        use socket2::{Socket, Domain, Type, Protocol};
                        let socket = match Socket::new(Domain::PACKET, Type::RAW, Some(Protocol::from(0x0003u16.to_be() as i32))) {
                            Ok(s) => s,
                            Err(e) => {
                                let _ = log_forensic("error", &format!("Failed to open raw socket: {}. Ensure CAP_NET_RAW is set.", e)).await;
                                return;
                            }
                        };

                        if let Ok(idx) = nix::net::if_::if_nametoindex(interface_clone.as_str()) {
                            use libc::{sockaddr_ll, AF_PACKET, ETH_P_ALL};
                            let mut address: sockaddr_ll = unsafe { std::mem::zeroed() };
                            address.sll_family = AF_PACKET as u16;
                            address.sll_protocol = (ETH_P_ALL as u16).to_be();
                            address.sll_ifindex = idx as i32;

                            let addr = unsafe {
                                let mut storage: libc::sockaddr_storage = std::mem::zeroed();
                                std::ptr::copy_nonoverlapping(
                                    &address as *const _ as *const u8,
                                    &mut storage as *mut _ as *mut u8,
                                    std::mem::size_of::<sockaddr_ll>(),
                                );
                                socket2::SockAddr::new(
                                    storage,
                                    std::mem::size_of::<sockaddr_ll>() as u32,
                                )
                            };

                            if let Err(e) = socket.bind(&addr) {
                                let _ = log_forensic("error", &format!("Failed to bind to interface {}: {}", interface_clone, e)).await;
                                return;
                            }
                        }

                        let mut buf = [std::mem::MaybeUninit::new(0u8); 65535];
                        loop {
                            if duration > 0 && (Utc::now() - start_time).num_seconds() >= duration as i64 {
                                let _ = log_forensic("info", "Forensic capture auto-terminated by duration limit.").await;
                                break;
                            }

                            socket.set_read_timeout(Some(std::time::Duration::from_millis(100))).ok();
                            match socket.recv(&mut buf) {
                                Ok(n) if n > 0 => {
                                    let initialized_buf = unsafe {
                                        std::slice::from_raw_parts(buf.as_ptr() as *const u8, n)
                                    };

                                    if n < 14 {
                                        continue;
                                    }
                                    let mut ethertype = u16::from_be_bytes([initialized_buf[12], initialized_buf[13]]);
                                    let mut payload_offset = 14;

                                    if ethertype == 0x8100 && n > 18 {
                                        ethertype = u16::from_be_bytes([initialized_buf[16], initialized_buf[17]]);
                                        payload_offset = 18;
                                    }

                                    let mut is_loopback = false;
                                    if ethertype == 0x0800 && n >= payload_offset + 20 { // IPv4
                                        let src_ip = &initialized_buf[payload_offset + 12..payload_offset + 16];
                                        let dst_ip = &initialized_buf[payload_offset + 16..payload_offset + 20];
                                        if src_ip == [127, 0, 0, 1] || dst_ip == [127, 0, 0, 1] {
                                            is_loopback = true;
                                        }
                                    } else if ethertype == 0x86DD && n >= payload_offset + 40 { // IPv6
                                        let src_ip = &initialized_buf[payload_offset + 8..payload_offset + 24];
                                        let dst_ip = &initialized_buf[payload_offset + 24..payload_offset + 40];
                                        let loopback_addr = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
                                        if src_ip == loopback_addr || dst_ip == loopback_addr {
                                            is_loopback = true;
                                        }
                                    }

                                    if is_loopback {
                                        continue;
                                    }

                                    if let Some(mut writer) = pcap_writer.take() {
                                        let buf_to_write = initialized_buf.to_vec();
                                        let timestamp = Utc::now().timestamp_nanos_opt().unwrap_or(0) as u64;

                                        match tokio::task::spawn_blocking(move || {
                                            writer.write_packet(&buf_to_write, timestamp).map(|_| writer)
                                        }).await {
                                            Ok(Ok(updated_writer)) => {
                                                pcap_writer = Some(updated_writer);
                                            }
                                            Ok(Err(e)) => {
                                                let _ = log_forensic("error", &format!("PCAP Write Failed: {}", e)).await;
                                                break;
                                            }
                                            Err(e) => {
                                                let _ = log_forensic("error", &format!("Blocking task failed: {}", e)).await;
                                                break;
                                            }
                                        }
                                    }
                                }
                                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                                    tokio::task::yield_now().await;
                                }
                                Err(e) => {
                                    let _ = log_forensic("error", &format!("Raw socket error: {}", e)).await;
                                    break;
                                }
                                _ => {}
                            }
                        }
                    }

                    #[cfg(not(target_os = "linux"))]
                    {
                        loop {
                            if duration > 0 && (Utc::now() - start_time).num_seconds() >= duration as i64 {
                                break;
                            }
                            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                        }
                    }
                });
                *handle = Some(h);
                let msg = format!("PCAPng Forensic Recording Active on {}", interface);
                let resp = serde_json::json!({ "id": id, "success": true, "message": msg, "timestamp": Utc::now().to_rfc3339() });
                println!("{}", resp);
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
