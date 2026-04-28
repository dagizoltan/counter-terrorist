use aya::maps::PerfEventArray;
use aya::programs::KProbe;
use aya::{include_bytes_aligned, Bpf};
use bytes::BytesMut;
use ebpf_common::SyscallEvent;
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

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    env_logger::init();

    // Bump RLIMIT_MEMLOCK (required for BPF maps)
    if let Err(e) = rlimit::Resource::MEMLOCK.set(rlimit::INFINITY, rlimit::INFINITY) {
        eprintln!("failed to set RLIMIT_MEMLOCK: {}", e);
    }

    #[cfg(debug_assertions)]
    let bpf_bytes = include_bytes_aligned!("../../target/bpfel-unknown-none/debug/ebpf");
    #[cfg(not(debug_assertions))]
    let bpf_bytes = include_bytes_aligned!("../../target/bpfel-unknown-none/release/ebpf");

    let bpf = Bpf::load(bpf_bytes)?;
    let bpf = Box::leak(Box::new(bpf));

    let program_ptrace: &mut KProbe = bpf.program_mut("kprobe_ptrace").unwrap().try_into()?;
    program_ptrace.load()?;
    program_ptrace.attach("sys_ptrace", 0).or_else(|_| program_ptrace.attach("__x64_sys_ptrace", 0))?;

    let program_mmap: &mut KProbe = bpf.program_mut("kprobe_mmap").unwrap().try_into()?;
    program_mmap.load()?;
    program_mmap.attach("sys_mmap", 0).or_else(|_| program_mmap.attach("__x64_sys_mmap", 0))?;

    let program_execve: &mut KProbe = bpf.program_mut("kprobe_execve").unwrap().try_into()?;
    program_execve.load()?;
    program_execve.attach("sys_execve", 0).or_else(|_| program_execve.attach("__x64_sys_execve", 0))?;

    println!(r#"[EBPF] eBPF Sidecar Active. Monitoring syscalls..."#);

    // Monitor for SHUTDOWN command from orchestrator
    tokio::spawn(async move {
        let stdin = io::stdin();
        for line in stdin.lock().lines() {
            if let Ok(line) = line {
                if line.contains("SHUTDOWN") {
                    std::process::exit(0);
                }
            }
        }
    });

    let mut perf_array = PerfEventArray::try_from(bpf.map_mut("EVENTS").unwrap())?;

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

                        let syscall_name = match event.syscall_id {
                            1 => "ptrace",
                            2 => "mmap",
                            3 => "execve",
                            _ => "unknown",
                        };

                        let comm = std::str::from_utf8(&event.comm)
                            .unwrap_or("unknown")
                            .trim_end_matches('\0');

                        let json_event = SyscallEventJson {
                            event_type: "SYSCALL_EVENT".to_string(),
                            pid: event.pid,
                            comm: comm.to_string(),
                            syscall: syscall_name.to_string(),
                            timestamp: Utc::now().to_rfc3339(),
                        };

                        if let Ok(json) = serde_json::to_string(&json_event) {
                            println!("{}", json);
                        }
                    }
                }
            }
        });
    }

    loop {
        time::sleep(Duration::from_secs(60)).await;
    }
}
