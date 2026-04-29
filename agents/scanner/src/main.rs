use serde::{Deserialize, Serialize};
use sysinfo::{Pid, PidExt, ProcessExt, System, SystemExt};
use std::io::{Read};
use std::fs::{self, File};
use sha2::{Sha256, Digest};
use std::collections::HashMap;
use std::time::SystemTime;
use tokio::io::{AsyncBufReadExt, BufReader};
use rayon::prelude::*;
use std::sync::{Arc, Mutex};

#[derive(Serialize, Deserialize, Debug)]
struct Command {
    id: String,
    #[serde(rename = "type")]
    cmd_type: String,
    path: Option<String>,
    paths: Option<Vec<String>>,
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
    success: bool,
    timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    processes: Option<Vec<ProcessInfo>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_load: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    files: Option<Vec<FileInfo>>,
}

#[derive(Serialize, Deserialize, Debug)]
struct FileInfo {
    path: String,
    hash: String,
    mtime: String,
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
    let hash_cache: Arc<Mutex<HashMap<String, CacheEntry>>> = Arc::new(Mutex::new(HashMap::new()));

    while let Ok(Some(line)) = reader.next_line().await {
        let command: Command = match serde_json::from_str(&line) {
            Ok(c) => c,
            Err(_) => continue,
        };

        if command.cmd_type == "SCAN" {
            sys.refresh_all();

            let mut seen_paths = std::collections::HashSet::new();
            let mut processes_to_scan = Vec::new();

            for (pid, process) in sys.processes() {
                let exe = process.exe();
                let exe_str = exe.to_string_lossy().to_string();
                if !exe_str.is_empty() {
                    seen_paths.insert(exe_str.clone());
                }

                processes_to_scan.push((
                    pid.as_u32(),
                    process.parent().map(|p| p.as_u32()).unwrap_or(0),
                    process.name().to_string(),
                    exe_str,
                    exe.to_path_buf(),
                    process.cpu_usage(),
                    process.memory()
                ));
            }

            let cache_ref = Arc::clone(&hash_cache);
            let mut processes_list: Vec<ProcessInfo> = processes_to_scan.into_par_iter().map(|(pid, ppid, name, exe_path, exe_buf, cpu_usage, memory_usage)| {
                let hash = if exe_path.is_empty() {
                    "N/A".to_string()
                } else {
                    let current_mtime = fs::metadata(&exe_buf)
                        .and_then(|m| m.modified())
                        .unwrap_or(SystemTime::now());

                    let mut cached_hash = None;
                    {
                        let cache = cache_ref.lock().unwrap();
                        if let Some(entry) = cache.get(&exe_path) {
                            if entry.mtime == current_mtime {
                                cached_hash = Some(entry.hash.clone());
                            }
                        }
                    }

                    if let Some(h) = cached_hash {
                        h
                    } else {
                        let (h, m) = compute_hash(&exe_buf);
                        let mut cache = cache_ref.lock().unwrap();
                        cache.insert(exe_path.clone(), CacheEntry { hash: h.clone(), mtime: m });
                        h
                    }
                };

                ProcessInfo {
                    pid,
                    ppid,
                    name,
                    exe_path,
                    hash,
                    cpu_usage,
                    memory_usage,
                }
            }).collect();

            // Evict old entries from hash_cache only if they are not in seen_paths AND not existing files
            {
                let mut cache = hash_cache.lock().unwrap();
                cache.retain(|k, _| {
                    seen_paths.contains(k) || std::path::Path::new(k).exists()
                });
            }

            // Sort by CPU
            processes_list.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap_or(std::cmp::Ordering::Equal));
            let top_processes = processes_list.into_iter().take(50).collect();

            let result = ScanResult {
                id: command.id,
                success: true,
                timestamp: chrono::Utc::now().to_rfc3339(),
                processes: Some(top_processes),
                system_load: Some(sys.load_average().one as f32),
                files: None,
            };

            println!("{}", serde_json::to_string(&result).unwrap());
        } else if command.cmd_type == "DIR_SCAN" {
            let mut paths_to_scan = Vec::new();
            if let Some(p) = command.path {
                paths_to_scan.push(p);
            }
            if let Some(ps) = command.paths {
                paths_to_scan.extend(ps);
            }

            // Collect all files first
            let mut all_files = Vec::new();
            for dir_path in paths_to_scan {
                if let Ok(entries) = fs::read_dir(dir_path) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() {
                            all_files.push(path);
                        }
                    }
                }
            }

            let cache_ref = Arc::clone(&hash_cache);
            let file_infos: Vec<FileInfo> = all_files.par_iter().map(|path| {
                let path_str = path.to_string_lossy().to_string();
                let current_mtime = fs::metadata(path)
                    .and_then(|m| m.modified())
                    .unwrap_or(SystemTime::now());

                let mut mtime_val = current_mtime;
                let mut cached_hash = None;

                {
                    let cache = cache_ref.lock().unwrap();
                    if let Some(entry) = cache.get(&path_str) {
                        if entry.mtime == current_mtime {
                            cached_hash = Some(entry.hash.clone());
                            mtime_val = entry.mtime;
                        }
                    }
                }

                let hash = if let Some(h) = cached_hash {
                    h
                } else {
                    let (h, m) = compute_hash(path);
                    mtime_val = m;
                    let mut cache = cache_ref.lock().unwrap();
                    cache.insert(path_str.clone(), CacheEntry { hash: h.clone(), mtime: mtime_val });
                    h
                };

                FileInfo {
                    path: path_str,
                    hash,
                    mtime: chrono::DateTime::<chrono::Utc>::from(mtime_val).to_rfc3339(),
                }
            }).collect();

            let result = ScanResult {
                id: command.id,
                success: true,
                timestamp: chrono::Utc::now().to_rfc3339(),
                processes: None,
                system_load: None,
                files: Some(file_infos),
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
                            "type": "RKH_SCAN_RESULT",
                            "timestamp": chrono::Utc::now().to_rfc3339(),
                        });
                        println!("{}", result.to_string());
                    }
                    Err(e) => {
                        let result = serde_json::json!({
                            "id": cmd_id,
                            "success": false,
                            "error": e.to_string(),
                            "type": "RKH_SCAN_RESULT",
                            "timestamp": chrono::Utc::now().to_rfc3339(),
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
