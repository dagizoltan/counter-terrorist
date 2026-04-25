use serde::{Deserialize, Serialize};
use sysinfo::{ProcessExt, System, SystemExt};
use std::env;

#[derive(Serialize, Deserialize, Debug)]
struct ProcessInfo {
    pid: u32,
    name: std::string::String,
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
    let args: Vec<String> = env::args().collect();
    let mut sys = System::new_all();
    sys.refresh_all();

    let mut processes = Vec::new();
    for (pid, process) in sys.processes() {
        processes.push(ProcessInfo {
            pid: pid.as_u32(),
            name: process.name().to_string(),
            cpu_usage: process.cpu_usage(),
            memory_usage: process.memory(),
        });
    }

    // Filter to top processes if needed, or just return all
    processes.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap());
    let top_processes = processes.into_iter().take(20).collect();

    let result = ScanResult {
        timestamp: chrono::Utc::now().to_rfc3339(),
        processes: top_processes,
        system_load: sys.load_average().one as f32,
    };

    println!("{}", serde_json::to_string(&result).unwrap());
}
