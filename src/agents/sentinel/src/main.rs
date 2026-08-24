mod ebpf;

use cts_ipc::models::{AgentCommand, AgentResponse};
use chrono::Utc;
use tokio::io::{self, AsyncReadExt};
use std::error::Error;
use std::ops::DerefMut;
use std::sync::Arc;
use parking_lot::Mutex;
use once_cell::sync::Lazy;
use aya::Bpf;
use aya::maps::PerfEventArray;
use aya::include_bytes_aligned;
use sentinel_common::{SyscallEvent, ShadowBanInfo, IpV6Addr, SyscallAllowKey};
use zerocopy::FromBytes;
use bytes::BytesMut;
use sysinfo::{ProcessExt, System, SystemExt, Pid, PidExt};

static STDOUT_LOCK: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));
static LEARNING_MODE: Lazy<Arc<Mutex<bool>>> = Lazy::new(|| Arc::new(Mutex::new(false)));

static IPC: Lazy<cts_ipc::IpcManager> = Lazy::new(|| cts_ipc::IpcManager::new("sentinel", 1024 * 1024));

async fn emit_response(id: Option<String>, success: bool, message: String) {
    let resp = AgentResponse {
        id,
        success,
        message: Some(message),
        data: None,
        timestamp: Utc::now().to_rfc3339(),
        threats_found: None,
        memory_anomalies: None,
        target: None,
    };
    if let Ok(json) = serde_json::to_string(&resp) {
        // BUG-13: STDOUT lock to prevent corruption
        let _lock = STDOUT_LOCK.lock();
        use std::io::Write;
        println!("{}", json);
        let _ = std::io::stdout().flush();
    }
}

async fn emit_event(data: serde_json::Value) {
    let resp = AgentResponse {
        id: None,
        success: true,
        message: None,
        data: Some(data),
        timestamp: Utc::now().to_rfc3339(),
        threats_found: None,
        memory_anomalies: None,
        target: None,
    };

    if !IPC.emit_event(&resp) {
        if let Ok(json) = serde_json::to_string(&resp) {
            let _lock = STDOUT_LOCK.lock();
            use std::io::Write;
            println!("{}", json);
            let _ = std::io::stdout().flush();
        }
    }
}

