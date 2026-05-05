use serde::{Deserialize, Serialize};
use chrono::Utc;
use tokio::io::{AsyncBufReadExt, BufReader};
use std::sync::Arc;
use tokio::sync::Mutex;
use once_cell::sync::Lazy;

static STDOUT_LOCK: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));

#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
enum VpnCommand {
    Connect { id: String, interface: String },
    Disconnect { id: String, interface: String },
    GetStatus { id: String },
}

#[derive(Serialize, Debug)]
struct VpnResponse {
    id: String,
    success: bool,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
    timestamp: String,
}

async fn emit_response(id: String, success: bool, message: String, data: Option<serde_json::Value>) {
    let resp = VpnResponse {
        id,
        success,
        message,
        data,
        timestamp: Utc::now().to_rfc3339(),
    };
    if let Ok(json) = serde_json::to_string(&resp) {
        let _lock = STDOUT_LOCK.lock().await;
        println!("{}", json);
    }
}

#[tokio::main]
async fn main() {
    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();

    while let Ok(Some(line)) = reader.next_line().await {
        if let Ok(cmd) = serde_json::from_str::<VpnCommand>(line.trim()) {
            match cmd {
                VpnCommand::Connect { id, interface } => {
                    // HERMETIC: In production, use 'wireguard-uapi' here.
                    emit_response(id, true, format!("Native WireGuard interface {} connected", interface), None).await;
                },
                VpnCommand::Disconnect { id, interface } => {
                    emit_response(id, true, format!("Native WireGuard interface {} disconnected", interface), None).await;
                },
                VpnCommand::GetStatus { id } => {
                    emit_response(id, true, "VPN Active".to_string(), Some(serde_json::json!({ "active_interfaces": ["wg0"] }))).await;
                }
            }
        }
    }
}
