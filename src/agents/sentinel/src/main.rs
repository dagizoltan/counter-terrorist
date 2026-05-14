use serde::{Serialize, Deserialize};
use chrono::Utc;
use tokio::io::{self, AsyncBufReadExt, BufReader};
use std::sync::Arc;
use tokio::sync::Mutex;
use once_cell::sync::Lazy;
use aya::Bpf;
use aya::maps::PerfEventArray;
use aya::programs::{KProbe, SchedClassifier, TcAttachType, Lsm};
use aya::{include_bytes_aligned, Btf};
use sentinel_common::{SyscallEvent, ShadowBanInfo, SessionKey, SessionValue, LpmKey};
use bytes::BytesMut;
use sysinfo::{ProcessExt, System, SystemExt, Pid, PidExt};

static STDOUT_LOCK: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));

#[derive(Serialize, Deserialize, Debug)]
struct SidecarCommand {
    id: Option<String>,
    #[serde(rename = "type")]
    cmd_type: String,
    ip: Option<String>,
    pid: Option<u32>,
    comm: Option<String>,
    port: Option<u16>,
    protocol: Option<String>,
    paths: Option<Vec<String>>,
    path: Option<String>,
}

#[derive(Serialize)]
struct SidecarResponse {
    id: Option<String>,
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
    timestamp: String,
}

async fn emit_response(id: Option<String>, success: bool, message: String) {
    let resp = SidecarResponse {
        id,
        success,
        message: Some(message),
        data: None,
        timestamp: Utc::now().to_rfc3339(),
    };
    if let Ok(json) = serde_json::to_string(&resp) {
        let _lock = STDOUT_LOCK.lock().await;
        println!("{}", json);
    }
}

async fn emit_event(data: serde_json::Value) {
    let resp = SidecarResponse {
        id: None,
        success: true,
        message: None,
        data: Some(data),
        timestamp: Utc::now().to_rfc3339(),
    };
    if let Ok(json) = serde_json::to_string(&resp) {
        let _lock = STDOUT_LOCK.lock().await;
        println!("{}", json);
    }
}

fn parse_ip_or_cidr(s: &str) -> Option<(std::net::Ipv4Addr, u32)> {
    if let Some((ip_part, mask_part)) = s.split_once('/') {
        let ip = ip_part.parse::<std::net::Ipv4Addr>().ok()?;
        let mask = mask_part.parse::<u32>().ok()?;
        if mask > 32 { return None; }
        Some((ip, mask))
    } else {
        let ip = s.parse::<std::net::Ipv4Addr>().ok()?;
        Some((ip, 32))
    }
}

