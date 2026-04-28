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

                let interface = cmd["payload"]["interface"].as_str().unwrap_or("any");
                let duration = cmd["payload"]["duration"].as_u64().unwrap_or(60);
                let filename = cmd["payload"]["filename"].as_str().unwrap_or("capture.pcap");

                // tcpdump -i <interface> -G <duration> -W 1 -w <filename>
                let child = Command::new("tcpdump")
                    .args(["-i", interface, "-G", &duration.to_string(), "-W", "1", "-w", filename])
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn();

                match child {
                    Ok(c) => {
                        current_child = Some(c);
                        let resp = PcapResponse {
                            id,
                            success: true,
                            message: format!("Started capture on {} for {}s to {}", interface, duration, filename),
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
