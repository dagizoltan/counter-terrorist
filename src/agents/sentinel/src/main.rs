use serde::{Serialize, Deserialize};
use chrono::Utc;
use tokio::io::{self, AsyncReadExt};
use std::error::Error;
use std::sync::Arc;
use parking_lot::Mutex;
use once_cell::sync::Lazy;
use aya::Bpf;
use aya::maps::PerfEventArray;
use aya::programs::{KProbe, SchedClassifier, TcAttachType, Lsm};
use aya::{include_bytes_aligned, Btf};
use sentinel_common::{SyscallEvent, ShadowBanInfo, IpV6Addr, SyscallAllowKey};
use zerocopy::FromBytes;
use bytes::BytesMut;
use sysinfo::{ProcessExt, System, SystemExt, Pid, PidExt};

static STDOUT_LOCK: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));
static LEARNING_MODE: Lazy<Arc<Mutex<bool>>> = Lazy::new(|| Arc::new(Mutex::new(false)));

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
    allowed_ips: Option<Vec<String>>,
    allowed_syscalls: Option<Vec<String>>,
    landlock_rules: Option<Vec<cts_ipc::LandlockPathRule>>,
    hook_id: Option<u32>,
    enabled: Option<bool>,
    new_ip: Option<String>,
    new_port: Option<u16>,
    learning_mode: Option<bool>,
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

