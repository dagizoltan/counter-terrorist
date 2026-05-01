use serde::{Deserialize, Serialize};
use sysinfo::{Pid, PidExt, ProcessExt, System, SystemExt};
use std::io::{Read};
use std::fs::{self, File};
use sha2::{Sha256, Digest};
use std::time::SystemTime;
use tokio::io::{AsyncBufReadExt, BufReader};
use rayon::prelude::*;
use std::sync::{Arc};
use dashmap::DashMap;

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
    // Removed plain-text println to maintain JSON pipe integrity.

    let mut sys = System::new_all();

    // Dead Man's Switch: Identify the parent orchestrator process
    let my_pid = Pid::from_u32(std::process::id());
    sys.refresh_process(my_pid);

    let parent_pid = sys.process(my_pid).and_then(|p| p.parent());

    if let Some(ppid) = parent_pid {
        let ppid_u32 = ppid.as_u32();

        // --- Configurable lockdown ---
        // CTS_LOCKDOWN_MODE: "lockdown" (default), "log" (alert only), "disabled"
        let lockdown_mode = std::env::var("CTS_LOCKDOWN_MODE").unwrap_or_else(|_| "lockdown".to_string());
        // CTS_LOCKDOWN_ALLOW_PORTS: Comma-separated ports to allow during lockdown (default "22/tcp")
        let allow_ports_str = std::env::var("CTS_LOCKDOWN_ALLOW_PORTS").unwrap_or_else(|_| "22/tcp".to_string());
        let allow_ports: Vec<String> = allow_ports_str.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
        // CTS_LOCKDOWN_GRACE_RETRIES: Number of consecutive failures before triggering (default 3)
        let grace_retries: u32 = std::env::var("CTS_LOCKDOWN_GRACE_RETRIES")
            .ok().and_then(|s| s.parse().ok()).unwrap_or(3);
        // CTS_LOCKDOWN_BREADCRUMB: Path to write lockdown breadcrumb file (for orchestrator recovery)
        let breadcrumb_path = std::env::var("CTS_LOCKDOWN_BREADCRUMB")
            .unwrap_or_else(|_| "/var/lib/cts/lockdown.triggered".to_string());

        if lockdown_mode == "disabled" {
            eprintln!("[INFO] Dead man's switch is DISABLED via CTS_LOCKDOWN_MODE=disabled");
        } else {
            tokio::spawn(async move {
                let mut monitor_sys = System::new();
                let mut consecutive_failures: u32 = 0;

                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    monitor_sys.refresh_process(Pid::from_u32(ppid_u32));

                    if monitor_sys.process(Pid::from_u32(ppid_u32)).is_none() {
                        consecutive_failures += 1;
                        eprintln!(
                            "[WARNING] Parent orchestrator (PID {}) not found. Failure {}/{}.",
                            ppid_u32, consecutive_failures, grace_retries
                        );

                        if consecutive_failures < grace_retries {
                            continue; // Grace period — retry
                        }

                        eprintln!("[CRITICAL] Parent orchestrator (PID {}) lost after {} retries!", ppid_u32, grace_retries);

                        if lockdown_mode == "log" {
                            eprintln!("[LOCKDOWN] Mode is 'log' — alerting only, NOT modifying firewall.");
                            // Write breadcrumb so the orchestrator knows lockdown was triggered
                            let _ = std::fs::write(&breadcrumb_path, format!(
                                "mode=log\ntimestamp={}\nppid={}\n",
                                chrono::Utc::now().to_rfc3339(), ppid_u32
                            ));
                            std::process::exit(1);
                        }

                        // Mode: "lockdown" — apply firewall rules
                        eprintln!("[LOCKDOWN] Triggering firewall lockdown...");
                        let _ = std::process::Command::new("ufw")
                            .args(["default", "deny", "incoming"])
                            .status();
                        let _ = std::process::Command::new("ufw")
                            .args(["default", "deny", "outgoing"])
                            .status();

                        // Allow configured ports for recovery
                        for port in &allow_ports {
                            eprintln!("[LOCKDOWN] Allowing recovery port: {}", port);
                            let _ = std::process::Command::new("ufw")
                                .args(["allow", port])
                                .status();
                        }

                        let _ = std::process::Command::new("ufw")
                            .arg("enable")
                            .status();

                        // Write breadcrumb file for orchestrator recovery detection
                        let breadcrumb_content = format!(
                            "mode=lockdown\ntimestamp={}\nppid={}\nallowed_ports={}\n",
                            chrono::Utc::now().to_rfc3339(),
                            ppid_u32,
                            allow_ports.join(",")
                        );
                        if let Err(e) = std::fs::write(&breadcrumb_path, &breadcrumb_content) {
                            eprintln!("[LOCKDOWN] Failed to write breadcrumb to '{}': {}", breadcrumb_path, e);
                        }

                        std::process::exit(1);
                    } else {
                        // Parent is alive — reset counter
                        consecutive_failures = 0;
                    }
                }
            });
        }
    }

    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();
    let hash_cache: Arc<DashMap<String, CacheEntry>> = Arc::new(DashMap::new());

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

            let processes_list: Vec<ProcessInfo> = processes_to_scan.into_par_iter().map(|(pid, ppid, name, exe_path, exe_buf, cpu_usage, memory_usage)| {
                let hash = if exe_path.is_empty() {
                    "N/A".to_string()
                } else {
                    let current_mtime = fs::metadata(&exe_buf)
                        .and_then(|m| m.modified())
                        .unwrap_or(SystemTime::now());

                    if let Some(entry) = hash_cache.get(&exe_path) {
                        if entry.mtime == current_mtime {
                            entry.hash.clone()
                        } else {
                            drop(entry);
                            let (h, m) = compute_hash(&exe_buf);
                            hash_cache.insert(exe_path.clone(), CacheEntry { hash: h.clone(), mtime: m });
                            h
                        }
                    } else {
                        let (h, m) = compute_hash(&exe_buf);
                        hash_cache.insert(exe_path.clone(), CacheEntry { hash: h.clone(), mtime: m });
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

            // Evict old entries from hash_cache. 
            // Only keep if currently running. If a file is re-executed, we re-hash (safe vs TOCTOU).
            hash_cache.retain(|k, _| seen_paths.contains(k));

            // Hard limit: If cache still exceeds 5000 entries (very high), clear it to be safe
            if hash_cache.len() > 5000 {
                hash_cache.clear();
            }

            // Sort by CPU
            let mut processes_list = processes_list;
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
            let all_files: Vec<_> = paths_to_scan.into_par_iter().flat_map(|dir_path| {
                match fs::read_dir(dir_path) {
                    Ok(entries) => entries.flatten().filter_map(|entry| {
                        let path = entry.path();
                        if path.is_file() { Some(path) } else { None }
                    }).collect::<Vec<_>>(),
                    Err(_) => Vec::new(),
                }
            }).collect();

            let file_infos: Vec<FileInfo> = all_files.par_iter().map(|path| {
                let path_str = path.to_string_lossy().to_string();
                let current_mtime = fs::metadata(path)
                    .and_then(|m| m.modified())
                    .unwrap_or(SystemTime::now());

                let mut mtime_val = current_mtime;
                let hash = if let Some(entry) = hash_cache.get(&path_str) {
                    if entry.mtime == current_mtime {
                        mtime_val = entry.mtime;
                        entry.hash.clone()
                    } else {
                        drop(entry);
                        let (h, m) = compute_hash(path);
                        mtime_val = m;
                        hash_cache.insert(path_str.clone(), CacheEntry { hash: h.clone(), mtime: m });
                        h
                    }
                } else {
                    let (h, m) = compute_hash(path);
                    mtime_val = m;
                    hash_cache.insert(path_str.clone(), CacheEntry { hash: h.clone(), mtime: m });
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
