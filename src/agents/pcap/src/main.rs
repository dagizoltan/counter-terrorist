use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader};
use chrono::Utc;
use std::sync::Arc;
use tokio::sync::Mutex;
use once_cell::sync::Lazy;

static STDOUT_LOCK: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));

#[derive(Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
enum PcapCommand {
    StartCapture { interface: String, filter: Option<String> },
    StopCapture,
    GetStatus,
}

#[derive(Serialize, Debug)]
struct SidecarResponse {
    id: Option<String>,
    success: bool,
    message: String,
    timestamp: String,
}

#[derive(Serialize, Debug)]
struct PacketEvent {
    #[serde(rename = "type")]
    event_type: String,
    success: bool,
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
    metadata: Option<serde_json::Value>,
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
        caller: "PCAP_DISSECTOR".to_string(),
        message: message.to_string(),
    };
    if let Ok(json) = serde_json::to_string(&log) {
        let _lock = STDOUT_LOCK.lock().await;
        println!("[LOG] {}", json);
    }
}

async fn emit_response(id: Option<String>, success: bool, message: String) {
    let resp = SidecarResponse {
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

/// Tactical Dissector: Extracts SNI from TLS ClientHello
fn extract_sni(payload: &[u8]) -> Option<String> {
    // Very basic TLS Handshake / ClientHello parser
    // Check for Handshake (0x16) and ClientHello (0x01)
    if payload.len() < 43 || payload[0] != 0x16 || payload[5] != 0x01 { return None; }
    
    let mut pos = 43; // Skip header, version, random
    if pos >= payload.len() { return None; }
    
    // Session ID
    let session_id_len = payload[pos] as usize;
    pos += 1 + session_id_len;
    if pos + 2 >= payload.len() { return None; }
    
    // Cipher Suites
    let cipher_len = u16::from_be_bytes([payload[pos], payload[pos+1]]) as usize;
    pos += 2 + cipher_len;
    if pos + 1 >= payload.len() { return None; }
    
    // Compression
    let comp_len = payload[pos] as usize;
    pos += 1 + comp_len;
    if pos + 2 >= payload.len() { return None; }
    
    // Extensions
    let ext_total_len = u16::from_be_bytes([payload[pos], payload[pos+1]]) as usize;
    pos += 2;
    let ext_end = pos + ext_total_len;
    
    while pos + 4 <= ext_end && pos + 4 <= payload.len() {
        let ext_type = u16::from_be_bytes([payload[pos], payload[pos+1]]);
        let ext_len = u16::from_be_bytes([payload[pos+2], payload[pos+3]]) as usize;
        pos += 4;
        
        if ext_type == 0x0000 { // Server Name Indication
            if pos + 5 <= payload.len() {
                let list_len = u16::from_be_bytes([payload[pos], payload[pos+1]]) as usize;
                let name_type = payload[pos+2];
                let name_len = u16::from_be_bytes([payload[pos+3], payload[pos+4]]) as usize;
                if name_type == 0 && pos + 5 + name_len <= payload.len() {
                    return String::from_utf8(payload[pos+5..pos+5+name_len].to_vec()).ok();
                }
            }
        }
        pos += ext_len;
    }
    None
}

/// Tactical Dissector: Extracts DNS Query Name
fn extract_dns_query(payload: &[u8]) -> Option<String> {
    if payload.len() < 13 { return None; }
    let mut pos = 12; // Skip DNS Header
    let mut name = String::new();
    
    loop {
        if pos >= payload.len() { break; }
        let len = payload[pos] as usize;
        if len == 0 { break; }
        pos += 1;
        if pos + len > payload.len() { break; }
        if !name.is_empty() { name.push('.'); }
        name.push_str(&String::from_utf8_lossy(&payload[pos..pos+len]));
        pos += len;
    }
    if name.is_empty() { None } else { Some(name) }
}

#[tokio::main]
async fn main() {
    log_forensic("info", "Sovereign PCAP Dissector active (SNI/DNS/HTTP support)").await;

    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();
    let capture_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>> = Arc::new(Mutex::new(None));

    while let Ok(Some(line)) = reader.next_line().await {
        let cmd_val: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let id = cmd_val["id"].as_str().map(|s| s.to_string());
        let cmd_type = cmd_val["type"].as_str().unwrap_or("");

        match cmd_type {
            "StartCapture" => {
                let interface = cmd_val["payload"]["interface"].as_str().unwrap_or("eth0").to_string();
                log_forensic("info", &format!("Activating tactical dissection on {}", interface)).await;

                let mut handle = capture_handle.lock().await;
                if handle.is_some() {
                    emit_response(id, false, "Dissector already running".to_string()).await;
                    continue;
                }

                let h = tokio::spawn(async move {
                    loop {
                        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                        
                        // Simulation of a detected C2 heartbeat via DNS
                        let dns_payload = b"\x12\x34\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00\x07malware\x03com\x00\x00\x01\x00\x01";
                        if let Some(query) = extract_dns_query(dns_payload) {
                            let event = PacketEvent {
                                event_type: "EXFIL_ALERT".to_string(),
                                success: true,
                                data: PacketData {
                                    timestamp: Utc::now().to_rfc3339(),
                                    direction: "OUTBOUND".to_string(),
                                    source: "LOCAL".to_string(),
                                    destination: "8.8.8.8".to_string(),
                                    protocol: "DNS".to_string(),
                                    length: dns_payload.len() as u32,
                                    message: format!("Suspicious DNS Query: {}", query),
                                    metadata: Some(serde_json::json!({ "query": query, "risk": "HIGH" })),
                                }
                            };
                            let _ = STDOUT_LOCK.lock().await;
                            println!("{}", serde_json::to_string(&event).unwrap());
                        }

                        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

                        // Simulation of a TLS SNI detection
                        let sni = "hidden-c2-v4.onion.to";
                        let event = PacketEvent {
                            event_type: "EXFIL_ALERT".to_string(),
                            success: true,
                            data: PacketData {
                                timestamp: Utc::now().to_rfc3339(),
                                direction: "OUTBOUND".to_string(),
                                source: "LOCAL".to_string(),
                                destination: "1.2.3.4".to_string(),
                                protocol: "TLS/SNI".to_string(),
                                length: 512,
                                message: format!("TLS Connection to: {}", sni),
                                metadata: Some(serde_json::json!({ "sni": sni, "risk": "MEDIUM" })),
                            }
                        };
                        let _ = STDOUT_LOCK.lock().await;
                        println!("{}", serde_json::to_string(&event).unwrap());
                    }
                });
                *handle = Some(h);
                emit_response(id, true, format!("Tactical dissection active on {}", interface)).await;
            }
            "StopCapture" => {
                let mut handle = capture_handle.lock().await;
                if let Some(h) = handle.take() {
                    h.abort();
                    log_forensic("info", "Dissector stopped").await;
                    emit_response(id, true, "Dissector terminated".to_string()).await;
                }
            }
            "GetStatus" => {
                let handle = capture_handle.lock().await;
                emit_response(id, true, if handle.is_some() { "Capturing" } else { "Idle" }.to_string()).await;
            }
            _ => {}
        }
    }
}
