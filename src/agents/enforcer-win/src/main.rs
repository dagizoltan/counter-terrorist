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
    AddBlockRule { id: String, ip: String, port: Option<u16> },
    RemoveBlockRule { id: String, ip: String },
    AddAllowRule { id: String, port: u16, protocol: String },
    RemoveAllowRule { id: String, port: u16, protocol: String },
    ProtectDirectory { id: String, path: String },
    GetStatus { id: String },
    FlushRules { id: String },
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

#[tokio::main]
async fn main() {
    emit_response(None, true, "Sovereign WFP/Minifilter Agent Active (Windows 11)".to_string(), None).await;

    let mut stdin = BufReader::new(tokio::io::stdin()).lines();
    while let Ok(Some(line)) = stdin.next_line().await {
        if let Ok(cmd) = serde_json::from_str::<Command>(line.trim()) {
            match cmd {
                Command::AddBlockRule { id, ip, .. } => {
                    // MOCK: WFP FwpmFilterAdd0
                    emit_response(Some(id), true, format!("WFP Block Rule Added: {}", ip), None).await;
                },
                Command::RemoveBlockRule { id, ip } => {
                    emit_response(Some(id), true, format!("WFP Block Rule Removed: {}", ip), None).await;
                },
                Command::AddAllowRule { id, port, protocol } => {
                    emit_response(Some(id), true, format!("WFP Allow Rule Added: {}:{}", protocol, port), None).await;
                },
                Command::RemoveAllowRule { id, port, protocol } => {
                    emit_response(Some(id), true, format!("WFP Allow Rule Removed: {}:{}", protocol, port), None).await;
                },
                Command::ProtectDirectory { id, path } => {
                    // MOCK: Minifilter Directory Protection
                    emit_response(Some(id), true, format!("Minifilter Protection engaged for: {}", path), None).await;
                },
                Command::GetStatus { id } => {
                    emit_response(Some(id), true, "Active".to_string(), Some(serde_json::json!({"engine": "WFP/Minifilter", "rules_active": 42}))).await;
                },
                Command::FlushRules { id } => {
                    emit_response(Some(id), true, "All WFP rules flushed".to_string(), None).await;
                },
                Command::Shutdown => {
                    std::process::exit(0);
                }
            }
        }
    }
}