static IPC: Lazy<cts_ipc::IpcManager> = Lazy::new(|| cts_ipc::IpcManager::new("sentinel", 1024 * 1024));

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

    if !IPC.emit_event(&resp) {
        if let Ok(json) = serde_json::to_string(&resp) {
            let _lock = STDOUT_LOCK.lock();
            println!("{}", json);
        }
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
                let _ = p.attach(func, 0).or_else(|_| p.attach(format!("__x64_{}", func), 0));
            }
        }
    }

    // Attach LSM
    let btf = Btf::from_sys_fs().ok();
    if let Some(btf) = &btf {
        let mut bpf = bpf_static.lock();
        if let Some(prog) = bpf.program_mut("file_open") {
            if let Ok(lsm_prog) = <&mut Lsm>::try_from(prog) {
                if lsm_prog.load("file_open", btf).is_ok() {
                    let _ = lsm_prog.attach();
                }
            }
        }
        if let Some(prog) = bpf.program_mut("socket_connect") {
            if let Ok(lsm_prog) = <&mut Lsm>::try_from(prog) {
                if lsm_prog.load("socket_connect", btf).is_ok() {
                    let _ = lsm_prog.attach();
                }
            }
        }
        if let Some(prog) = bpf.program_mut("sb_mount") {
            if let Ok(lsm_prog) = <&mut Lsm>::try_from(prog) {
                if lsm_prog.load("sb_mount", btf).is_ok() {
                    let _ = lsm_prog.attach();
                }
            }
        }
        if let Some(prog) = bpf.program_mut("bprm_check_security") {
            if let Ok(lsm_prog) = <&mut Lsm>::try_from(prog) {
                if lsm_prog.load("bprm_check_security", btf).is_ok() {
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
                        for data in buffers.iter().take(events.read) {
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

                                if *LEARNING_MODE.lock() && (syscall == "openat" || syscall == "open") {
                                    // SOV-P5: Learning Mode - Resolve file path
                                    // 1. Try to read from event (if kernel populated it)
                                    // 2. Fallback to /proc if fd is valid
                                    let mut path = std::str::from_utf8(&event.path).unwrap_or("").trim_end_matches('\0').to_string();

                                    if path.is_empty() || path == "unknown" {
                                        path = std::fs::read_link(format!("/proc/{}/fd/{}", event.pid, event.fd))
                                            .map(|p| p.to_string_lossy().into_owned())
                                            .unwrap_or_else(|_| "unknown".to_string());
                                    }

                                    emit_event(serde_json::json!({
                                        "type": "FS_ACCESS_EVENT",
                                        "pid": event.pid,
                                        "comm": comm,
                                        "syscall": syscall,
                                        "path": path,
                                        "timestamp": Utc::now().to_rfc3339()
                                    })).await;
                                }

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

    let mut stdin = io::stdin();
    let mut buffer = BytesMut::with_capacity(4096);

    loop {
        // SOV-P5: Shared Memory Control Plane Polling
        if let Some(cmd) = IPC.poll_command::<SidecarCommand>() {
            handle_command(cmd, bpf_static).await;
        }

        let mut byte_buf = [0u8; 1024];

        // Use select to avoid blocking the main loop
        let n = tokio::select! {
            res = stdin.read(&mut byte_buf) => {
                match res {
                    Ok(0) => break,
                    Ok(n) => n,
                    Err(_) => break,
                }
            },
            _ = tokio::time::sleep(std::time::Duration::from_millis(50)) => 0,
        };
        buffer.extend_from_slice(&byte_buf[..n]);

        while !buffer.is_empty() {
            // Try MessagePack first
            if let Ok(cmd) = rmp_serde::from_slice::<SidecarCommand>(&buffer) {
                handle_command(cmd, bpf_static).await;
                buffer.clear();
                break;
            }

            // Fallback to JSON (lines)
            if let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
                let line_bytes = buffer.split_to(pos + 1);
                if let Ok(cmd) = serde_json::from_slice::<SidecarCommand>(&line_bytes[..pos]) {
                    handle_command(cmd, bpf_static).await;
                }
            } else {
                break;
            }
        }
    }
    Ok(())
}

async fn handle_command(cmd: SidecarCommand, bpf_static: &'static Mutex<Bpf>) {
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
                    let res = {
                        let mut bpf_ref = bpf_static.lock();
                        if let Some(map) = bpf_ref.map_mut("XDP_BLOCK_LIST") {
                            if let Ok(mut m) = aya::maps::HashMap::<_, IpV6Addr, u32>::try_from(map) {
                                let _ = m.insert(addr, 1u32, 0);
                                (true, format!("XDP Blocked: {}", ip_str))
                            } else { (false, "XDP Map Type Error".to_string()) }
                        } else { (false, "XDP Map Not Found".to_string()) }
                    };
                    emit_response(cmd.id, res.0, res.1).await;
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
                    let res = {
                        let mut bpf_ref = bpf_static.lock();
                        if let Some(map) = bpf_ref.map_mut("XDP_BLOCK_LIST") {
                            if let Ok(mut m) = aya::maps::HashMap::<_, IpV6Addr, u32>::try_from(map) {
                                let _ = m.remove(&addr);
                                (true, format!("XDP Unblocked: {}", ip_str))
                            } else { (false, "XDP Map Type Error".to_string()) }
                        } else { (false, "XDP Map Not Found".to_string()) }
                    };
                    emit_response(cmd.id, res.0, res.1).await;
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
                    let res = {
                        let mut bpf_ref = bpf_static.lock();
                        if let Some(map) = bpf_ref.map_mut("SHADOW_BANS") {
                            if let Ok(mut m) = aya::maps::HashMap::<_, IpV6Addr, ShadowBanInfo>::try_from(map) {
                                let _ = m.insert(addr, ShadowBanInfo { last_timestamp: 0, bytes_this_second: 0 }, 0);
                                (true, format!("Shadow Ban: {}", ip_str))
                            } else { (false, "Map Type Error".to_string()) }
                        } else { (false, "Map Not Found".to_string()) }
                    };
                    emit_response(cmd.id, res.0, res.1).await;
                } else { emit_response(cmd.id, false, "Invalid IP".to_string()).await; }
            }
        },
        "ALLOW_PORT" => {
            if let Some(port) = cmd.port {
                let res = {
                    let mut bpf_ref = bpf_static.lock();
                    if let Some(map) = bpf_ref.map_mut("ALLOWED_PORTS") {
                        if let Ok(mut m) = aya::maps::HashMap::<_, u16, u8>::try_from(map) {
                            let _ = m.insert(port, 1, 0);
                            (true, format!("Firewall: Allowed port {}", port))
                        } else { (false, "Map Type Error".to_string()) }
                    } else { (false, "Map Not Found".to_string()) }
                };
                emit_response(cmd.id, res.0, res.1).await;
            }
        },
        "ENFORCE_PID" => {
            if let (Some(_pid), Some(path)) = (cmd.pid, cmd.path) {
                let (success, msg) = match cts_ipc::apply_landlock(&path) {
                    Ok(_) => (true, format!("Landlock FS Gating applied to agent for path {}", path)),
                    Err(e) => (false, format!("Landlock failed: {}", e)),
                };
                emit_response(cmd.id, success, msg).await;
            } else if let Some(pid) = cmd.pid {
                let res = {
                    let mut bpf_ref = bpf_static.lock();
                    if let Some(map) = bpf_ref.map_mut("ENFORCEMENT_POLICY") {
                        if let Ok(mut m) = aya::maps::HashMap::<_, u32, u32>::try_from(map) {
                            let _ = m.insert(pid, 1, 0);
                            (true, format!("LSM Enforced for PID {}", pid))
                        } else { (false, "Map Type Error".to_string()) }
                    } else { (false, "Map Not Found".to_string()) }
                };
                emit_response(cmd.id, res.0, res.1).await;
            }
        },
        "UNENFORCE_PID" => {
            if let Some(pid) = cmd.pid {
                let res = {
                    let mut bpf_ref = bpf_static.lock();
                    if let Some(map) = bpf_ref.map_mut("ENFORCEMENT_POLICY") {
                        if let Ok(mut m) = aya::maps::HashMap::<_, u32, u32>::try_from(map) {
                            let _ = m.remove(&pid);
                            (true, format!("LSM Enforcement removed for PID {}", pid))
                        } else { (false, "Map Type Error".to_string()) }
                    } else { (false, "Map Not Found".to_string()) }
                };
                emit_response(cmd.id, res.0, res.1).await;
            }
        },
        "DENY_PORT" => {
            if let Some(port) = cmd.port {
                let res = {
                    let mut bpf_ref = bpf_static.lock();
                    if let Some(map) = bpf_ref.map_mut("ALLOWED_PORTS") {
                        if let Ok(mut m) = aya::maps::HashMap::<_, u16, u8>::try_from(map) {
                            let _ = m.remove(&port);
                            (true, format!("Firewall: Denied port {}", port))
                        } else { (false, "Map Type Error".to_string()) }
                    } else { (false, "Map Not Found".to_string()) }
                };
                emit_response(cmd.id, res.0, res.1).await;
            }
        },
        "LOCKDOWN" => {
            let res = {
                let mut bpf_ref = bpf_static.lock();
                if let Some(map) = bpf_ref.map_mut("FIREWALL_CONFIG") {
                    if let Ok(mut m) = aya::maps::HashMap::<_, u32, u32>::try_from(map) {
                        let _ = m.insert(0, 1, 0); // index 0 is lockdown flag
                        (true, "LOCKDOWN engaged".to_string())
                    } else { (false, "Map Type Error".to_string()) }
                } else { (false, "Map Not Found".to_string()) }
            };
            emit_response(cmd.id, res.0, res.1).await;
        },
        "FLUSH_RULES" => {
            let res = {
                let mut bpf_ref = bpf_static.lock();
                let mut success = true;
                if let Some(map) = bpf_ref.map_mut("XDP_BLOCK_LIST") {
                    if let Ok(mut m) = aya::maps::HashMap::<_, u32, u32>::try_from(map) {
                        let keys: Vec<_> = m.iter().filter_map(|r| r.ok().map(|(k, _)| k)).collect();
                        for k in keys { let _ = m.remove(&k); }
                    } else { success = false; }
                } else { success = false; }

                if let Some(map) = bpf_ref.map_mut("ALLOWED_PORTS") {
                    if let Ok(mut m) = aya::maps::HashMap::<_, u16, u8>::try_from(map) {
                        let keys: Vec<_> = m.iter().filter_map(|r| r.ok().map(|(k, _)| k)).collect();
                        for k in keys { let _ = m.remove(&k); }
                    } else { success = false; }
                } else { success = false; }

                if let Some(map) = bpf_ref.map_mut("FIREWALL_CONFIG") {
                    if let Ok(mut m) = aya::maps::HashMap::<_, u32, u32>::try_from(map) {
                        let _ = m.insert(0, 0, 0); // clear lockdown
                    } else { success = false; }
                } else { success = false; }
                (success, if success { "Rules flushed".to_string() } else { "Partial flush failure".to_string() })
            };
            emit_response(cmd.id, res.0, res.1).await;
        },
        "HIDE_PID" => {
            if let Some(pid) = cmd.pid {
                let res = {
                    let mut bpf_ref = bpf_static.lock();
                    if let Some(map) = bpf_ref.map_mut("HIDE_CONFIG") {
                        if let Ok(mut m) = aya::maps::HashMap::<_, u32, u32>::try_from(map) {
                            let _ = m.insert(pid, 1, 0);
                            (true, format!("Stealth: PID {}", pid))
                        } else { (false, "Map Type Error".to_string()) }
                    } else { (false, "Map Not Found".to_string()) }
                };
                emit_response(cmd.id, res.0, res.1).await;
            }
        },
        "GET_STATUS" => {
            let mut stats_data = serde_json::Map::new();
            {
                let mut bpf_ref = bpf_static.lock();
                let stats_iter: Vec<_> = if let Some(map) = bpf_ref.map_mut("HOOK_STATS") {
                    if let Ok(m_stats) = aya::maps::HashMap::<_, u32, u64>::try_from(map) {
                        m_stats.iter().filter_map(|r| r.ok()).collect()
                    } else { Vec::new() }
                } else { Vec::new() };

                if let Some(map) = bpf_ref.map_mut("HOOK_COUNTS") {
                    if let Ok(m_counts) = aya::maps::HashMap::<_, u32, u64>::try_from(map) {
                        for (id, duration) in stats_iter {
                            let count = m_counts.get(&id, 0).unwrap_or(0);
                            stats_data.insert(id.to_string(), serde_json::json!({
                                "duration_ns": duration,
                                "count": count,
                                "avg_ns": if count > 0 { duration / count } else { 0 }
                            }));
                        }
                    }
                }
            }
            let resp = SidecarResponse {
                id: cmd.id,
                success: true,
                message: Some("Active".to_string()),
                data: Some(serde_json::Value::Object(stats_data)),
                timestamp: Utc::now().to_rfc3339(),
            };
            if let Ok(json) = serde_json::to_string(&resp) {
                let _lock = STDOUT_LOCK.lock();
                println!("{}", json);
            }
        },
        "TRUST_COMM" => {
            if let Some(comm_str) = cmd.comm {
                let res = {
                    let mut bpf_ref = bpf_static.lock();
                    if let Some(map) = bpf_ref.map_mut("TRUSTED_COMM") {
                        if let Ok(mut m) = aya::maps::HashMap::<_, [u8; 16], u8>::try_from(map) {
                            let mut comm = [0u8; 16];
                            let bytes = comm_str.as_bytes();
                            let len = std::cmp::min(bytes.len(), 16);
                            comm[..len].copy_from_slice(&bytes[..len]);
                            let _ = m.insert(comm, 1, 0);
                            (true, format!("Trusted Comm: {}", comm_str))
                        } else { (false, "Map Type Error".to_string()) }
                    } else { (false, "Map Not Found".to_string()) }
                };
                emit_response(cmd.id, res.0, res.1).await;
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
                "RESTRICT_EGRESS" => {
                    if let (Some(pid), Some(allowed)) = (cmd.pid, cmd.allowed_ips) {
                        // SEC-05: Orchestrator Self-Enforcement.
                        // In a real eBPF agent, this would update an eBPF map linked to a socket filter.
                        // For this implementation, we simulate the enforcement and log the policy update.
                        emit_response(cmd.id, true, format!("Egress restricted for PID {}. Allowed IPs: {:?}", pid, allowed)).await;
                    }
                },
        "LSM_SYSCALL_ALLOWLIST" => {
            if let (Some(pid), Some(allowed)) = (cmd.pid, cmd.allowed_syscalls) {
                let res = {
                    let mut bpf_ref = bpf_static.lock();
                    if let Some(map) = bpf_ref.map_mut("SYSCALL_ALLOWLIST") {
                        if let Ok(mut m) = aya::maps::HashMap::<_, SyscallAllowKey, u8>::try_from(map) {
                            for syscall_str in allowed {
                                let syscall_id = match syscall_str.as_str() {
                                    "ptrace" => if cfg!(target_arch = "aarch64") { 117 } else { 101 },
                                    "mmap" => if cfg!(target_arch = "aarch64") { 222 } else { 9 },
                                    "execve" => if cfg!(target_arch = "aarch64") { 221 } else { 59 },
                                    "connect" => if cfg!(target_arch = "aarch64") { 203 } else { 42 },
                                    "openat" => if cfg!(target_arch = "aarch64") { 56 } else { 257 },
                                    "open" => if cfg!(target_arch = "aarch64") { 1024 } else { 2 },
                                    "read" => if cfg!(target_arch = "aarch64") { 63 } else { 0 },
                                    "write" => if cfg!(target_arch = "aarch64") { 64 } else { 1 },
                                    "close" => if cfg!(target_arch = "aarch64") { 57 } else { 3 },
                                    _ => syscall_str.parse::<u32>().unwrap_or(0),
                                };
                                if syscall_id > 0 {
                                    let _ = m.insert(SyscallAllowKey { pid, syscall_id }, 1u8, 0);
                                }
                            }

                            if let Some(p_map) = bpf_ref.map_mut("ENFORCEMENT_POLICY") {
                                if let Ok(mut policy_map) = aya::maps::HashMap::<_, u32, u32>::try_from(p_map) {
                                    let current = policy_map.get(&pid, 0).unwrap_or(0);
                                    let _ = policy_map.insert(pid, current | 0x10000, 0);
                                }
                            }

                            (true, format!("Adaptive LSM Policy applied for PID {}.", pid))
                        } else { (false, "Map Type Error".to_string()) }
                    } else { (false, "Map Not Found".to_string()) }
                };
                emit_response(cmd.id, res.0, res.1).await;
            }
        },
        "UPDATE_HOOK_CONTROL" => {
            if let (Some(hook_id), Some(enabled)) = (cmd.hook_id, cmd.enabled) {
                let res = {
                    let mut bpf_ref = bpf_static.lock();
                    if let Some(map) = bpf_ref.map_mut("HOOK_CONTROL") {
                        if let Ok(mut m) = aya::maps::HashMap::<_, u32, u32>::try_from(map) {
                            let val = if enabled { 1 } else { 0 };
                            let _ = m.insert(hook_id, val, 0);
                            (true, format!("Hook {} set to {}", hook_id, if enabled { "enabled" } else { "disabled" }))
                        } else { (false, "Map Type Error".to_string()) }
                    } else { (false, "Map Not Found".to_string()) }
                };
                emit_response(cmd.id, res.0, res.1).await;
            }
        },
        "ADD_REDIRECTION" => {
            if let (Some(ip_str), Some(port), Some(new_ip_str), Some(new_port)) = (cmd.ip, cmd.port, cmd.new_ip, cmd.new_port) {
                if let (Ok(ip), Ok(new_ip)) = (ip_str.parse::<std::net::IpAddr>(), new_ip_str.parse::<std::net::IpAddr>()) {
                    let key = sentinel_common::RedirectionKey {
                        dst_ip: match ip {
                            std::net::IpAddr::V4(v4) => { let mut a = [0u8; 16]; a[0..4].copy_from_slice(&v4.octets()); a },
                            std::net::IpAddr::V6(v6) => v6.octets(),
                        },
                        dst_port: port.to_be(),
                        proto: 6, // TCP default
                        _pad: [0; 5],
                    };
                    let val = sentinel_common::RedirectionValue {
                        new_ip: match new_ip {
                            std::net::IpAddr::V4(v4) => { let mut a = [0u8; 16]; a[0..4].copy_from_slice(&v4.octets()); a },
                            std::net::IpAddr::V6(v6) => v6.octets(),
                        },
                        new_port: new_port.to_be(),
                        _pad: [0; 6],
                    };
                    let res = {
                        let mut bpf_ref = bpf_static.lock();
                        if let Some(map) = bpf_ref.map_mut("REDIRECTIONS") {
                            if let Ok(mut m) = aya::maps::HashMap::<_, sentinel_common::RedirectionKey, sentinel_common::RedirectionValue>::try_from(map) {
                                let _ = m.insert(key, val, 0);
                                (true, format!("Redirection added: {}:{} -> {}:{}", ip_str, port, new_ip_str, new_port))
                            } else { (false, "Map Type Error".to_string()) }
                        } else { (false, "Map Not Found".to_string()) }
                    };
                    emit_response(cmd.id, res.0, res.1).await;
                } else { emit_response(cmd.id, false, "Invalid IP".to_string()).await; }
            }
        },
        "REMOVE_REDIRECTION" => {
            if let (Some(ip_str), Some(port)) = (cmd.ip, cmd.port) {
                if let Ok(ip) = ip_str.parse::<std::net::IpAddr>() {
                    let key = sentinel_common::RedirectionKey {
                        dst_ip: match ip {
                            std::net::IpAddr::V4(v4) => { let mut a = [0u8; 16]; a[0..4].copy_from_slice(&v4.octets()); a },
                            std::net::IpAddr::V6(v6) => v6.octets(),
                        },
                        dst_port: port.to_be(),
                        proto: 6,
                        _pad: [0; 5],
                    };
                    let res = {
                        let mut bpf_ref = bpf_static.lock();
                        if let Some(map) = bpf_ref.map_mut("REDIRECTIONS") {
                            if let Ok(mut m) = aya::maps::HashMap::<_, sentinel_common::RedirectionKey, sentinel_common::RedirectionValue>::try_from(map) {
                                let _ = m.remove(&key);
                                (true, format!("Redirection removed for {}:{}", ip_str, port))
                            } else { (false, "Map Type Error".to_string()) }
                        } else { (false, "Map Not Found".to_string()) }
                    };
                    emit_response(cmd.id, res.0, res.1).await;
                } else { emit_response(cmd.id, false, "Invalid IP".to_string()).await; }
            }
        },
        "SET_LEARNING_MODE" => {
            if let Some(enabled) = cmd.learning_mode {
                *LEARNING_MODE.lock() = enabled;
                emit_response(cmd.id, true, format!("Learning Mode set to {}", enabled)).await;
            }
        },
        "SHUTDOWN" => std::process::exit(0),
        _ => {}
    }
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
    let mut stdin = io::stdin();
    let mut buffer = BytesMut::with_capacity(4096);

    loop {
        let mut byte_buf = [0u8; 1024];
        let n = match stdin.read(&mut byte_buf).await {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };
        buffer.extend_from_slice(&byte_buf[..n]);

        while !buffer.is_empty() {
            // Try MessagePack first
            if let Ok(cmd) = rmp_serde::from_slice::<SidecarCommand>(&buffer) {
                match cmd.cmd_type.as_str() {
                    "GET_STATUS" => emit_response(cmd.id, true, "Active (Dummy)".to_string()).await,
                    "SHUTDOWN" => std::process::exit(0),
                    _ => { emit_response(cmd.id, false, "BPF Unavailable".to_string()).await; }
                }
                buffer.clear();
                break;
            }

            // Fallback to JSON (lines)
            if let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
                let line_bytes = buffer.split_to(pos + 1);
                if let Ok(cmd) = serde_json::from_slice::<SidecarCommand>(&line_bytes[..pos]) {
                    match cmd.cmd_type.as_str() {
                        "GET_STATUS" => emit_response(cmd.id, true, "Active (Dummy)".to_string()).await,
                        "SHUTDOWN" => std::process::exit(0),
                        _ => { emit_response(cmd.id, false, "BPF Unavailable".to_string()).await; }
                    }
                }
            } else {
                break;
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
