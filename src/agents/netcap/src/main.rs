use serde::{Deserialize, Serialize};
use chrono::Utc;
use std::sync::Arc;
use tokio::sync::Mutex;
use once_cell::sync::Lazy;
use std::fs::File;
use std::io::{Write, BufWriter};
use cts_ipc::{IpcManager, AgentCommand};

static STDOUT_LOCK: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));
static IPC: Lazy<IpcManager> = Lazy::new(|| IpcManager::new("netcap", 1024 * 1024));

#[derive(Deserialize, Serialize, Debug)]
#[serde(tag = "type")]
enum PcapCommand {
    StartCapture {
        interface: String,
        filename: Option<String>,
        #[serde(default)]
        duration: u64
    },
    StopCapture,
    GetStatus,
    ENFORCE_PID {
        path: String
    }
}

#[derive(Serialize, Deserialize, Debug)]
struct SidecarResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    success: bool,
    message: String,
    timestamp: String,
}

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

        let mut shb = Vec::new();
        shb.write_all(&SHB_TYPE.to_le_bytes())?;
        shb.write_all(&(28u32).to_le_bytes())?;
        shb.write_all(&0x1A2B3C4Du32.to_le_bytes())?;
        shb.write_all(&1u16.to_le_bytes())?;
        shb.write_all(&0u16.to_le_bytes())?;
        shb.write_all(&0xFFFFFFFFFFFFFFFFu64.to_le_bytes())?;
        shb.write_all(&(28u32).to_le_bytes())?;
        writer.write_all(&shb)?;

        let mut idb = Vec::new();
        idb.write_all(&IDB_TYPE.to_le_bytes())?;
        let idb_len = (20 + interface.len() + 3) & !3;
        idb.write_all(&(idb_len as u32).to_le_bytes())?;
        idb.write_all(&1u16.to_le_bytes())?;
        idb.write_all(&0u16.to_le_bytes())
            .and_then(|_| idb.write_all(&0u32.to_le_bytes()))?;
        idb.write_all(&2u16.to_le_bytes())?;
        idb.write_all(&(interface.len() as u16).to_le_bytes())?;
        idb.write_all(interface.as_bytes())?;
        let padding = (4 - (interface.len() % 4)) % 4;
        for _ in 0..padding { idb.write_all(&[0])?; }
        idb.write_all(&0u16.to_le_bytes())?;
        idb.write_all(&0u16.to_le_bytes())?;
        idb.write_all(&(idb_len as u32).to_le_bytes())?;
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
        epb.write_all(&0u32.to_le_bytes())?;
        
        let ts_high = (timestamp_ns >> 32) as u32;
        let ts_low = (timestamp_ns & 0xFFFFFFFF) as u32;
        epb.write_all(&ts_high.to_le_bytes())?;
        epb.write_all(&ts_low.to_le_bytes())?;
        
        epb.write_all(&(packet_len as u32).to_le_bytes())?;
        epb.write_all(&(packet_len as u32).to_le_bytes())?;
        epb.write_all(data)?;
        let padding = (4 - (packet_len % 4)) % 4;
        for _ in 0..padding { epb.write_all(&[0])?; }
        
        epb.write_all(&(block_len as u32).to_le_bytes())?;
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

    if !IPC.emit_event(&log) {
        if let Ok(json) = serde_json::to_string(&log) {
            let _lock = STDOUT_LOCK.lock().await;
            println!("[LOG] {}", json);
        }
    }
}