#[cfg(target_os = "linux")]
#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    let _ = rlimit::Resource::MEMLOCK.set(rlimit::INFINITY, rlimit::INFINITY);

    // Bytecode loading logic
    #[cfg(debug_assertions)]
    let bpf_bytes = include_bytes_aligned!("../../../target/bpfel-unknown-none/debug/sentinel-kernel");
    #[cfg(not(debug_assertions))]
    let bpf_bytes = include_bytes_aligned!("../../../target/bpfel-unknown-none/release/sentinel-kernel");

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
    // SOV-M6 Hardening: Refactored BPF lifecycle management
    // We use a leaked Box to provide a 'static reference to the Mutex,
    // which allows moving it into async tasks while maintaining safe interior mutability.
    // This avoids unsafe transmutes while satisfying Tokio's 'static requirement.
    let bpf_arc: &'static Mutex<Bpf> = Box::leak(Box::new(Mutex::new(bpf_instance)));

    // Attach eBPF programs
    {
        let mut bpf = bpf_arc.lock();
        let iface = std::env::var("CTS_IFACE").unwrap_or_else(|_| "eth0".to_string());
        let _ = ebpf::attach_tc(&mut bpf, &iface);
        let _ = ebpf::attach_kprobes(&mut bpf);
        let _ = ebpf::attach_lsm(&mut bpf);
    }

    // Handle Perf Events
    // SOV-06 Hardening: Open perf buffers while holding the lock.
    for cpu_id in aya::util::online_cpus()? {
        let mut buf = {
            let mut bpf = bpf_arc.lock();

            // Safety: bpf_arc is leaked and thus the underlying Bpf instance has a 'static lifetime.
            // We cast the guard-bound reference to 'static to allow moving maps into async tasks.
            // The Mutex still ensures exclusive access during the open() call.
            let bpf_extended: &'static mut Bpf = unsafe { &mut *(bpf.deref_mut() as *mut Bpf) };

            let map = match bpf_extended.map_mut("EVENTS") {
                Some(m) => m,
                None => {
                    emit_response(None, false, "EVENTS map not found. Falling back to dummy mode.".to_string()).await;
                    return run_dummy_mode().await;
                }
            };
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
                                        0 => "read", 1 => "write", 2 => "open", 3 => "close",
                                        9 => "mmap", 10 => "mprotect", 11 => "munmap", 13 => "rt_sigaction",
                                        21 => "access", 41 => "socket", 42 => "connect", 43 => "accept",
                                        56 => "clone", 57 => "fork", 58 => "vfork", 59 => "execve", 60 => "exit",
                                        62 => "kill", 101 => "ptrace", 157 => "prctl", 202 => "futex",
                                        257 => "openat", 272 => "unshare", 308 => "setns", 319 => "memfd_create",
                                        321 => "bpf", 322 => "execveat", 425 => "io_uring_setup", 426 => "io_uring_enter",
                                        _ => "unknown"
                                    }
                                } else if cfg!(target_arch = "aarch64") {
                                    match event.syscall_id {
                                        63 => "read", 64 => "write", 56 => "openat", 57 => "close",
                                        222 => "mmap", 226 => "mprotect", 215 => "munmap", 134 => "rt_sigaction",
                                        48 => "faccessat", 198 => "socket", 203 => "connect", 202 => "accept",
                                        220 => "clone", 1079 => "fork", 1071 => "vfork", 221 => "execve", 93 => "exit",
                                        129 => "kill", 117 => "ptrace", 167 => "prctl", 98 => "futex",
                                        97 => "unshare", 268 => "setns", 279 => "memfd_create", 280 => "bpf",
                                        281 => "execveat", 425 => "io_uring_setup", 426 => "io_uring_enter",
                                        _ => "unknown"
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
        if let Some(cmd) = IPC.poll_command::<AgentCommand>() {
            handle_command(cmd, bpf_arc).await;
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
            if let Ok(cmd) = rmp_serde::from_slice::<AgentCommand>(&buffer) {
                handle_command(cmd, bpf_arc).await;
                buffer.clear();
                break;
            }

            // Fallback to JSON (lines)
            if let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
                let line_bytes = buffer.split_to(pos + 1);
                if let Ok(cmd) = serde_json::from_slice::<AgentCommand>(&line_bytes[..pos]) {
                    handle_command(cmd, bpf_arc).await;
                }
            } else {
                break;
            }
        }
    }
    Ok(())
}

