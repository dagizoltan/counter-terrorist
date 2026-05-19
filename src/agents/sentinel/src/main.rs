use serde::{Serialize, Deserialize};
use chrono::Utc;
use tokio::io::{self, AsyncBufReadExt, BufReader};
use std::error::Error;
use std::sync::Arc;
use parking_lot::Mutex;
use once_cell::sync::Lazy;
use aya::Bpf;
use aya::maps::PerfEventArray;
use aya::programs::{KProbe, SchedClassifier, TcAttachType, Lsm};
use aya::{include_bytes_aligned, Btf};
use sentinel_common::{SyscallEvent, ShadowBanInfo, IpV6Addr};
use zerocopy::FromBytes;
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
        // BUG-13: STDOUT lock to prevent corruption
        let _lock = STDOUT_LOCK.lock();
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
        let _lock = STDOUT_LOCK.lock();
        println!("{}", json);
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

    // BUG-20: Refactor Bpf management to use safe interior mutability
    // and 'static references for async tasks.
    let bpf_instance = match Bpf::load(bpf_bytes) {
        Ok(b) => b,
        Err(e) => {
            // SOV-06 FIX: Provide detailed diagnostic on BPF load failure
            let mut reason = format!("Failed to load BPF: {}", e);
            if let Some(os_err) = e.source().and_then(|s: &(dyn Error + 'static)| s.downcast_ref::<std::io::Error>()) {
                if os_err.kind() == std::io::ErrorKind::PermissionDenied {
                    reason = "Permission Denied: Ensure CAP_SYS_ADMIN and CAP_BPF are set.".to_string();
                }
            } else if e.to_string().contains("BTF") {
                reason = "BTF Error: Kernel lacks BTF support or /sys/kernel/btf/vmlinux is missing.".to_string();
            }
            emit_response(None, false, reason).await;
            return run_dummy_mode().await;
        }
    };
    // Leak the mutex to gain a 'static reference
    let bpf_static: &'static Mutex<Bpf> = Box::leak(Box::new(Mutex::new(bpf_instance)));

    // Attach TC
    if let Some(prog) = bpf_static.lock().program_mut("tc_ingress") {
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
        if let Some(prog) = bpf_static.lock().program_mut(name) {
            if let Ok(p) = <&mut KProbe>::try_from(prog) {
                let _ = p.load();
                let _ = p.attach(func, 0).or_else(|_| p.attach(&format!("__x64_{}", func), 0));
            }
        }
    }

    // Attach LSM
    let btf = Btf::from_sys_fs().ok();
    if let Some(btf) = &btf {
        let mut bpf = bpf_static.lock();
        if let Some(prog) = bpf.program_mut("file_open") {
            if let Ok(lsm_prog) = <&mut Lsm>::try_from(prog) {
                if let Ok(_) = lsm_prog.load("file_open", btf) {
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
    // BUG-20 FIX: Open perf buffers while holding the lock, then move the buffers
    // into the async tasks. This avoids dangling references to the Bpf instance.
    for cpu_id in aya::util::online_cpus()? {
        let mut buf = {
            let mut bpf = bpf_static.lock();

            // SECURITY: Handle lifetimes for Aya 0.12 Maps.
            // We know that bpf_static is leaked and thus has a 'static lifetime.
            // Using unsafe to transmute the Bpf reference to be 'static.
            let bpf_extended: &'static mut Bpf = unsafe { core::mem::transmute(&mut *bpf) };
            let map = bpf_extended.map_mut("EVENTS").expect("EVENTS map not found");
            let mut perf_array = PerfEventArray::try_from(map)?;

            perf_array.open(cpu_id, None)?
        };

        tokio::spawn(async move {
            let mut buffers = (0..10).map(|_| BytesMut::with_capacity(1024)).collect::<Vec<_>>();
            loop {
                match buf.read_events(&mut buffers) {
                    Ok(events) => {
                        for i in 0..events.read {
                            let data = &buffers[i];
                            if let Some(event) = SyscallEvent::read_from(&data[..std::mem::size_of::<SyscallEvent>()]) {
                                // BUG-6.1 FIX: Support ARM64 (AArch64) syscall IDs
                                let syscall = if cfg!(target_arch = "x86_64") {
                                    match event.syscall_id {
                                        101 => "ptrace", 9 => "mmap", 59 => "execve",
                                        42 => "connect", 257 => "openat", _ => "unknown"
                                    }
                                } else if cfg!(target_arch = "aarch64") {
                                    match event.syscall_id {
                                        117 => "ptrace", 222 => "mmap", 221 => "execve",
                                        203 => "connect", 56 => "openat", _ => "unknown"
                                    }
                                } else {
                                    "unknown"
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

    emit_response(None, true, "eBPF Sidecar Active.".to_string()).await;

    let mut stdin = BufReader::new(io::stdin()).lines();
    while let Ok(Some(line)) = stdin.next_line().await {
        if let Ok(cmd) = serde_json::from_str::<SidecarCommand>(&line) {
            let mut bpf_ref = bpf_static.lock();
            match cmd.cmd_type.as_str() {
                "BLOCK_IP" => {
                    if let Some(ip_str) = cmd.ip {
                        if let Ok(ip) = ip_str.parse::<std::net::IpAddr>() {
                            let addr = match ip {
                                std::net::IpAddr::V4(v4) => {
                                    let mut a = [0u8; 16];
                                    a[0..4].copy_from_slice(&v4.octets());
                                    IpV6Addr { addr: a }
                                },
                                std::net::IpAddr::V6(v6) => IpV6Addr { addr: v6.octets() },
                            };
                            if let Ok(mut m) = aya::maps::HashMap::<_, IpV6Addr, u32>::try_from(bpf_ref.map_mut("XDP_BLOCK_LIST").unwrap()) {
                                let _ = m.insert(addr, 1u32, 0);
                                emit_response(cmd.id, true, format!("XDP Blocked: {}", ip_str)).await;
                            } else { emit_response(cmd.id, false, "XDP Map Error".to_string()).await; }
                        } else { emit_response(cmd.id, false, "Invalid IP".to_string()).await; }
                    }
                },
                "UNBLOCK_IP" => {
                    if let Some(ip_str) = cmd.ip {
                        if let Ok(ip) = ip_str.parse::<std::net::IpAddr>() {
                            let addr = match ip {
                                std::net::IpAddr::V4(v4) => {
                                    let mut a = [0u8; 16];
                                    a[0..4].copy_from_slice(&v4.octets());
                                    IpV6Addr { addr: a }
                                },
                                std::net::IpAddr::V6(v6) => IpV6Addr { addr: v6.octets() },
                            };
                            if let Ok(mut m) = aya::maps::HashMap::<_, IpV6Addr, u32>::try_from(bpf_ref.map_mut("XDP_BLOCK_LIST").unwrap()) {
                                let _ = m.remove(&addr);
                                emit_response(cmd.id, true, format!("XDP Unblocked: {}", ip_str)).await;
                            } else { emit_response(cmd.id, false, "XDP Map Error".to_string()).await; }
                        } else { emit_response(cmd.id, false, "Invalid IP".to_string()).await; }
                    }
                },
                "SHADOW_BAN" => {
                    if let Some(ip_str) = cmd.ip {
                        if let Ok(ip) = ip_str.parse::<std::net::IpAddr>() {
                            let addr = match ip {
                                std::net::IpAddr::V4(v4) => {
                                    let mut a = [0u8; 16];
                                    a[0..4].copy_from_slice(&v4.octets());
                                    IpV6Addr { addr: a }
                                },
                                std::net::IpAddr::V6(v6) => IpV6Addr { addr: v6.octets() },
                            };
                            if let Ok(mut m) = aya::maps::HashMap::<_, IpV6Addr, ShadowBanInfo>::try_from(bpf_ref.map_mut("SHADOW_BANS").unwrap()) {
                                let _ = m.insert(addr, ShadowBanInfo { last_timestamp: 0, bytes_this_second: 0 }, 0);
                                emit_response(cmd.id, true, format!("Shadow Ban: {}", ip_str)).await;
                            } else { emit_response(cmd.id, false, "Map Error".to_string()).await; }
                        } else { emit_response(cmd.id, false, "Invalid IP".to_string()).await; }
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
                    if let Ok(mut m) = aya::maps::HashMap::<_, u32, u32>::try_from(bpf_ref.map_mut("XDP_BLOCK_LIST").unwrap()) {
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
                "GET_STATUS" => emit_response(cmd.id, true, "Active".to_string()).await,
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
    match (maps_res, env_res) {
        (Ok(_), Ok(_)) => (true, format!("Dumped process {} metadata to {}", pid, safe_path)),
        (Err(e), _) | (_, Err(e)) => (false, format!("Forensic dump failed for PID {}: {}", pid, e))
    }
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

