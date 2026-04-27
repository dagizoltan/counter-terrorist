use serde::{Deserialize, Serialize};
use sysinfo::{PidExt, ProcessExt, System, SystemExt};
use std::io::{self, BufRead, Read};
use std::fs::{self, File};
use std::process::Command;
use sha2::{Sha256, Digest};
use std::collections::HashMap;
use std::time::SystemTime;

#[derive(Serialize, Deserialize, Debug)]
struct ProcessInfo {
    pid: u32,
    parent_pid: Option<u32>,
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

struct CacheEntry {
    hash: String,
    mtime: SystemTime,
}

fn compute_hash(path: &std::path::Path) -> (String, SystemTime) {
    let metadata = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return ("UNKNOWN".to_string(), SystemTime::now()),
    };

    let mtime = metadata.modified().unwrap_or(SystemTime::now());

    let mut file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return ("UNKNOWN".to_string(), mtime),
    };

    let mut hasher = Sha256::new();
    let mut buffer = [0; 65536]; // 64KB buffer for better performance
    loop {
        let count = match file.read(&mut buffer) {
            Ok(0) => break,
            Ok(c) => c,
            Err(_) => return ("ERROR".to_string(), mtime),
        };
        hasher.update(&buffer[..count]);
    }

    (hex::encode(hasher.finalize()), mtime)
}

fn main() {
    let mut sys = System::new_all();
    let stdin = io::stdin();
    let mut hash_cache: HashMap<String, CacheEntry> = HashMap::new();

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
                let exe = process.exe();
                let exe_str = exe.to_string_lossy().to_string();

                let hash = if exe_str.is_empty() {
                    "N/A".to_string()
                } else {
                    let current_mtime = fs::metadata(exe)
                        .and_then(|m| m.modified())
                        .unwrap_or(SystemTime::now());

                    use std::collections::hash_map::Entry;
                    match hash_cache.entry(exe_str.clone()) {
                        Entry::Occupied(mut occupied) => {
                            if occupied.get().mtime == current_mtime {
                                occupied.get().hash.clone()
                            } else {
                                let (h, m) = compute_hash(exe);
                                occupied.insert(CacheEntry { hash: h.clone(), mtime: m });
                                h
                            }
                        },
                        Entry::Vacant(vacant) => {
                            let (h, m) = compute_hash(exe);
                            vacant.insert(CacheEntry { hash: h.clone(), mtime: m });
                            h
                        }
                    }
                };

                processes.push(ProcessInfo {
                    pid: pid.as_u32(),
                    parent_pid: process.parent().map(|p| p.as_u32()),
                    name: process.name().to_string(),
                    exe_path: exe_str,
                    hash,
                    cpu_usage: process.cpu_usage(),
                    memory_usage: process.memory(),
                });
            }

            // Sort by CPU
            processes.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap_or(std::cmp::Ordering::Equal));
            let top_processes = processes.into_iter().take(50).collect();

            let result = ScanResult {
                timestamp: chrono::Utc::now().to_rfc3339(),
                processes: top_processes,
                system_load: sys.load_average().one as f32,
            };

            println!("{}", serde_json::to_string(&result).unwrap());
        } else if cmd == "RKHUNTER" {
            let output = Command::new("rkhunter")
                .args(["--check", "--sk", "--nocolors", "--report-warnings-only"])
                .output();

            match output {
                Ok(out) => {
                    let result = serde_json::json!({
                        "success": out.status.success(),
                        "stdout": String::from_utf8_lossy(&out.stdout),
                        "stderr": String::from_utf8_lossy(&out.stderr),
                    });
                    println!("{}", result.to_string());
                },
                Err(e) => {
                    let result = serde_json::json!({
                        "success": false,
                        "error": e.to_string(),
                    });
                    println!("{}", result.to_string());
                }
            }
        } else if cmd == "QUIT" {
            break;
        }
    }
}
