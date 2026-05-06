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
use tokio::sync::Mutex;
use once_cell::sync::Lazy;
use chrono::Utc;

static STDOUT_LOCK: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));

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
    #[serde(skip_serializing_if = "Option::is_none")]
    anomalies: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug)]
struct FileInfo {
    path: String,
    hash: String,
    mtime: String,
}

#[derive(Debug, Serialize)]
struct ForensicLog {
    timestamp: String,
    log_type: String,
    severity: String,
    caller: String,
    message: String,
}

async fn log_forensic(severity: &str, message: &str) {
    let log = ForensicLog {
        timestamp: Utc::now().to_rfc3339(),
        log_type: "activity".to_string(),
        severity: severity.to_string(),
        caller: "SCANNER_AGENT".to_string(),
        message: message.to_string(),
    };
    if let Ok(json) = serde_json::to_string(&log) {
        let _lock = STDOUT_LOCK.lock().await;
        println!("[LOG] {}", json);
    }
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
    let mut buffer = [0; 65536];
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
    log_forensic("info", "Sovereign Scanner Agent active (Hermetic Baseline Mode)").await;

    let mut sys = System::new_all();
    let my_pid = Pid::from_u32(std::process::id());
    sys.refresh_process(my_pid);

    let parent_pid = sys.process(my_pid).and_then(|p| p.parent());

    if let Some(ppid) = parent_pid {
        let ppid_u32 = ppid.as_u32();
        let lockdown_mode = std::env::var("CTS_LOCKDOWN_MODE").unwrap_or_else(|_| "lockdown".to_string());
        
        if lockdown_mode != "disabled" {
            tokio::spawn(async move {
                let mut monitor_sys = System::new();
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    monitor_sys.refresh_process(Pid::from_u32(ppid_u32));

                    if monitor_sys.process(Pid::from_u32(ppid_u32)).is_none() {
                        // HERMETIC: Dead Man's Switch
                        // Instead of ufw, we log a critical alert. 
                        // The orchestrator's other sidecars (eBPF) should have seen this and self-locked.
                        let msg = format!("CRITICAL: ORCHESTRATOR PARENT (PID {}) LOST. Initiating hermetic lockdown sequence.", ppid_u32);
                        log_forensic("error", &msg).await;
                        std::process::exit(1);
                    }
                }
            });
        }
    }

    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();
    let hash_cache: Arc<DashMap<String, (String, SystemTime)>> = Arc::new(DashMap::new());

    while let Ok(Some(line)) = reader.next_line().await {
        let command: Command = match serde_json::from_str(&line) {
            Ok(c) => c,
            Err(_) => continue,
        };

        match command.cmd_type.as_str() {
            "SCAN" => {
                sys.refresh_all();
                let mut processes_list: Vec<ProcessInfo> = sys.processes().par_iter().map(|(pid, process)| {
                    let exe = process.exe();
                    let exe_path = exe.to_string_lossy().to_string();
                    let (hash, _) = if exe_path.is_empty() {
                        ("N/A".to_string(), SystemTime::now())
                    } else {
                        compute_hash(exe)
                    };

                    ProcessInfo {
                        pid: pid.as_u32(),
                        ppid: process.parent().map(|p| p.as_u32()).unwrap_or(0),
                        name: process.name().to_string(),
                        exe_path,
                        hash,
                        cpu_usage: process.cpu_usage(),
                        memory_usage: process.memory(),
                    }
                }).collect();

                processes_list.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap_or(std::cmp::Ordering::Equal));
                
                let result = ScanResult {
                    id: command.id,
                    success: true,
                    timestamp: Utc::now().to_rfc3339(),
                    processes: Some(processes_list.into_iter().take(50).collect()),
                    system_load: Some(sys.load_average().one as f32),
                    files: None,
                    anomalies: None,
                };

                let _lock = STDOUT_LOCK.lock().await;
                println!("{}", serde_json::to_string(&result).unwrap());
            }
            "RKH_SCAN" => {
                log_forensic("info", "Initiating Sovereign Rootkit Analysis (Native FS/Proc Sweep)").await;
                
                let mut anomalies = Vec::new();
                
                // 1. Check for suspicious hidden directories in /dev or /tmp
                if let Ok(entries) = fs::read_dir("/dev") {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.starts_with('.') && name.len() > 1 {
                            anomalies.push(format!("Suspicious hidden device node: /dev/{}", name));
                        }
                    }
                }

                // 2. Check for common rootkit artifacts
                for path in ["/dev/shm/.kworker", "/tmp/.X11-unix/.secret", "/usr/bin/.sshd"] {
                    if fs::metadata(path).is_ok() {
                        anomalies.push(format!("Rootkit artifact detected: {}", path));
                    }
                }

                let result = ScanResult {
                    id: command.id,
                    success: true,
                    timestamp: Utc::now().to_rfc3339(),
                    processes: None,
                    system_load: None,
                    files: None,
                    anomalies: Some(anomalies),
                };
                
                let _lock = STDOUT_LOCK.lock().await;
                println!("{}", serde_json::to_string(&result).unwrap());
            }
            "GET_STATUS" => {
                let resp = serde_json::json!({
                    "id": command.id,
                    "success": true,
                    "message": "Scanner Operational (Hermetic)",
                    "timestamp": Utc::now().to_rfc3339()
                });
                let _lock = STDOUT_LOCK.lock().await;
                println!("{}", resp.to_string());
            }
            _ => {}
        }
    }
}
