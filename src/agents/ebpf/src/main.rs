use serde::Serialize;
use chrono::Utc;
use std::io::{self, BufRead};
use tokio::time::{self, Duration};

#[derive(Serialize)]
struct SyscallEventJson {
    #[serde(rename = "type")]
    event_type: String,
    pid: u32,
    comm: String,
    syscall: String,
    timestamp: String,
}

#[cfg(target_os = "linux")]
#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    use aya::maps::PerfEventArray;
    use aya::programs::{KProbe, SchedClassifier, TcAttachType, Lsm};
    use aya::{include_bytes_aligned, Bpf, Btf};
    use bytes::BytesMut;
    use ebpf_common::{SyscallEvent, ShadowBanInfo};
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct SidecarCommand {
        #[serde(rename = "type")]
        cmd_type: String,
        ip: Option<String>,
    }

    env_logger::init();

    // Bump RLIMIT_MEMLOCK (required for BPF maps)
    if let Err(e) = rlimit::Resource::MEMLOCK.set(rlimit::INFINITY, rlimit::INFINITY) {
        eprintln!("failed to set RLIMIT_MEMLOCK: {}", e);
    }

    #[cfg(debug_assertions)]
    let bpf_bytes = include_bytes_aligned!("../../target/bpfel-unknown-none/debug/ebpf");
    #[cfg(not(debug_assertions))]
    let bpf_bytes = include_bytes_aligned!("../../target/bpfel-unknown-none/release/ebpf");

    let mut bpf = match Bpf::load(bpf_bytes) {
        Ok(b) => b,
        Err(e) => {
            let err_json = serde_json::json!({
                "type": "ERROR",
                "message": format!("Critical: Failed to load BPF object. ELF parsing or kernel mismatch: {}", e),
                "timestamp": Utc::now().to_rfc3339()
            });
            println!("{}", err_json.to_string());
            eprintln!("[EBPF] Critical: Failed to load BPF object. ELF parsing or kernel mismatch: {}", e);
            loop { time::sleep(Duration::from_secs(3600)).await; }
        }
    };

    // Attach TC program
    let tc_prog: &mut SchedClassifier = bpf.program_mut("tc_ingress").unwrap().try_into()?;
    tc_prog.load()?;
    let iface = "eth0";
    if let Err(e) = tc_prog.attach(iface, TcAttachType::Ingress) {
        eprintln!("[EBPF] Failed to attach to {}, trying lo: {}", iface, e);
        let _ = tc_prog.attach("lo", TcAttachType::Ingress);
    }

    let program_ptrace: &mut KProbe = bpf.program_mut("kprobe_ptrace").unwrap().try_into()?;
    program_ptrace.load()?;
    program_ptrace.attach("sys_ptrace", 0).or_else(|_| program_ptrace.attach("__x64_sys_ptrace", 0)).ok();

    let program_mmap: &mut KProbe = bpf.program_mut("kprobe_mmap").unwrap().try_into()?;
    program_mmap.load()?;
    program_mmap.attach("sys_mmap", 0).or_else(|_| program_mmap.attach("__x64_sys_mmap", 0)).ok();

    let program_execve: &mut KProbe = bpf.program_mut("kprobe_execve").unwrap().try_into()?;
    program_execve.load()?;
    program_execve.attach("sys_execve", 0).or_else(|_| program_execve.attach("__x64_sys_execve", 0)).ok();

    // Attach LSM program (if supported by kernel)
    if let Some(prog) = bpf.program_mut("lsm_file_open") {
        let lsm_prog: &mut Lsm = prog.try_into()?;
        let btf = Btf::from_sys_fs().ok();
        if let Some(btf) = btf {
            if let Ok(_) = lsm_prog.load("file_open", &btf) {
                if let Err(e) = lsm_prog.attach() {
                    eprintln!("[EBPF] LSM attachment failed: {}", e);
                } else {
                    println!("[EBPF] Kernel LSM Enforcement Active: Zero-Trust policies enabled.");
                }
            }
        } else {
            eprintln!("[EBPF] LSM skipped: BTF not found in sysfs.");
        }
    }

    // Leak BPF so it has 'static lifetime for spawns
    let bpf = Box::leak(Box::new(bpf));
    let bpf_ptr: *mut Bpf = bpf;

    println!(r#"[EBPF] eBPF Sidecar Active. Monitoring syscalls & traffic shaping..."#);

    // Command Handler (from Orchestrator)
    let mut shadow_bans: aya::maps::HashMap<_, u32, ShadowBanInfo> = unsafe { 
        aya::maps::HashMap::try_from((*bpf_ptr).map_mut("SHADOW_BANS").unwrap())? 
    };

    tokio::spawn(async move {
        let stdin = io::stdin();
        for line in stdin.lock().lines() {
            if let Ok(line) = line {
                if let Ok(cmd) = serde_json::from_str::<SidecarCommand>(&line) {
                    if cmd.cmd_type == "SHADOW_BAN" && cmd.ip.is_some() {
                        let ip_str = cmd.ip.unwrap();
                        if let Ok(ip) = ip_str.parse::<std::net::Ipv4Addr>() {
                            let ip_u32 = u32::from(ip).to_be();
                            let info = ShadowBanInfo { last_timestamp: 0, bytes_this_second: 0 };
                            let _ = shadow_bans.insert(ip_u32, info, 0);
                            println!(r#"{{"type":"INFO","message":"Shadow Ban active for {}"}}"#, ip_str);
                        }
                    } else if cmd.cmd_type == "SHUTDOWN" {
                        std::process::exit(0);
                    }
                }
            }
        }
    });

    let mut perf_array = unsafe { 
        PerfEventArray::try_from((*bpf_ptr).map_mut("EVENTS").unwrap())? 
    };

    for cpu_id in aya::util::online_cpus()? {
        let mut buf = perf_array.open(cpu_id, None)?;
        tokio::spawn(async move {
            let mut buffers = (0..10)
                .map(|_| BytesMut::with_capacity(std::mem::size_of::<SyscallEvent>()))
                .collect::<Vec<_>>();

            loop {
                time::sleep(Duration::from_millis(100)).await;
                if let Ok(events) = buf.read_events(&mut buffers) {
                    for i in 0..events.read {
                        let data = buffers[i].as_ptr() as *const SyscallEvent;
                        let event = unsafe { &*data };
                        let syscall_name = match event.syscall_id { 1 => "ptrace", 2 => "mmap", 3 => "execve", _ => "unknown" };
                        let comm = std::str::from_utf8(&event.comm).unwrap_or("unknown").trim_end_matches('\0');

                        let json_event = SyscallEventJson {
                            event_type: "SYSCALL_EVENT".to_string(),
                            pid: event.pid,
                            comm: comm.to_string(),
                            syscall: syscall_name.to_string(),
                            timestamp: Utc::now().to_rfc3339(),
                        };
                        if let Ok(json) = serde_json::to_string(&json_event) { println!("{}", json); }
                    }
                }
            }
        });
    }

    loop {
        time::sleep(Duration::from_secs(60)).await;
    }
}

#[cfg(not(target_os = "linux"))]
#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    println!("[EBPF] UNSUPPORTED_OS: eBPF is only supported on Linux.");
    
    // Listen for shutdown so we don't block the orchestrator unnecessarily, 
    // but we can exit cleanly immediately.
    std::process::exit(0);
}
