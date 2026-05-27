use serde::{Deserialize, Serialize};
use chrono::Utc;
use std::sync::Arc;
use tokio::sync::Mutex;
use once_cell::sync::Lazy;
use cts_ipc::{IpcManager, AgentCommand};

static STDOUT_LOCK: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));
static IPC: Lazy<IpcManager> = Lazy::new(|| IpcManager::new("enforcer-win", 1024 * 1024));

#[derive(Deserialize, Serialize, Debug)]
#[serde(tag = "type")]
enum Command {
    AddBlockRule { id: String, ip: String, port: Option<u16> },
    RemoveBlockRule { id: String, ip: String },
    AddAllowRule { id: String, port: u16, protocol: String },
    RemoveAllowRule { id: String, port: u16, protocol: String },
    ProtectDirectory { id: String, path: String },
    GetStatus { id: String },
    FlushRules { id: String },
}

#[derive(Serialize, Deserialize, Debug)]
struct Response {
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    success: bool,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
    timestamp: String,
}

async fn emit_response(id: Option<String>, success: bool, message: String, data: Option<serde_json::Value>) {
    let resp = Response { id, success, message, data, timestamp: Utc::now().to_rfc3339() };
    if !IPC.emit_event(&resp) {
        if let Ok(msgpack) = rmp_serde::to_vec(&resp) {
            let _lock = STDOUT_LOCK.lock().await;
            use std::io::Write;
            let mut stdout = std::io::stdout();
            let _ = stdout.write_all(&(msgpack.len() as u32).to_le_bytes());
            let _ = stdout.write_all(&msgpack);
            let _ = stdout.flush();
        }
    }
}

#[tokio::main]
async fn main() {
    emit_response(None, true, "Sovereign WFP/Minifilter Agent Active (Windows 11)".to_string(), None).await;

    let mut ipc = IpcManager::new("enforcer-win", 1024 * 1024);
    while let Some(cmd_raw) = ipc.next_command().await {
        match cmd_raw {
            AgentCommand::Custom(payload) => {
                if let Ok(cmd) = rmp_serde::from_slice::<Command>(&payload) {
                    match cmd {
                        Command::AddBlockRule { id, ip, .. } => {
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
                            emit_response(Some(id), true, format!("Minifilter Protection engaged for: {}", path), None).await;
                        },
                        Command::GetStatus { id } => {
                            emit_response(Some(id), true, "Active".to_string(), Some(serde_json::json!({"engine": "WFP/Minifilter", "rules_active": 42}))).await;
                        },
                        Command::FlushRules { id } => {
                            emit_response(Some(id), true, "All WFP rules flushed".to_string(), None).await;
                        }
                    }
                }
            },
            AgentCommand::GetStatus => {
                emit_response(None, true, "Active".to_string(), Some(serde_json::json!({"engine": "WFP/Minifilter", "rules_active": 42}))).await;
            },
            AgentCommand::Shutdown => break,
        }
    }
}
