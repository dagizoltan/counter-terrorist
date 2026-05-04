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

#[derive(Serialize, Debug)]
struct PacketEvent {
    #[serde(rename = "type")]
    event_type: String,
    data: PacketData,
}

#[derive(Serialize, Debug)]
struct PacketData {
    timestamp: String,
    direction: String,
    source: String,
    destination: String,
    protocol: String,
    length: u32,
    message: String,
}

#[tokio::main]
async fn main() {
    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();
    let current_child: Arc<Mutex<Option<tokio::process::Child>>> = Arc::new(Mutex::new(None));

    while let Ok(Some(line)) = reader.next_line().await {
        let cmd: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let id = cmd["id"].as_str().unwrap_or("unknown").to_string();
        let cmd_type = cmd["type"].as_str().unwrap_or("");

        match cmd_type {
            "StartCapture" => {
                let mut lock = current_child.lock().await;
                if let Some(ref mut child) = *lock {
                    if child.try_wait().unwrap_or(None).is_none() {
                        emit_response(id, false, "Capture already in progress".to_string()).await;
                        continue;
                    }
                }

                let raw_interface = cmd["payload"]["interface"].as_str().unwrap_or("any");
                let duration = cmd["payload"]["duration"].as_u64().unwrap_or(60);
                let raw_filename = cmd["payload"]["filename"].as_str().unwrap_or("capture.pcap");
                let filter = cmd["payload"]["filter"].as_str();

                let interface = if raw_interface.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.') && !raw_interface.is_empty() {
                    raw_interface
                } else {
                    emit_response(id, false, format!("Invalid interface name: '{}'", raw_interface)).await;
                    continue;
                };

                let duration = duration.min(3600);
                let basename = std::path::Path::new(raw_filename).file_name().and_then(|n| n.to_str()).unwrap_or("capture.pcap");
                let sanitized_name: String = basename.chars().filter(|c| c.is_alphanumeric() || *c == '.' || *c == '-' || *c == '_').collect();
                let sanitized_name = if sanitized_name.is_empty() { "capture.pcap".to_string() } else if !sanitized_name.ends_with(".pcap") { format!("{}.pcap", sanitized_name) } else { sanitized_name };

                let capture_dir = std::env::var("CTS_CAPTURE_DIR").unwrap_or_else(|_| "./volume/storage/captures".to_string());
                let _ = std::fs::create_dir_all(&capture_dir);
                let safe_path = format!("{}/{}", capture_dir, sanitized_name);

                // Use -l for line buffering and -n to avoid DNS lookups for speed
                let mut cmd_args = vec!["-i".to_string(), interface.to_string(), "-l".to_string(), "-n".to_string()];
                
                // For GHOST_COMMAND, we'll stream to stdout by default to populate the UI.
                cmd_args.extend(vec!["-G".to_string(), duration.to_string(), "-W".to_string(), "1".to_string()]);

                if let Some(f) = filter {
                    if f.chars().all(|c| c.is_alphanumeric() || c == '.' || c == ':' || c == ' ' || c == '-' || c == '|') {
                        cmd_args.push(f.to_string());
                    }
                }

                let mut child = Command::new("tcpdump")
                    .args(&cmd_args)
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn()
                    .expect("Failed to spawn tcpdump");

                let stdout = child.stdout.take().expect("Failed to take stdout");
                
                tokio::spawn(async move {
                    let mut reader = BufReader::new(stdout).lines();
                    while let Ok(Some(line)) = reader.next_line().await {
                        // Very basic parsing for tcpdump output:
                        // 21:56:00.123456 IP 1.2.3.4.1234 > 5.6.7.8.80: Flags [S], ...
                        if line.contains("IP") && line.contains(">") {
                            let parts: Vec<&str> = line.split_whitespace().collect();
                            if parts.len() > 4 {
                                let timestamp = parts[0].to_string();
                                let src = parts[2].to_string();
                                let dst = parts[4].trim_end_matches(':').to_string();
                                let proto = if line.contains("UDP") { "UDP" } else if line.contains("ICMP") { "ICMP" } else { "TCP" };
                                
                                let event = PacketEvent {
                                    event_type: "PACKET".to_string(),
                                    data: PacketData {
                                        timestamp: Utc::now().to_rfc3339(),
                                        direction: "INBOUND".to_string(), // Simplified
                                        source: src,
                                        destination: dst,
                                        protocol: proto.to_string(),
                                        length: 0,
                                        message: line.clone(),
                                    }
                                };
                                if let Ok(json) = serde_json::to_string(&event) {
                                    let _lock = STDOUT_LOCK.lock().await;
                                    println!("{}", json);
                                }
                            }
                        }
                    }
                });

                emit_response(id.clone(), true, format!("Started capture on {} -> {}", interface, safe_path)).await;
                *lock = Some(child);
            }
            "StopCapture" => {
                let mut lock = current_child.lock().await;
                if let Some(mut child) = lock.take() {
                    let _ = child.kill().await;
                    emit_response(id, true, "Capture stopped".to_string()).await;
                } else {
                    emit_response(id, false, "No capture in progress".to_string()).await;
                }
            }
            "Ping" => {
                emit_response(id, true, "Pong".to_string()).await;
            }
            _ => {}
        }
    }
}