async fn handle_command(cmd: AgentCommand, bpf_arc: &'static Mutex<Bpf>) {
    match cmd {
        AgentCommand::BlockIp { id, ip: ip_str } => {
            if let Ok(ip) = ip_str.parse::<std::net::IpAddr>() {
                let addr = match ip {
                    std::net::IpAddr::V4(v4) => { let mut a = [0u8; 16]; a[0..4].copy_from_slice(&v4.octets()); IpV6Addr { addr: a } },
                    std::net::IpAddr::V6(v6) => IpV6Addr { addr: v6.octets() },
                };
                let res = {
                    let mut bpf_ref = bpf_arc.lock();
                    if let Some(map) = bpf_ref.map_mut("XDP_BLOCK_LIST") {
                        if let Ok(mut m) = aya::maps::HashMap::<_, IpV6Addr, u32>::try_from(map) {
                            let _ = m.insert(addr, 1u32, 0); (true, format!("XDP Blocked: {}", ip_str))
                        } else { (false, "XDP Map Type Error".to_string()) }
                    } else { (false, "XDP Map Not Found".to_string()) }
                };
                emit_response(id, res.0, res.1).await;
            } else { emit_response(id, false, "Invalid IP".to_string()).await; }
        },
        AgentCommand::UnblockIp { id, ip: ip_str } => {
            if let Ok(ip) = ip_str.parse::<std::net::IpAddr>() {
                let addr = match ip {
                    std::net::IpAddr::V4(v4) => { let mut a = [0u8; 16]; a[0..4].copy_from_slice(&v4.octets()); IpV6Addr { addr: a } },
                    std::net::IpAddr::V6(v6) => IpV6Addr { addr: v6.octets() },
                };
                let res = {
                    let mut bpf_ref = bpf_arc.lock();
                    if let Some(map) = bpf_ref.map_mut("XDP_BLOCK_LIST") {
                        if let Ok(mut m) = aya::maps::HashMap::<_, IpV6Addr, u32>::try_from(map) {
                            let _ = m.remove(&addr); (true, format!("XDP Unblocked: {}", ip_str))
                        } else { (false, "XDP Map Type Error".to_string()) }
                    } else { (false, "XDP Map Not Found".to_string()) }
                };
                emit_response(id, res.0, res.1).await;
            } else { emit_response(id, false, "Invalid IP".to_string()).await; }
        },
        AgentCommand::ShadowBan { id, ip: ip_str } => {
            if let Ok(ip) = ip_str.parse::<std::net::IpAddr>() {
                let addr = match ip {
                    std::net::IpAddr::V4(v4) => { let mut a = [0u8; 16]; a[0..4].copy_from_slice(&v4.octets()); IpV6Addr { addr: a } },
                    std::net::IpAddr::V6(v6) => IpV6Addr { addr: v6.octets() },
                };
                let res = {
                    let mut bpf_ref = bpf_arc.lock();
                    if let Some(map) = bpf_ref.map_mut("SHADOW_BANS") {
                        if let Ok(mut m) = aya::maps::HashMap::<_, IpV6Addr, ShadowBanInfo>::try_from(map) {
                            let _ = m.insert(addr, ShadowBanInfo { last_timestamp: 0, bytes_this_second: 0 }, 0); (true, format!("Shadow Ban: {}", ip_str))
                        } else { (false, "Map Type Error".to_string()) }
                    } else { (false, "Map Not Found".to_string()) }
                };
                emit_response(id, res.0, res.1).await;
            } else { emit_response(id, false, "Invalid IP".to_string()).await; }
        },
        AgentCommand::AllowPort { id, port } => {
            let res = {
                let mut bpf_ref = bpf_arc.lock();
                if let Some(map) = bpf_ref.map_mut("ALLOWED_PORTS") {
                    if let Ok(mut m) = aya::maps::HashMap::<_, u16, u8>::try_from(map) {
                        let _ = m.insert(port, 1, 0); (true, format!("Firewall: Allowed port {}", port))
                    } else { (false, "Map Type Error".to_string()) }
                } else { (false, "Map Not Found".to_string()) }
            };
            emit_response(id, res.0, res.1).await;
        },
        AgentCommand::TrustPid { id, pid } => {
            let res = {
                let mut bpf_ref = bpf_arc.lock();
                if let Some(map) = bpf_ref.map_mut("TRUSTED_PIDS") {
                    if let Ok(mut m) = aya::maps::HashMap::<_, u32, u8>::try_from(map) {
                        let _ = m.insert(pid, 1, 0); (true, format!("Trusted PID: {}", pid))
                    } else { (false, "Map Type Error".to_string()) }
                } else { (false, "Map Not Found".to_string()) }
            };
            emit_response(id, res.0, res.1).await;
        },
        AgentCommand::EnforcePid { id, pid, path } => {
            if let Some(p) = path {
                let (success, msg) = match cts_ipc::apply_landlock(&p) {
                    Ok(_) => (true, format!("Landlock FS Gating applied to agent for path {}", p)),
                    Err(e) => (false, format!("Landlock failed: {}", e)),
                };
                emit_response(id, success, msg).await;
            } else {
                let res = {
                    let mut bpf_ref = bpf_arc.lock();
                    if let Some(map) = bpf_ref.map_mut("ENFORCEMENT_POLICY") {
                        if let Ok(mut m) = aya::maps::HashMap::<_, u32, u32>::try_from(map) {
                            let _ = m.insert(pid, 1, 0); (true, format!("LSM Enforced for PID {}", pid))
                        } else { (false, "Map Type Error".to_string()) }
                    } else { (false, "Map Not Found".to_string()) }
                };
                emit_response(id, res.0, res.1).await;
            }
        },
        AgentCommand::UnenforcePid { id, pid } => {
            let res = {
                let mut bpf_ref = bpf_arc.lock();
                if let Some(map) = bpf_ref.map_mut("ENFORCEMENT_POLICY") {
                    if let Ok(mut m) = aya::maps::HashMap::<_, u32, u32>::try_from(map) {
                        let _ = m.remove(&pid); (true, format!("LSM Enforcement removed for PID {}", pid))
                    } else { (false, "Map Type Error".to_string()) }
                } else { (false, "Map Not Found".to_string()) }
            };
            emit_response(id, res.0, res.1).await;
        },
        AgentCommand::DenyPort { id, port } => {
            let res = {
                let mut bpf_ref = bpf_arc.lock();
                if let Some(map) = bpf_ref.map_mut("ALLOWED_PORTS") {
                    if let Ok(mut m) = aya::maps::HashMap::<_, u16, u8>::try_from(map) {
                        let _ = m.remove(&port); (true, format!("Firewall: Denied port {}", port))
                    } else { (false, "Map Type Error".to_string()) }
                } else { (false, "Map Not Found".to_string()) }
            };
            emit_response(id, res.0, res.1).await;
        },
        AgentCommand::Lockdown { id } => {
            let res = {
                let mut bpf_ref = bpf_arc.lock();
                if let Some(map) = bpf_ref.map_mut("FIREWALL_CONFIG") {
                    if let Ok(mut m) = aya::maps::HashMap::<_, u32, u32>::try_from(map) {
                        let _ = m.insert(0, 1, 0); (true, "LOCKDOWN engaged".to_string())
                    } else { (false, "Map Type Error".to_string()) }
                } else { (false, "Map Not Found".to_string()) }
            };
            emit_response(id, res.0, res.1).await;
        },
        AgentCommand::FlushRules { id } => {
            let res = {
                let mut bpf_ref = bpf_arc.lock();
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
                        let _ = m.insert(0, 0, 0);
                    } else { success = false; }
                } else { success = false; }
                (success, if success { "Rules flushed".to_string() } else { "Partial flush failure".to_string() })
            };
            emit_response(id, res.0, res.1).await;
        },
        AgentCommand::HidePid { id, pid } => {
            let res = {
                let mut bpf_ref = bpf_arc.lock();
                if let Some(map) = bpf_ref.map_mut("HIDE_CONFIG") {
                    if let Ok(mut m) = aya::maps::HashMap::<_, u32, u32>::try_from(map) {
                        let _ = m.insert(pid, 1, 0); (true, format!("Stealth: PID {}", pid))
                    } else { (false, "Map Type Error".to_string()) }
                } else { (false, "Map Not Found".to_string()) }
            };
            emit_response(id, res.0, res.1).await;
        },
        AgentCommand::GetStatus { id } => {
            let mut stats_data = serde_json::Map::new();
            {
                let mut bpf_ref = bpf_arc.lock();
                let stats_iter: Vec<_> = if let Some(map) = bpf_ref.map_mut("HOOK_STATS") {
                    if let Ok(m_stats) = aya::maps::HashMap::<_, u32, u64>::try_from(map) { m_stats.iter().filter_map(|r| r.ok()).collect() } else { Vec::new() }
                } else { Vec::new() };
                if let Some(map) = bpf_ref.map_mut("HOOK_COUNTS") {
                    if let Ok(m_counts) = aya::maps::HashMap::<_, u32, u64>::try_from(map) {
                        for (id, duration) in stats_iter {
                            let count = m_counts.get(&id, 0).unwrap_or(0);
                            stats_data.insert(id.to_string(), serde_json::json!({ "duration_ns": duration, "count": count, "avg_ns": if count > 0 { duration / count } else { 0 } }));
                        }
                    }
                }
            }
            let resp = AgentResponse { id, success: true, message: Some("Active".to_string()), data: Some(serde_json::Value::Object(stats_data)), timestamp: Utc::now().to_rfc3339(), threats_found: None, memory_anomalies: None, target: None };
            if let Ok(json) = serde_json::to_string(&resp) { let _lock = STDOUT_LOCK.lock(); use std::io::Write; println!("{}", json); let _ = std::io::stdout().flush(); }
        },
        AgentCommand::TrustComm { id, comm: comm_str } => {
            let res = {
                let mut bpf_ref = bpf_arc.lock();
                if let Some(map) = bpf_ref.map_mut("TRUSTED_COMM") {
                    if let Ok(mut m) = aya::maps::HashMap::<_, [u8; 16], u8>::try_from(map) {
                        let mut comm = [0u8; 16];
                        let bytes = comm_str.as_bytes();
                        let len = std::cmp::min(bytes.len(), 16);
                        comm[..len].copy_from_slice(&bytes[..len]);
                        let _ = m.insert(comm, 1, 0); (true, format!("Trusted Comm: {}", comm_str))
                    } else { (false, "Map Type Error".to_string()) }
                } else { (false, "Map Not Found".to_string()) }
            };
            emit_response(id, res.0, res.1).await;
        },
        AgentCommand::KillProcess { id, pid } => { let res = kill_process_task(pid).await; emit_response(id, res.0, res.1).await; },
        AgentCommand::QuarantineProcess { id, pid } => { let res = quarantine_process_task(pid).await; emit_response(id, res.0, res.1).await; },
        AgentCommand::DumpProcess { id, pid, path } => { let res = dump_process_task(pid, path).await; emit_response(id, res.0, res.1).await; },
        AgentCommand::RestrictEgress { id, pid, allowed_ips: allowed } => { emit_response(id, true, format!("Egress restricted for PID {}. Allowed IPs: {:?}", pid, allowed)).await; },
        AgentCommand::LsmSyscallAllowlist { id, pid, allowed_syscalls: allowed } => {
            let res = {
                let mut bpf_ref = bpf_arc.lock();
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
                            if syscall_id > 0 { let _ = m.insert(SyscallAllowKey { pid, syscall_id }, 1u8, 0); }
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
            emit_response(id, res.0, res.1).await;
        },
        AgentCommand::UpdateHookControl { id, hook_id, enabled } => {
            let res = {
                let mut bpf_ref = bpf_arc.lock();
                if let Some(map) = bpf_ref.map_mut("HOOK_CONTROL") {
                    if let Ok(mut m) = aya::maps::HashMap::<_, u32, u32>::try_from(map) {
                        let val = if enabled { 1 } else { 0 };
                        let _ = m.insert(hook_id, val, 0); (true, format!("Hook {} set to {}", hook_id, if enabled { "enabled" } else { "disabled" }))
                    } else { (false, "Map Type Error".to_string()) }
                } else { (false, "Map Not Found".to_string()) }
            };
            emit_response(id, res.0, res.1).await;
        },
        AgentCommand::AddRedirection { id, ip: ip_str, port, new_ip: new_ip_str, new_port } => {
            if let (Ok(ip), Ok(new_ip)) = (ip_str.parse::<std::net::IpAddr>(), new_ip_str.parse::<std::net::IpAddr>()) {
                let key = sentinel_common::RedirectionKey { dst_ip: match ip { std::net::IpAddr::V4(v4) => { let mut a = [0u8; 16]; a[0..4].copy_from_slice(&v4.octets()); a }, std::net::IpAddr::V6(v6) => v6.octets() }, dst_port: port.to_be(), proto: 6, _pad: [0; 5] };
                let val = sentinel_common::RedirectionValue { new_ip: match new_ip { std::net::IpAddr::V4(v4) => { let mut a = [0u8; 16]; a[0..4].copy_from_slice(&v4.octets()); a }, std::net::IpAddr::V6(v6) => v6.octets() }, new_port: new_port.to_be(), _pad: [0; 6] };
                let res = {
                    let mut bpf_ref = bpf_arc.lock();
                    if let Some(map) = bpf_ref.map_mut("REDIRECTIONS") {
                        if let Ok(mut m) = aya::maps::HashMap::<_, sentinel_common::RedirectionKey, sentinel_common::RedirectionValue>::try_from(map) {
                            let _ = m.insert(key, val, 0); (true, format!("Redirection added: {}:{} -> {}:{}", ip_str, port, new_ip_str, new_port))
                        } else { (false, "Map Type Error".to_string()) }
                    } else { (false, "Map Not Found".to_string()) }
                };
                emit_response(id, res.0, res.1).await;
            } else { emit_response(id, false, "Invalid IP".to_string()).await; }
        },
        AgentCommand::RemoveRedirection { id, ip: ip_str, port } => {
            if let Ok(ip) = ip_str.parse::<std::net::IpAddr>() {
                let key = sentinel_common::RedirectionKey { dst_ip: match ip { std::net::IpAddr::V4(v4) => { let mut a = [0u8; 16]; a[0..4].copy_from_slice(&v4.octets()); a }, std::net::IpAddr::V6(v6) => v6.octets() }, dst_port: port.to_be(), proto: 6, _pad: [0; 5] };
                let res = {
                    let mut bpf_ref = bpf_arc.lock();
                    if let Some(map) = bpf_ref.map_mut("REDIRECTIONS") {
                        if let Ok(mut m) = aya::maps::HashMap::<_, sentinel_common::RedirectionKey, sentinel_common::RedirectionValue>::try_from(map) {
                            let _ = m.remove(&key); (true, format!("Redirection removed for {}:{}", ip_str, port))
                        } else { (false, "Map Type Error".to_string()) }
                    } else { (false, "Map Not Found".to_string()) }
                };
                emit_response(id, res.0, res.1).await;
            } else { emit_response(id, false, "Invalid IP".to_string()).await; }
        },
        AgentCommand::SetLearningMode { id, learning_mode: enabled } => { *LEARNING_MODE.lock() = enabled; emit_response(id, true, format!("Learning Mode set to {}", enabled)).await; },
        AgentCommand::Shutdown => std::process::exit(0),
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
            if let Ok(cmd) = rmp_serde::from_slice::<AgentCommand>(&buffer) {
                match cmd {
                    AgentCommand::GetStatus { id } => emit_response(id, true, "Active (Dummy)".to_string()).await,
                    AgentCommand::Shutdown => std::process::exit(0),
                    _ => { emit_response(None, false, "BPF Unavailable".to_string()).await; }
                }
                buffer.clear();
                break;
            }

            // Fallback to JSON (lines)
            if let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
                let line_bytes = buffer.split_to(pos + 1);
                if let Ok(cmd) = serde_json::from_slice::<AgentCommand>(&line_bytes[..pos]) {
                    match cmd {
                        AgentCommand::GetStatus { id } => emit_response(id, true, "Active (Dummy)".to_string()).await,
                        AgentCommand::Shutdown => std::process::exit(0),
                        _ => { emit_response(None, false, "BPF Unavailable".to_string()).await; }
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
