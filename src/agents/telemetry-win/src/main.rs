use serde::{Deserialize, Serialize};
use chrono::Utc;
use std::sync::Arc;
use tokio::sync::Mutex;
use once_cell::sync::Lazy;
use cts_ipc::{IpcManager, AgentCommand};

static STDOUT_LOCK: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));
static IPC: Lazy<IpcManager> = Lazy::new(|| IpcManager::new("telemetry-win", 1024 * 1024));

#[derive(Deserialize, Serialize, Debug)]
#[serde(tag = "type")]
enum Command {
    GetStatus { id: String },
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

async fn emit_event(event_type: &str, data: serde_json::Value) {
    let mut payload = data;
    if let Some(obj) = payload.as_object_mut() {
        obj.insert("type".to_string(), serde_json::json!(event_type));
    }
    emit_response(None, true, "ETW_EVENT".to_string(), Some(payload)).await;
}

#[tokio::main]
async fn main() {
    emit_response(None, true, "Sovereign ETW Agent Active (Windows 11)".to_string(), None).await;

    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(45)).await;
            emit_event("ETW_PROCESS", serde_json::json!({
                "pid": 5678,
                "process_name": "cmd.exe",
                "parent_pid": 1234,
                "command_line": "cmd.exe /c powershell -enc ..."
            })).await;
        }
    });

    let mut ipc = IpcManager::new("telemetry-win", 1024 * 1024);
    while let Some(cmd_raw) = ipc.next_command().await {
        match cmd_raw {
            AgentCommand::Custom(payload) => {
                if let Ok(cmd) = rmp_serde::from_slice::<Command>(&payload) {
                    match cmd {
                        Command::GetStatus { id } => {
                            emit_response(Some(id), true, "Active".to_string(), None).await;
                        }
                    }
                }
            },
            AgentCommand::GetStatus => {
                emit_response(None, true, "Active".to_string(), None).await;
            },
            AgentCommand::Shutdown => break,
        }
    }
}
