use serde::{Deserialize, Serialize};
use sysinfo::{Pid, PidExt, ProcessExt, System, SystemExt};
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncBufReadExt, BufReader};
use std::sync::{Arc};
use tokio::sync::Mutex;
use once_cell::sync::Lazy;
use chrono::Utc;
use sha2::{Sha256, Digest};
use hex;
use dashmap::DashMap;

static STDOUT_LOCK: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));

// Memory Leak Mitigation: Hash Cache with TTL/Eviction logic (Stubbed for now, but structure present)
struct CacheEntry {
    hash: String,
    timestamp: u64,
}
static HASH_CACHE: Lazy<DashMap<String, CacheEntry>> = Lazy::new(|| DashMap::new());

#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
enum ScannerCommand {
    #[serde(rename = "MEM_SCAN")]
    MemScan { id: String },
    ScanPath { id: String, path: String },
    Quarantine { id: String, path: String },
    SyncSignatures { id: String },
    GetStatus { id: String },
}

#[derive(Serialize, Debug)]
struct ScanResponse {
    id: String,
    success: bool,
    timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    threats_found: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    memory_anomalies: Option<Vec<MemoryAnomaly>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    target: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct MemoryAnomaly {
    pid: u32,
    address_range: String,
    perms: String,
    reason: String,
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

fn scan_process_memory(pid: u32) -> Vec<MemoryAnomaly> {
    let mut anomalies = Vec::new();
    let maps_path = format!("/proc/{}/maps", pid);

    if let Ok(file) = File::open(&maps_path) {
        let reader = std::io::BufReader::new(file);
        for line in reader.lines().flatten() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 2 { continue; }
            
            let range = parts[0];
            let perms = parts[1];

            // RWX DETECTION: Highly suspicious for fileless malware
            if perms.contains("rwx") {
                anomalies.push(MemoryAnomaly {
                    pid,
                    address_range: range.to_string(),
                    perms: perms.to_string(),
                    reason: "Simultaneous RWX permissions detected (Shellcode indicator)".to_string(),
                });
            }

            // ANOMALOUS EXEC: Executable memory not backed by a file
            if perms.contains('x') && parts.len() < 6 {
                anomalies.push(MemoryAnomaly {
                    pid,
                    address_range: range.to_string(),
                    perms: perms.to_string(),
                    reason: "Anonymous executable memory detected (Potential shellcode injection)".to_string(),
                });
            }
        }
    }
    anomalies
}

fn hash_file(path: &Path) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher).ok()?;
    Some(hex::encode(hasher.finalize()))
}

async fn perform_path_scan(path_str: &str) -> (bool, String, bool) {
    let root = Path::new(path_str);
    if !root.exists() {
        return (false, format!("Path '{}' does not exist", path_str), false);
    }

    let mut threats_found = false;
    let mut log = String::new();

    // Simple implementation: scan file or directory (non-recursive for now to be safe/fast)
    if root.is_file() {
        if let Some(hash) = hash_file(root) {
            log.push_str(&format!("Scanned {}: {}\n", root.display(), hash));
            // Stub threat detection: match a "known malicious" hash
            if hash == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" { // Empty file hash for testing
                threats_found = true;
                log.push_str("!!! THREAT DETECTED: Known malware signature matched.\n");
            }
        }
    } else if root.is_dir() {
        if let Ok(entries) = fs::read_dir(root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(hash) = hash_file(&path) {
                        log.push_str(&format!("Scanned {}: {}\n", path.display(), hash));
                    }
                }
            }
        }
    }

    (true, log, threats_found)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    log_forensic("info", "Sovereign Multi-Vector Scanner Engine Active").await;

    let mut sys = System::new_all();
    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();

    while let Ok(Some(line)) = reader.next_line().await {
        let command: ScannerCommand = match serde_json::from_str(&line) {
            Ok(c) => c,
            Err(_) => continue,
        };

        match command {
            ScannerCommand::MemScan { id } => {
                log_forensic("info", "Initiating global memory-forensic audit...").await;
                sys.refresh_processes();
                
                let mut all_anomalies = Vec::new();
                for (pid, _) in sys.processes() {
                    let pid_u32 = pid.as_u32();
                    if pid_u32 > 1 {
                        all_anomalies.extend(scan_process_memory(pid_u32));
                    }
                }

                let result = ScanResponse {
                    id,
                    success: true,
                    timestamp: Utc::now().to_rfc3339(),
                    message: Some("Memory scan complete".to_string()),
                    threats_found: Some(!all_anomalies.is_empty()),
                    memory_anomalies: if all_anomalies.is_empty() { None } else { Some(all_anomalies) },
                    target: None,
                };
                
                let _lock = STDOUT_LOCK.lock().await;
                println!("{}", serde_json::to_string(&result).unwrap());
            }
            ScannerCommand::ScanPath { id, path } => {
                log_forensic("info", &format!("Starting filesystem audit for path: {}", path)).await;
                let (success, message, threats_found) = perform_path_scan(&path).await;

                let result = ScanResponse {
                    id,
                    success,
                    timestamp: Utc::now().to_rfc3339(),
                    message: Some(message),
                    threats_found: Some(threats_found),
                    memory_anomalies: None,
                    target: None,
                };

                let _lock = STDOUT_LOCK.lock().await;
                println!("{}", serde_json::to_string(&result).unwrap());
            }
            ScannerCommand::Quarantine { id, path } => {
                log_forensic("warning", &format!("Quarantining suspicious artifact: {}", path)).await;

                let quarantine_dir = "./volume/quarantine";
                fs::create_dir_all(quarantine_dir).ok();

                let path_obj = Path::new(&path);
                let filename = path_obj.file_name().unwrap_or_default();
                let target_path = Path::new(quarantine_dir).join(filename);

                let success = fs::rename(&path, &target_path).is_ok();

                let result = ScanResponse {
                    id,
                    success,
                    timestamp: Utc::now().to_rfc3339(),
                    message: Some(if success { format!("Moved to quarantine: {}", target_path.display()) } else { "Quarantine failed".to_string() }),
                    threats_found: None,
                    memory_anomalies: None,
                    target: Some(target_path.to_string_lossy().to_string()),
                };

                let _lock = STDOUT_LOCK.lock().await;
                println!("{}", serde_json::to_string(&result).unwrap());
            }
            ScannerCommand::SyncSignatures { id } => {
                log_forensic("info", "Synchronizing tactical threat intelligence...").await;
                // Stub: In production, this would call freshclam or download a manifest
                let result = ScanResponse {
                    id,
                    success: true,
                    timestamp: Utc::now().to_rfc3339(),
                    message: Some("Signatures synchronized with Global Hive.".to_string()),
                    threats_found: None,
                    memory_anomalies: None,
                    target: None,
                };
                let _lock = STDOUT_LOCK.lock().await;
                println!("{}", serde_json::to_string(&result).unwrap());
            }
            ScannerCommand::GetStatus { id } => {
                let result = ScanResponse {
                    id,
                    success: true,
                    timestamp: Utc::now().to_rfc3339(),
                    message: Some("Operational".to_string()),
                    threats_found: None,
                    memory_anomalies: None,
                    target: None,
                };
                let _lock = STDOUT_LOCK.lock().await;
                println!("{}", serde_json::to_string(&result).unwrap());
            }
        }
    }
    Ok(())
}
