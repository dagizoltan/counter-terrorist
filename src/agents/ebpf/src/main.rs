use serde::{Serialize, Deserialize};
use chrono::Utc;
use tokio::io::{self, AsyncBufReadExt, BufReader};
use tokio::time::{self, Duration};
use std::sync::Arc;
use tokio::sync::Mutex;
use once_cell::sync::Lazy;

static STDOUT_LOCK: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));

#[derive(Serialize, Deserialize, Debug)]
struct SidecarCommand {
    id: Option<String>,
    #[serde(rename = "type")]
    cmd_type: String,
    ip: Option<String>,
    pid: Option<u32>,
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

#[cfg(target_os = "linux")]
#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    use aya::maps::{PerfEventArray, HashMap as BpfHashMap};
    use aya::programs::{KProbe, SchedClassifier, TcAttachType, Lsm};
    use aya::{include_bytes_aligned, Bpf, Btf};
    use bytes::BytesMut;
    use ebpf_common::{SyscallEvent, ShadowBanInfo};

    let _ = rlimit::Resource::MEMLOCK.set(rlimit::INFINITY, rlimit::INFINITY);

    #[cfg(debug_assertions)]
    let bpf_bytes = include_bytes_aligned!("../../target/bpfel-unknown-none/debug/ebpf");
    #[cfg(not(debug_assertions))]
    let bpf_bytes = include_bytes_aligned!("../../target/bpfel-unknown-none/release/ebpf");

    let bpf_opt = Bpf::load(bpf_bytes).ok();
    
    // We'll use a static pointer to the BPF object if loaded
    static mut BPF_PTR: *mut Bpf = std::ptr::null_mut();

    if let Some(mut bpf) = bpf_opt {
        // Attach TC
        if let Some(prog) = bpf.program_mut("tc_ingress") {
            if let Ok(tc_prog) = <&mut SchedClassifier>::try_from(prog) {
                let _ = tc_prog.load();
                let iface = std::env::var("CTS_IFACE").unwrap_or_else(|_| "eth0".to_string());
                let _ = tc_prog.attach(&iface, TcAttachType::Ingress);
            }
        }
        // Attach KProbes
        for (name, func) in [("kprobe_ptrace", "sys_ptrace"), ("kprobe_mmap", "sys_mmap"), ("kprobe_execve", "sys_execve")] {
            if let Some(prog) = bpf.program_mut(name) {
                if let Ok(p) = <&mut KProbe>::try_from(prog) {
                    let _ = p.load();
                    let _ = p.attach(func, 0).or_else(|_| p.attach(&format!("__x64_{}", func), 0));
                }
            }
        }
        // Attach LSM
        if let Some(prog) = bpf.program_mut("lsm_file_open") {
            if let Ok(lsm_prog) = <&mut Lsm>::try_from(prog) {
                if let Some(btf) = Btf::from_sys_fs().ok() {
                    if let Ok(_) = lsm_prog.load("file_open", &btf) {
                        let _ = lsm_prog.attach();
                    }
                }
            }
        }

        let bpf_boxed = Box::leak(Box::new(bpf));
        unsafe { BPF_PTR = bpf_boxed };

        if let Ok(mut perf_array) = PerfEventArray::try_from(unsafe { (*BPF_PTR).map_mut("EVENTS").unwrap() }) {
            for cpu_id in aya::util::online_cpus()? {
                if let Ok(mut buf) = perf_array.open(cpu_id, None) {
                    tokio::spawn(async move {
                        let mut buffers = (0..10).map(|_| BytesMut::with_capacity(1024)).collect::<Vec<_>>();
                        loop {
                            time::sleep(Duration::from_millis(100)).await;
                            if let Ok(events) = buf.read_events(&mut buffers) {
                                for i in 0..events.read {
                                    let event = unsafe { &*(buffers[i].as_ptr() as *const SyscallEvent) };
                                    let syscall = match event.syscall_id { 101 => "ptrace", 9 => "mmap", 59 => "execve", _ => "unknown" };
                                    let comm = std::str::from_utf8(&event.comm).unwrap_or("unknown").trim_end_matches('\0');
                                    let resp = serde_json::json!({
                                        "id": null, "success": true, "timestamp": Utc::now().to_rfc3339(),
                                        "data": { "type": "SYSCALL_EVENT", "pid": event.pid, "comm": comm, "syscall": syscall, "timestamp": Utc::now().to_rfc3339() }
                                    });
                                    if let Ok(json) = serde_json::to_string(&resp) {
                                        let _lock = STDOUT_LOCK.lock().await;
                                        println!("{}", json);
                                    }
                                }
                            }
                        }
                    });
                }
            }
        }
        emit_response(None, true, "eBPF Sidecar Active.".to_string()).await;
    } else {
        emit_response(None, true, "eBPF Sidecar Active (Legacy Mode).".to_string()).await;
    }

    let mut stdin = BufReader::new(io::stdin()).lines();
    while let Ok(Some(line)) = stdin.next_line().await {
        if let Ok(cmd) = serde_json::from_str::<SidecarCommand>(&line) {
            match cmd.cmd_type.as_str() {
                "SHADOW_BAN" => {
                    if let Some(ip_str) = cmd.ip {
                        let bpf_loaded = unsafe { !BPF_PTR.is_null() };
                        if bpf_loaded {
                            if let (Ok(ip), Ok(mut m)) = (ip_str.parse::<std::net::Ipv4Addr>(), BpfHashMap::try_from(unsafe { (*BPF_PTR).map_mut("SHADOW_BANS").unwrap() })) {
                                let _ = m.insert(u32::from(ip).to_be(), ShadowBanInfo { last_timestamp: 0, bytes_this_second: 0 }, 0);
                                emit_response(cmd.id, true, format!("Shadow Ban: {}", ip_str)).await;
                            } else { emit_response(cmd.id, false, "Invalid IP or Map Error".to_string()).await; }
                        } else { emit_response(cmd.id, false, "BPF Offline".to_string()).await; }
                    }
                },
                "HIDE_PID" => {
                    if let Some(pid) = cmd.pid {
                        let bpf_loaded = unsafe { !BPF_PTR.is_null() };
                        if bpf_loaded {
                            if let Ok(mut m) = BpfHashMap::try_from(unsafe { (*BPF_PTR).map_mut("HIDE_CONFIG").unwrap() }) {
                                let _ = m.insert(pid, 1, 0);
                                emit_response(cmd.id, true, format!("Stealth: PID {}", pid)).await;
                            } else { emit_response(cmd.id, false, "Map Error".to_string()).await; }
                        } else { emit_response(cmd.id, false, "BPF Offline".to_string()).await; }
                    }
                },
                "GET_STATUS" => emit_response(cmd.id, true, "Active".to_string()).await,
                "SHUTDOWN" => std::process::exit(0),
                _ => {}
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
