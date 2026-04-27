use serde::{Deserialize, Serialize};
use sysinfo::{PidExt, ProcessExt, System, SystemExt};
use std::collections::HashMap;
use std::env;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Read};
use sha2::{Sha256, Digest};
use std::path::Path;

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

fn calculate_hash(path: &Path) -> Result<String, std::io::Error> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0; 1024];

    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }

    Ok(hex::encode(hasher.finalize()))
}

fn main() -> io::Result<()> {
    let _args: Vec<String> = env::args().collect();
    let mut sys = System::new_all();
    let mut hash_cache: HashMap<String, String> = HashMap::new();

    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim() == "SCAN" {
            sys.refresh_all();

            let mut processes = Vec::new();
            for (pid, process) in sys.processes() {
                let exe_path = process.exe().to_str().unwrap_or("").to_string();
                let hash = if !exe_path.is_empty() {
                    if let Some(cached_hash) = hash_cache.get(&exe_path) {
                        cached_hash.clone()
                    } else {
                        match calculate_hash(Path::new(&exe_path)) {
                            Ok(h) => {
                                hash_cache.insert(exe_path.clone(), h.clone());
                                h
                            }
                            Err(_) => "".to_string(),
                        }
                    }
                } else {
                    "".to_string()
                };

                processes.push(ProcessInfo {
                    pid: pid.as_u32(),
                    name: process.name().to_string(),
                    exe_path,
                    hash,
                    cpu_usage: process.cpu_usage(),
                    memory_usage: process.memory(),
                });
            }

            // Return top 50 processes by CPU usage to be safe
            processes.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap());
            let top_processes = processes.into_iter().take(50).collect();

            let result = ScanResult {
                timestamp: chrono::Utc::now().to_rfc3339(),
                processes: top_processes,
                system_load: sys.load_average().one as f32,
            };

            println!("{}", serde_json::to_string(&result).unwrap());
        } else if line.trim() == "QUIT" {
            break;
        }
    }
    Ok(())
}