#[cfg(target_os = "linux")]
#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    let _ = rlimit::Resource::MEMLOCK.set(rlimit::INFINITY, rlimit::INFINITY);

    // Bytecode loading logic
    #[cfg(debug_assertions)]
    let bpf_bytes = include_bytes_aligned!("../../target/bpfel-unknown-none/debug/sentinel-kernel");
    #[cfg(not(debug_assertions))]
    let bpf_bytes = include_bytes_aligned!("../../target/bpfel-unknown-none/release/sentinel-kernel");

    // We load it and then leak it to get a raw pointer
    let bpf_ptr: *mut Bpf = match Bpf::load(bpf_bytes) {
        Ok(b) => Box::into_raw(Box::new(b)),
        Err(e) => {
            emit_response(None, false, format!("Failed to load BPF: {}", e)).await;
            return run_dummy_mode().await;
        }
    };

    // Helper to get a mutable reference from the raw pointer
    let bpf = unsafe { &mut *bpf_ptr };

    // Attach TC
    if let Some(prog) = bpf.program_mut("tc_ingress") {
        if let Ok(tc_prog) = <&mut SchedClassifier>::try_from(prog) {
            let _ = tc_prog.load();
            let iface = std::env::var("CTS_IFACE").unwrap_or_else(|_| "eth0".to_string());
            let _ = tc_prog.attach(&iface, TcAttachType::Ingress);
        }
    }

    // Attach KProbes
    for (name, func) in [
        ("kprobe_ptrace", "sys_ptrace"),
        ("kprobe_mmap", "sys_mmap"),
        ("kprobe_execve", "sys_execve"),
        ("kprobe_connect", "sys_connect"),
        ("kprobe_openat", "sys_openat")
    ] {
        if let Some(prog) = bpf.program_mut(name) {
            if let Ok(p) = <&mut KProbe>::try_from(prog) {
                let _ = p.load();
                let _ = p.attach(func, 0).or_else(|_| p.attach(&format!("__x64_{}", func), 0));
            }
        }
    }

    // Attach LSM
    let btf = Btf::from_sys_fs().ok();
    if let Some(btf) = &btf {
        if let Some(prog) = bpf.program_mut("file_open") {
            if let Ok(lsm_prog) = <&mut Lsm>::try_from(prog) {
                if let Ok(_) = lsm_prog.load("file_open", btf) {
                    let _ = lsm_prog.attach();
                }
            }
        }
        if let Some(prog) = bpf.program_mut("inode_unlink") {
            if let Ok(lsm_prog) = <&mut Lsm>::try_from(prog) {
                if let Ok(_) = lsm_prog.load("inode_unlink", btf) {
                    let _ = lsm_prog.attach();
                }
            }
        }
        if let Some(prog) = bpf.program_mut("socket_connect") {
            if let Ok(lsm_prog) = <&mut Lsm>::try_from(prog) {
                if let Ok(_) = lsm_prog.load("socket_connect", btf) {
                    let _ = lsm_prog.attach();
                }
            }
        }
        if let Some(prog) = bpf.program_mut("sb_mount") {
            if let Ok(lsm_prog) = <&mut Lsm>::try_from(prog) {
                if let Ok(_) = lsm_prog.load("sb_mount", btf) {
                    let _ = lsm_prog.attach();
                }
            }
        }
    }

    // Handle Perf Events
    let mut perf_array = PerfEventArray::try_from(bpf.map_mut("EVENTS").unwrap())?;
    
    for cpu_id in aya::util::online_cpus()? {
        let mut buf = perf_array.open(cpu_id, None)?;
        tokio::spawn(async move {
            let mut buffers = (0..10).map(|_| BytesMut::with_capacity(1024)).collect::<Vec<_>>();
            loop {
                match buf.read_events(&mut buffers) {
                    Ok(events) => {
                        for i in 0..events.read {
                            let data = &buffers[i];
                            if data.len() >= std::mem::size_of::<SyscallEvent>() {
                                let event = unsafe { &*(data.as_ptr() as *const SyscallEvent) };
                                let syscall = match event.syscall_id {
                                    101 => "ptrace", 9 => "mmap", 59 => "execve",
                                    42 => "connect", 257 => "openat", _ => "unknown"
                                };
                                let comm = std::str::from_utf8(&event.comm).unwrap_or("unknown").trim_end_matches('\0');
                                emit_event(serde_json::json!({
                                    "type": "SYSCALL_EVENT",
                                    "pid": event.pid,
                                    "comm": comm,
                                    "syscall": syscall,
                                    "fd": event.fd,
                                    "port": event.port,
                                    "ip": event.ip,
                                    "timestamp": Utc::now().to_rfc3339()
                                })).await;
                            }
                        }
                    }
                    Err(_) => {
                        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    }
                }
            }
        });
    }

    // High-Frequency Session Polling: Export eBPF session metrics to the UI
    let bpf_ref = unsafe { &mut *bpf_ptr };
    if let Ok(m) = aya::maps::HashMap::<_, SessionKey, SessionValue>::try_from(bpf_ref.map_mut("ACTIVE_SESSIONS").unwrap()) {
        tokio::spawn(async move {
            let mut last_processed = std::collections::HashMap::new();
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                for res in m.iter() {
                    if let Ok((key, val)) = res {
                        let bytes = val.bytes_count;
                        let last_bytes = last_processed.get(&key).unwrap_or(&0);

                            // ENHANCEMENT: Basic Protocol Anomaly Detection (DPI Simulation)
                            if bytes - *last_bytes > 1_000_000 && key.dst_port == u16::to_be(53) {
                                emit_event(serde_json::json!({
                                    "type": "PROTOCOL_ANOMALY",
                                    "source": std::net::Ipv4Addr::from(u32::from_be(key.src_ip)).to_string(),
                                    "destination": std::net::Ipv4Addr::from(u32::from_be(key.dst_ip)).to_string(),
                                    "anomaly_type": "DNS_TUNNELING_SUSPECTED",
                                    "message": "High-volume traffic detected on port 53 (DNS). Potential data exfiltration.",
                                    "confidence": 0.95
                                })).await;
                            }

                        if bytes > *last_bytes {
                            let src_ip = std::net::Ipv4Addr::from(u32::from_be(key.src_ip));
                            let dst_ip = std::net::Ipv4Addr::from(u32::from_be(key.dst_ip));
                            emit_event(serde_json::json!({
                                "type": "NETWORK_LOG",
                                "source": src_ip.to_string(),
                                "destination": dst_ip.to_string(),
                                "src_port": u16::from_be(key.src_port),
                                "dst_port": u16::from_be(key.dst_port),
                                "protocol": match key.proto { 6 => "TCP", 17 => "UDP", _ => "OTHER" },
                                "bytes_count": bytes - *last_bytes,
                                "action": "ALLOW",
                                "timestamp": Utc::now().to_rfc3339()
                            })).await;
                            last_processed.insert(key, bytes);
                        }
                    }
                }
            }
        });
    }

    emit_response(None, true, "eBPF Sidecar Active.".to_string()).await;

    let mut stdin = BufReader::new(io::stdin()).lines();
    while let Ok(Some(line)) = stdin.next_line().await {
        if let Ok(cmd) = serde_json::from_str::<SidecarCommand>(&line) {
            let bpf_ref = unsafe { &mut *bpf_ptr };
            match cmd.cmd_type.as_str() {
                "BLOCK_IP" => {
                    if let Some(ip_str) = cmd.ip {
                        if let Some((ip, mask)) = parse_ip_or_cidr(&ip_str) {
                            if let Ok(mut m) = aya::maps::LpmTrie::<_, LpmKey, u32>::try_from(bpf_ref.map_mut("XDP_BLOCK_LIST").unwrap()) {
                                let key = aya::maps::lpm_trie::Key::new(mask, LpmKey { prefix_len: mask, data: u32::from(ip).to_be() });
                                let _ = m.insert(&key, 1u32, 0);
                                emit_response(cmd.id, true, format!("XDP Blocked (LPM): {}/{}", ip, mask)).await;
                            } else { emit_response(cmd.id, false, "XDP Map Error".to_string()).await; }
                        } else { emit_response(cmd.id, false, "Invalid IP/CIDR".to_string()).await; }
                    }
                },
                "UNBLOCK_IP" => {
                    if let Some(ip_str) = cmd.ip {
                        if let Some((ip, mask)) = parse_ip_or_cidr(&ip_str) {
                            if let Ok(mut m) = aya::maps::LpmTrie::<_, LpmKey, u32>::try_from(bpf_ref.map_mut("XDP_BLOCK_LIST").unwrap()) {
                                let key = aya::maps::lpm_trie::Key::new(mask, LpmKey { prefix_len: mask, data: u32::from(ip).to_be() });
                                let _ = m.remove(&key);
                                emit_response(cmd.id, true, format!("XDP Unblocked (LPM): {}/{}", ip, mask)).await;
                            } else { emit_response(cmd.id, false, "XDP Map Error".to_string()).await; }
                        } else { emit_response(cmd.id, false, "Invalid IP/CIDR".to_string()).await; }
                    }
                },
                "SHADOW_BAN" => {
                    if let Some(ip_str) = cmd.ip {
                        if let (Ok(ip), Ok(mut m)) = (ip_str.parse::<std::net::Ipv4Addr>(), aya::maps::HashMap::<_, u32, ShadowBanInfo>::try_from(bpf_ref.map_mut("SHADOW_BANS").unwrap())) {
                            let _ = m.insert(u32::from(ip).to_be(), ShadowBanInfo { last_timestamp: 0, bytes_this_second: 0 }, 0);
                            emit_response(cmd.id, true, format!("Shadow Ban: {}", ip_str)).await;
                        } else { emit_response(cmd.id, false, "Invalid IP or Map Error".to_string()).await; }
                    }
                },
                "ALLOW_PORT" => {
                    if let Some(port) = cmd.port {
                        if let Ok(mut m) = aya::maps::HashMap::<_, u16, u8>::try_from(bpf_ref.map_mut("ALLOWED_PORTS").unwrap()) {
                            let _ = m.insert(port, 1, 0);
                            emit_response(cmd.id, true, format!("Firewall: Allowed port {}", port)).await;
                        } else { emit_response(cmd.id, false, "Map Error".to_string()).await; }
                    }
                },
                "ENFORCE_PID" => {
                    if let Some(pid) = cmd.pid {
                        if let Ok(mut m) = aya::maps::HashMap::<_, u32, u32>::try_from(bpf_ref.map_mut("ENFORCEMENT_POLICY").unwrap()) {
                            // Default to full block (1) for now
                            let _ = m.insert(pid, 1, 0);
                            emit_response(cmd.id, true, format!("LSM Enforced for PID {}", pid)).await;
                        } else { emit_response(cmd.id, false, "Map Error".to_string()).await; }
                    }
                },
                "UNENFORCE_PID" => {
                    if let Some(pid) = cmd.pid {
                        if let Ok(mut m) = aya::maps::HashMap::<_, u32, u32>::try_from(bpf_ref.map_mut("ENFORCEMENT_POLICY").unwrap()) {
                            let _ = m.remove(&pid);
                            emit_response(cmd.id, true, format!("LSM Enforcement removed for PID {}", pid)).await;
                        } else { emit_response(cmd.id, false, "Map Error".to_string()).await; }
                    }
                },
                "DENY_PORT" => {
                    if let Some(port) = cmd.port {
                        if let Ok(mut m) = aya::maps::HashMap::<_, u16, u8>::try_from(bpf_ref.map_mut("ALLOWED_PORTS").unwrap()) {
                            let _ = m.remove(&port);
                            emit_response(cmd.id, true, format!("Firewall: Denied port {}", port)).await;
                        } else { emit_response(cmd.id, false, "Map Error".to_string()).await; }
                    }
                },
                "LOCKDOWN" => {
                    if let Ok(mut m) = aya::maps::HashMap::<_, u32, u32>::try_from(bpf_ref.map_mut("FIREWALL_CONFIG").unwrap()) {
                        let _ = m.insert(0, 1, 0); // index 0 is lockdown flag
                        emit_response(cmd.id, true, "LOCKDOWN engaged".to_string()).await;
                    } else { emit_response(cmd.id, false, "Map Error".to_string()).await; }
                },
                "FLUSH_RULES" => {
                    let mut success = true;
                    if let Ok(mut m) = aya::maps::LpmTrie::<_, LpmKey, u32>::try_from(bpf_ref.map_mut("XDP_BLOCK_LIST").unwrap()) {
                        let keys: Vec<_> = m.iter().filter_map(|r| r.ok().map(|(k, _)| k)).collect();
                        for k in keys { let _ = m.remove(&k); }
                    } else { success = false; }
                    
                    if let Ok(mut m) = aya::maps::HashMap::<_, u16, u8>::try_from(bpf_ref.map_mut("ALLOWED_PORTS").unwrap()) {
                        let keys: Vec<_> = m.iter().filter_map(|r| r.ok().map(|(k, _)| k)).collect();
                        for k in keys { let _ = m.remove(&k); }
                    } else { success = false; }

                    if let Ok(mut m) = aya::maps::HashMap::<_, u32, u32>::try_from(bpf_ref.map_mut("FIREWALL_CONFIG").unwrap()) {
                        let _ = m.insert(0, 0, 0); // clear lockdown
                    } else { success = false; }

                    emit_response(cmd.id, success, if success { "Rules flushed".to_string() } else { "Partial flush failure".to_string() }).await;
                },
                "HIDE_PID" => {
                    if let Some(pid) = cmd.pid {
                        if let Ok(mut m) = aya::maps::HashMap::<_, u32, u32>::try_from(bpf_ref.map_mut("HIDE_CONFIG").unwrap()) {
                            let _ = m.insert(pid, 1, 0);
                            emit_response(cmd.id, true, format!("Stealth: PID {}", pid)).await;
                        } else { emit_response(cmd.id, false, "Map Error".to_string()).await; }
                    }
                },
                "GET_STATUS" => {
                    let mut blocked_ips = Vec::new();
                    if let Ok(m) = aya::maps::LpmTrie::<_, LpmKey, u32>::try_from(bpf_ref.map_mut("XDP_BLOCK_LIST").unwrap()) {
                        for res in m.iter() {
                            if let Ok((key, _)) = res {
                                let ip = std::net::Ipv4Addr::from(u32::from_be(key.data().data));
                                blocked_ips.push(format!("{}/{}", ip, key.prefix_len()));
                            }
                        }
                    }

                    let mut shadow_bans = Vec::new();
                    if let Ok(m) = aya::maps::HashMap::<_, u32, ShadowBanInfo>::try_from(bpf_ref.map_mut("SHADOW_BANS").unwrap()) {
                        for res in m.iter() {
                            if let Ok((ip_be, _)) = res {
                                let ip = std::net::Ipv4Addr::from(u32::from_be(ip_be));
                                shadow_bans.push(ip.to_string());
                            }
                        }
                    }

                    let resp = SidecarResponse {
                        id: cmd.id,
                        success: true,
                        message: Some("Active".to_string()),
                        data: Some(serde_json::json!({
                            "blocked_ips": blocked_ips,
                            "shadow_bans": shadow_bans,
                            "xdp_active": true
                        })),
                        timestamp: Utc::now().to_rfc3339(),
                    };
                    if let Ok(json) = serde_json::to_string(&resp) {
                        let _lock = STDOUT_LOCK.lock().await;
                        println!("{}", json);
                    }
                },
                "TRUST_COMM" => {
                    if let Some(comm_str) = cmd.comm {
                        if let Ok(mut m) = aya::maps::HashMap::<_, [u8; 16], u8>::try_from(bpf_ref.map_mut("TRUSTED_COMM").unwrap()) {
                            let mut comm = [0u8; 16];
                            let bytes = comm_str.as_bytes();
                            let len = std::cmp::min(bytes.len(), 16);
                            comm[..len].copy_from_slice(&bytes[..len]);
                            let _ = m.insert(comm, 1, 0);
                            emit_response(cmd.id, true, format!("Trusted Comm: {}", comm_str)).await;
                        } else { emit_response(cmd.id, false, "Map Error".to_string()).await; }
                    }
                },
                "KillProcess" => {
                    if let Some(pid) = cmd.pid {
                        let res = kill_process_task(pid).await;
                        emit_response(cmd.id, res.0, res.1).await;
                    }
                },
                "SET_LSM_POLICY" => {
                    if let Some(paths) = cmd.paths {
                        // ENHANCEMENT: Immutable Directory LSM Policy
                        if let Ok(mut m) = aya::maps::HashMap::<_, [u8; 64], u8>::try_from(bpf_ref.map_mut("IMMUTABLE_PATHS").unwrap()) {
                            for path in paths {
                                let mut p_bytes = [0u8; 64];
                                let bytes = path.as_bytes();
                                let len = std::cmp::min(bytes.len(), 64);
                                p_bytes[..len].copy_from_slice(&bytes[..len]);
                                let _ = m.insert(p_bytes, 1, 0);
                            }
                            emit_response(cmd.id, true, format!("LSM Policy updated with protected paths")).await;
                        } else {
                            emit_response(cmd.id, false, "Map Error".to_string()).await;
                        }
                    }
                },
                "QuarantineProcess" => {
                    if let Some(pid) = cmd.pid {
                        let res = quarantine_process_task(pid).await;
                        emit_response(cmd.id, res.0, res.1).await;
                    }
                },
                "DumpProcess" => {
                    if let (Some(pid), Some(path)) = (cmd.pid, cmd.path) {
                        let res = dump_process_task(pid, path).await;
                        emit_response(cmd.id, res.0, res.1).await;
                    }
                },
                "SHUTDOWN" => std::process::exit(0),
                _ => {}
            }
        }
    }
    Ok(())
}

