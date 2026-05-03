use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tokio::process::Command;
use tokio::io::{AsyncBufReadExt, BufReader};
use chrono::Utc;
use std::sync::Arc;
use tokio::sync::Mutex;
use once_cell::sync::Lazy;

static STDOUT_LOCK: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));

async fn emit_response(id: String, success: bool, message: String) {
    let resp = PcapResponse {
        id,
        success,
        message,
        timestamp: Utc::now().to_rfc3339(),
    };
    if let Ok(json) = serde_json::to_string(&resp) {
        let _lock = STDOUT_LOCK.lock().await;
        println!("{}", json);
    }
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
enum PcapCommand {
    StartCapture { interface: String, duration: u64, filename: String, filter: Option<String> },
    StopCapture,
}

#[derive(Serialize, Debug)]
struct PcapResponse {
    id: String,
    success: bool,
    message: String,
    timestamp: String,
}

#[tokio::main]
async fn main() {
    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();
    let mut current_child: Option<tokio::process::Child> = None;

    while let Ok(Some(line)) = reader.next_line().await {
        let cmd: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let id = cmd["id"].as_str().unwrap_or("unknown").to_string();
        let cmd_type = cmd["type"].as_str().unwrap_or("");

        match cmd_type {
            "StartCapture" => {
                // Check if process is still running
                if let Some(ref mut child) = current_child {
                    if child.try_wait().unwrap_or(None).is_none() {
                        emit_response(id, false, "Capture already in progress".to_string()).await;
                        continue;
                    } else {
                        current_child = None;
                    }
                }

                let raw_interface = cmd["payload"]["interface"].as_str().unwrap_or("any");
                let duration = cmd["payload"]["duration"].as_u64().unwrap_or(60);
                let raw_filename = cmd["payload"]["filename"].as_str().unwrap_or("capture.pcap");

                // Security: Validate interface name — only allow alphanumeric, hyphens, underscores, and dots.
                // This prevents injection via the -i argument to tcpdump.
                let interface = if raw_interface.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.') && !raw_interface.is_empty() {
                    raw_interface
                } else {
                    emit_response(id, false, format!("Invalid interface name: '{}'", raw_interface)).await;
                    continue;
                };

                // Security: Cap duration to prevent indefinite captures (max 1 hour).
                let duration = duration.min(3600);

                // Security: Sanitize filename to prevent path traversal.
                // 1. Extract basename only (strip any directory components)
                // 2. Remove any characters that aren't alphanumeric, dots, hyphens, or underscores
                // 3. Force .pcap extension
                // 4. Prepend a fixed output directory
                let basename = std::path::Path::new(raw_filename)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("capture.pcap");

                let sanitized_name: String = basename
                    .chars()
                    .filter(|c| c.is_alphanumeric() || *c == '.' || *c == '-' || *c == '_')
                    .collect();

                let sanitized_name = if sanitized_name.is_empty() {
                    "capture.pcap".to_string()
                } else if !sanitized_name.ends_with(".pcap") {
                    format!("{}.pcap", sanitized_name)
                } else {
                    sanitized_name
                };

                let capture_dir = std::env::var("CTS_CAPTURE_DIR").unwrap_or_else(|_| "/var/lib/cts/captures".to_string());
                // Ensure the capture directory exists
                if let Err(e) = std::fs::create_dir_all(&capture_dir) {
                    emit_response(id, false, format!("Failed to create capture directory '{}': {}", capture_dir, e)).await;
                    continue;
                }

                let safe_path = format!("{}/{}", capture_dir, sanitized_name);
                let filter = cmd["payload"]["filter"].as_str();

                // tcpdump -i <interface> -G <duration> -W 1 -w <filename> [filter]
                let mut cmd_args = vec![
                    "-i".to_string(), 
                    interface.to_string(), 
                    "-G".to_string(), 
                    duration.to_string(), 
                    "-W".to_string(), 
                    "1".to_string(), 
                    "-w".to_string(), 
                    safe_path.clone()
                ];

                if let Some(f) = filter {
                    // Simple validation for the filter
                    if f.chars().all(|c| c.is_alphanumeric() || c == '.' || c == ':' || c == ' ' || c == '-') {
                        cmd_args.push(f.to_string());
                    }
                }

                let child = Command::new("tcpdump")
                    .args(&cmd_args)
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn();

                match child {
                    Ok(c) => {
                        current_child = Some(c);
                        emit_response(id, true, format!("Started capture on {} for {}s to {}", interface, duration, safe_path)).await;
                    }
                    Err(e) => {
                        emit_response(id, false, format!("Failed to start tcpdump: {}", e)).await;
                    }
                }
            }
            "StopCapture" => {
                if let Some(mut child) = current_child.take() {
                    let _ = child.kill().await;
                    emit_response(id, true, "Capture stopped".to_string()).await;
                } else {
                    emit_response(id, false, "No capture in progress".to_string()).await;
                }
            }
            _ => {
                if cmd_type != "" {
                   // Ignore unknown command types or id-only messages
                }
            }
        }
    }
}