async fn emit_response(id: Option<String>, success: bool, message: String) {
    let resp = SidecarResponse {
        id,
        success,
        message,
        timestamp: Utc::now().to_rfc3339(),
    };
    if !IPC.emit_event(&resp) {
        if let Ok(msgpack) = rmp_serde::to_vec(&resp) {
            let _lock = STDOUT_LOCK.lock().await;
            use std::io::Write;
            let mut stdout = std::io::stdout();
            let _ = stdout.write_all(&(msgpack.len() as u32).to_le_bytes());
            let _ = stdout.write_all(&msgpack);
            let _ = stdout.flush();
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    log_forensic("info", "Sovereign PCAP Engine active (Native PCAPng support)").await;

    let mut ipc = IpcManager::new("netcap", 1024 * 1024);
    let capture_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>> = Arc::new(Mutex::new(None));

    while let Some(cmd_raw) = ipc.next_command().await {
        match cmd_raw {
            AgentCommand::Custom(payload) => {
                if let Ok(cmd) = rmp_serde::from_slice::<PcapCommand>(&payload) {
                    handle_command(cmd, capture_handle.clone()).await;
                }
            },
            AgentCommand::GetStatus => {
                emit_response(None, true, "PCAP Engine Operational".to_string()).await;
            },
            AgentCommand::Shutdown => break,
        }
    }
    Ok(())
}

async fn handle_command(cmd: PcapCommand, capture_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>) {
    match cmd {
        PcapCommand::ENFORCE_PID { path } => {
            if let Ok(_) = cts_ipc::apply_landlock(&path) {
                log_forensic("info", &format!("Landlock FS Gating active for netcap on path {}", path)).await;
            }
        },
        PcapCommand::StartCapture { interface, filename, duration } => {
            let mut handle = capture_handle.lock().await;
            if let Some(h) = handle.as_ref() {
                if !h.is_finished() { return; }
            }

            let interface_clone = interface.clone();
            let filename_clone = filename.clone();

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
                            std::ptr::copy_nonoverlapping(&address as *const _ as *const u8, &mut storage as *mut _ as *mut u8, std::mem::size_of::<sockaddr_ll>());
                            socket2::SockAddr::new(storage, std::mem::size_of::<sockaddr_ll>() as u32)
                        };

                        if let Err(e) = socket.bind(&addr) {
                            let _ = log_forensic("error", &format!("Failed to bind to interface {}: {}", interface_clone, e)).await;
                            return;
                        }
                    }

                    let mut buf = [std::mem::MaybeUninit::new(0u8); 65535];
                    loop {
                        if duration > 0 && (Utc::now() - start_time).num_seconds() >= duration as i64 { break; }
                        socket.set_read_timeout(Some(std::time::Duration::from_millis(100))).ok();
                        match socket.recv(&mut buf) {
                            Ok(n) if n >= 14 => {
                                let initialized_buf = unsafe { std::slice::from_raw_parts(buf.as_ptr() as *const u8, n) };
                                let mut ethertype = u16::from_be_bytes([initialized_buf[12], initialized_buf[13]]);
                                let mut payload_offset = 14;

                                if ethertype == 0x8100 && n > 18 {
                                    ethertype = u16::from_be_bytes([initialized_buf[16], initialized_buf[17]]);
                                    payload_offset = 18;
                                }

                                let mut is_loopback = false;
                                if ethertype == 0x0800 && n >= payload_offset + 20 {
                                    if &initialized_buf[payload_offset + 12..payload_offset + 16] == [127, 0, 0, 1] || &initialized_buf[payload_offset + 16..payload_offset + 20] == [127, 0, 0, 1] {
                                        is_loopback = true;
                                    }
                                } else if ethertype == 0x86DD && n >= payload_offset + 40 {
                                    let loopback_addr = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
                                    if &initialized_buf[payload_offset + 8..payload_offset + 24] == loopback_addr || &initialized_buf[payload_offset + 24..payload_offset + 40] == loopback_addr {
                                        is_loopback = true;
                                    }
                                }

                                if !is_loopback {
                                    if let Some(mut writer) = pcap_writer.take() {
                                        let buf_to_write = initialized_buf.to_vec();
                                        let timestamp = Utc::now().timestamp_nanos_opt().unwrap_or(0) as u64;
                                        match tokio::task::spawn_blocking(move || {
                                            writer.write_packet(&buf_to_write, timestamp).map(|_| writer)
                                        }).await {
                                            Ok(Ok(updated_writer)) => { pcap_writer = Some(updated_writer); }
                                            _ => break,
                                        }
                                    }
                                }
                            }
                            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => { tokio::task::yield_now().await; }
                            _ => break,
                        }
                    }
                }
            });
            *handle = Some(h);
            emit_response(None, true, format!("PCAPng Forensic Recording Active on {}", interface)).await;
        },
        PcapCommand::StopCapture => {
            let mut handle = capture_handle.lock().await;
            if let Some(h) = handle.take() {
                h.abort();
                log_forensic("info", "Forensic recording terminated.").await;
            }
            emit_response(None, true, "Capture stopped".to_string()).await;
        },
        PcapCommand::GetStatus => {
            emit_response(None, true, "PCAP Engine Operational".to_string()).await;
        }
    }
}
