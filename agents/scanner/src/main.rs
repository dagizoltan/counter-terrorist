use serde::{Deserialize, Serialize};
use sysinfo::{PidExt, ProcessExt, System, SystemExt};
use std::io::{self, BufRead};

#[derive(Serialize, Deserialize, Debug)]
struct ProcessInfo {
    pid: u32,
    name: String,
    exe_path: String,
    hash: String,
    cpu_usage: f32,
    memory_usage: u64,
}

#[derive(Serialize, Deserialize, Debug)]
struct ScanResult {
    timestamp: String,
    processes: Vec<ProcessInfo>,
    system_load: f32,
}

fn main() {
    let mut sys = System::new_all();
    let stdin = io::stdin();

    // The scanner now runs as a persistent daemon
    for line in stdin.lock().lines() {
        let input = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        let cmd = input.trim();
        if cmd == "SCAN" {
            sys.refresh_all();

            let mut processes = Vec::new();
            for (pid, process) in sys.processes() {
                processes.push(ProcessInfo {
                    pid: pid.as_u32(),
                    name: process.name().to_string(),
                    exe_path: process.exe().to_string_lossy().to_string(),
                    // Placeholder for hashing - in production this would be a SHA-256 of the binary
                    hash: "f24d692981cea0cf17521adc920668d2f7f987f0607f2a74c7604581ed66627a".to_string(),
                    cpu_usage: process.cpu_usage(),
                    memory_usage: process.memory(),
                });
            }

            // Return top processes by CPU
            processes.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap_or(std::cmp::Ordering::Equal));
            let top_processes = processes.into_iter().take(50).collect();

            let result = ScanResult {
                timestamp: chrono::Utc::now().to_rfc3339(),
                processes: top_processes,
                system_load: sys.load_average().one as f32,
            };

            println!("{}", serde_json::to_string(&result).unwrap());
        } else if cmd == "QUIT" {
            break;
        } else if !cmd.is_empty() {
            eprintln!("Unknown command: {}", cmd);
        }
    }
}
