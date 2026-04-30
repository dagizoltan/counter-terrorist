use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tokio::process::Command;
use tokio::io::{AsyncBufReadExt, BufReader};
use chrono::Utc;

#[derive(Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
enum PcapCommand {
    StartCapture { interface: String, duration: u64, filename: String },
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
                        let resp = PcapResponse {
                            id,
                            success: false,
                            message: "Capture already in progress".to_string(),
                            timestamp: Utc::now().to_rfc3339(),
                        };
                        println!("{}", serde_json::to_string(&resp).unwrap());
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
                    let resp = PcapResponse {
                        id,
                        success: false,
                        message: format!("Invalid interface name: '{}'", raw_interface),
                        timestamp: Utc::now().to_rfc3339(),
                    };
                    println!("{}", serde_json::to_string(&resp).unwrap());
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
                    let resp = PcapResponse {
                        id,
                        success: false,
                        message: format!("Failed to create capture directory '{}': {}", capture_dir, e),
                        timestamp: Utc::now().to_rfc3339(),
                    };
                    println!("{}", serde_json::to_string(&resp).unwrap());
                    continue;
                }

                let safe_path = format!("{}/{}", capture_dir, sanitized_name);

                // tcpdump -i <interface> -G <duration> -W 1 -w <filename>
                let child = Command::new("tcpdump")
                    .args(["-i", interface, "-G", &duration.to_string(), "-W", "1", "-w", &safe_path])
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn();

                match child {
                    Ok(c) => {
                        current_child = Some(c);
                        let resp = PcapResponse {
                            id,
                            success: true,
                            message: format!("Started capture on {} for {}s to {}", interface, duration, safe_path),
                            timestamp: Utc::now().to_rfc3339(),
                        };
                        println!("{}", serde_json::to_string(&resp).unwrap());
                    }
                    Err(e) => {
                        let resp = PcapResponse {
                            id,
                            success: false,
                            message: format!("Failed to start tcpdump: {}", e),
                            timestamp: Utc::now().to_rfc3339(),
                        };
                        println!("{}", serde_json::to_string(&resp).unwrap());
                    }
                }
            }
            "StopCapture" => {
                if let Some(mut child) = current_child.take() {
                    let _ = child.kill().await;
                    let resp = PcapResponse {
                        id,
                        success: true,
                        message: "Capture stopped".to_string(),
                        timestamp: Utc::now().to_rfc3339(),
                    };
                    println!("{}", serde_json::to_string(&resp).unwrap());
                } else {
                    let resp = PcapResponse {
                        id,
                        success: false,
                        message: "No capture in progress".to_string(),
                        timestamp: Utc::now().to_rfc3339(),
                    };
                    println!("{}", serde_json::to_string(&resp).unwrap());
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
