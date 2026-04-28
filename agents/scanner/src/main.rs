use serde::{Deserialize, Serialize};
use sysinfo::{Pid, PidExt, ProcessExt, System, SystemExt};
use std::io::{Read};
use std::fs::{self, File};
use sha2::{Sha256, Digest};
use std::collections::HashMap;
use std::time::SystemTime;
use tokio::io::{AsyncBufReadExt, BufReader};

#[derive(Serialize, Deserialize, Debug)]
struct Command {
    id: String,
    #[serde(rename = "type")]
    cmd_type: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct ProcessInfo {
    pid: u32,
    ppid: u32,
    name: String,
    exe_path: String,
    hash: String,
    cpu_usage: f32,
    memory_usage: u64,
}

#[derive(Serialize, Deserialize, Debug)]
struct ScanResult {
    id: String,
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

#[tokio::main]
async fn main() {
    // Phase 4: Basic Process Masquerading
    // Note: On Linux, we can change the process name shown in some tools by modifying argv[0]
    // For this baseline, we use an innocuous title for the internal logic
    println!("[INFO] Initializing system-monitoring-helper...");

    let mut sys = System::new_all();

    // Dead Man's Switch: Identify the parent orchestrator process
    let my_pid = Pid::from_u32(std::process::id());
    sys.refresh_process(my_pid);

    let parent_pid = sys.process(my_pid).and_then(|p| p.parent());

    if let Some(ppid) = parent_pid {
        let ppid_u32 = ppid.as_u32();
        tokio::spawn(async move {
            let mut monitor_sys = System::new();
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                monitor_sys.refresh_process(Pid::from_u32(ppid_u32));
                if monitor_sys.process(Pid::from_u32(ppid_u32)).is_none() {
                    eprintln!("[CRITICAL] Parent orchestrator (PID {}) lost! Triggering lockdown...", ppid_u32);
                    // Trigger Failsafe Lockdown (e.g., block all traffic except SSH)
                    let _ = std::process::Command::new("ufw")
                        .args(["default", "deny", "incoming"])
                        .status();
                    let _ = std::process::Command::new("ufw")
                        .args(["default", "deny", "outgoing"])
                        .status();
                    // Allow SSH for recovery
                    let _ = std::process::Command::new("ufw")
                        .args(["allow", "22/tcp"])
                        .status();
                    let _ = std::process::Command::new("ufw")
                        .arg("enable")
                        .status();
                    std::process::exit(1);
                }
            }
        });
    }

    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();
    let mut hash_cache: HashMap<String, CacheEntry> = HashMap::new();

    while let Ok(Some(line)) = reader.next_line().await {
        let command: Command = match serde_json::from_str(&line) {
            Ok(c) => c,
            Err(_) => continue,
        };

        if command.cmd_type == "SCAN" {
            sys.refresh_all();

            let mut processes = Vec::new();
            let mut seen_paths = std::collections::HashSet::new();

            for (pid, process) in sys.processes() {
                let exe = process.exe();
                let exe_str = exe.to_string_lossy().to_string();
                if !exe_str.is_empty() {
                    seen_paths.insert(exe_str.clone());
                }

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
                                let exe_clone = exe.to_path_buf();
                                let (h, m) = tokio::task::spawn_blocking(move || compute_hash(&exe_clone)).await.unwrap_or_else(|_| ("ERROR".to_string(), SystemTime::now()));
                                occupied.insert(CacheEntry { hash: h.clone(), mtime: m });
                                h
                            }
                        },
                        Entry::Vacant(vacant) => {
                            let exe_clone = exe.to_path_buf();
                            let (h, m) = tokio::task::spawn_blocking(move || compute_hash(&exe_clone)).await.unwrap_or_else(|_| ("ERROR".to_string(), SystemTime::now()));
                            vacant.insert(CacheEntry { hash: h.clone(), mtime: m });
                            h
                        }
                    }
                };

                processes.push(ProcessInfo {
                    pid: pid.as_u32(),
                    ppid: process.parent().map(|p| p.as_u32()).unwrap_or(0),
                    name: process.name().to_string(),
                    exe_path: exe_str,
                    hash,
                    cpu_usage: process.cpu_usage(),
                    memory_usage: process.memory(),
                });
            }

            // Evict old entries from hash_cache
            hash_cache.retain(|k, _| seen_paths.contains(k));

            // Sort by CPU
            processes.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap_or(std::cmp::Ordering::Equal));
            let top_processes = processes.into_iter().take(50).collect();

            let result = ScanResult {
                id: command.id,
                timestamp: chrono::Utc::now().to_rfc3339(),
                processes: top_processes,
                system_load: sys.load_average().one as f32,
            };

            println!("{}", serde_json::to_string(&result).unwrap());
        } else if command.cmd_type == "RKH_SCAN" {
            let cmd_id = command.id;
            // Run rkhunter in a separate thread to avoid blocking the main loop
            tokio::spawn(async move {
                let output = std::process::Command::new("rkhunter")
                    .args(["--check", "--sk", "--nocolors"])
                    .output();

                match output {
                    Ok(out) => {
                        let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                        let result = serde_json::json!({
                            "id": cmd_id,
                            "success": out.status.success(),
                            "exit_code": out.status.code(),
                            "stdout": stdout,
                            "stderr": stderr,
                            "type": "RKH_SCAN_RESULT"
                        });
                        println!("{}", result.to_string());
                    }
                    Err(e) => {
                        let result = serde_json::json!({
                            "id": cmd_id,
                            "success": false,
                            "error": e.to_string(),
                            "type": "RKH_SCAN_RESULT"
                        });
                        println!("{}", result.to_string());
                    }
                }
            });
        } else if command.cmd_type == "QUIT" {
            break;
        }
    }
}