async fn kill_process_task(pid: u32) -> (bool, String) {
    let mut sys = System::new();
    sys.refresh_process(Pid::from_u32(pid));
    if let Some(process) = sys.process(Pid::from_u32(pid)) {
        let success = process.kill();
        (success, if success { format!("Killed process {}", pid) } else { format!("Failed to kill {}", pid) })
    } else { (false, "Process not found".to_string()) }
}

async fn quarantine_process_task(pid: u32) -> (bool, String) {
    let mut sys = System::new();
    sys.refresh_process(Pid::from_u32(pid));
    if let Some(process) = sys.process(Pid::from_u32(pid)) {
        let success = process.kill_with(sysinfo::Signal::Stop).unwrap_or(false);
        (success, if success { format!("Quarantined (SIGSTOP) process {}", pid) } else { format!("Failed to stop {}", pid) })
    } else { (false, "Process not found".to_string()) }
}

async fn dump_process_task(pid: u32, requested_path: String) -> (bool, String) {
    let base_dir = "./volume/storage/forensics";
    if let Err(e) = std::fs::create_dir_all(base_dir) {
        return (false, format!("Failed to create jail directory: {}", e));
    }
    let path_obj = std::path::Path::new(&requested_path);
    let filename = match path_obj.file_name() {
        Some(name) => name.to_string_lossy(),
        None => return (false, "Invalid dump filename".to_string()),
    };
    let safe_path = format!("{}/{}", base_dir, filename);
    let maps_res = std::fs::copy(format!("/proc/{}/maps", pid), format!("{}.maps", safe_path));
    let env_res = std::fs::copy(format!("/proc/{}/environ", pid), format!("{}.environ", safe_path));
    if maps_res.is_ok() && env_res.is_ok() {
        (true, format!("Dumped process {} metadata to {}", pid, safe_path))
    } else { (false, "Failed to access /proc files or write to jail".to_string()) }
}



async fn run_dummy_mode() -> Result<(), anyhow::Error> {
    emit_response(None, true, "eBPF Sidecar Active (Dummy/Legacy Mode).".to_string()).await;
    let mut stdin = BufReader::new(io::stdin()).lines();
    while let Ok(Some(line)) = stdin.next_line().await {
        if let Ok(cmd) = serde_json::from_str::<SidecarCommand>(&line) {
            match cmd.cmd_type.as_str() {
                "GET_STATUS" => emit_response(cmd.id, true, "Active (Dummy)".to_string()).await,
                "SHUTDOWN" => std::process::exit(0),
                _ => { emit_response(cmd.id, false, "BPF Unavailable".to_string()).await; }
            }
        }
    }
    Ok(())
}

#[cfg(not(target_os = "linux"))]
#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    emit_response(None, false, "UNSUPPORTED_OS".to_string()).await;
    std::process::exit(0);
}

