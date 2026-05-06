use serde::{Deserialize, Serialize};
use sysinfo::{Pid, PidExt, ProcessExt, System, SystemExt};
use std::io::{Read, BufRead, Seek, SeekFrom};
use std::fs::{self, File};
use std::time::{Instant};
use tokio::io::{AsyncBufReadExt, BufReader};
use std::sync::{Arc};
use tokio::sync::Mutex;
use once_cell::sync::Lazy;
use chrono::Utc;

static STDOUT_LOCK: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));

#[derive(Serialize, Deserialize, Debug)]
struct Command {
    id: String,
    #[serde(rename = "type")]
    cmd_type: String,
    pid: Option<u32>,
}

#[derive(Serialize, Deserialize, Debug)]
struct ScanResult {
    id: String,
    success: bool,
    timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    memory_anomalies: Option<Vec<MemoryAnomaly>>,
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
        log_type: "activity",
        severity: severity.to_string(),
        caller: "MEM_FORENSICS",
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
    let mem_path = format!("/proc/{}/mem", pid);

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

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    log_forensic("info", "Sovereign Memory Forensic Engine Active").await;

    let mut sys = System::new_all();
    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();

    while let Ok(Some(line)) = reader.next_line().await {
        let command: Command = match serde_json::from_str(&line) {
            Ok(c) => c,
            Err(_) => continue,
        };

        match command.cmd_type.as_str() {
            "MEM_SCAN" => {
                log_forensic("info", "Initiating global memory-forensic audit...").await;
                sys.refresh_processes();
                
                let mut all_anomalies = Vec::new();
                for (pid, _) in sys.processes() {
                    let pid_u32 = pid.as_u32();
                    if pid_u32 > 1 {
                        all_anomalies.extend(scan_process_memory(pid_u32));
                    }
                }

                let result = ScanResult {
                    id: command.id,
                    success: true,
                    timestamp: Utc::now().to_rfc3339(),
                    memory_anomalies: if all_anomalies.is_empty() { None } else { Some(all_anomalies) },
                };
                
                let _lock = STDOUT_LOCK.lock().await;
                println!("{}", serde_json::to_string(&result).unwrap());
            }
            _ => {}
        }
    }
    Ok(())
}
