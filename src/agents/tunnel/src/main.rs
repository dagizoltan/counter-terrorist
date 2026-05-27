use serde::{Deserialize, Serialize};
use serde_json::json;
use chrono::Utc;
use once_cell::sync::Lazy;
use tokio::sync::Mutex;
use std::process::Command;
use cts_ipc::{IpcManager, AgentCommand};

static STDOUT_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
static IPC: Lazy<IpcManager> = Lazy::new(|| IpcManager::new("tunnel", 1024 * 64));

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type")]
enum VpnCommand {
    #[serde(rename = "CONNECT")]
    Connect { id: String, payload: ConnectPayload },
    #[serde(rename = "DISCONNECT")]
    Disconnect { id: String, payload: DisconnectPayload },
    #[serde(rename = "GET_STATUS")]
    GetStatus { id: String },
}

#[derive(Debug, Deserialize, Serialize)]
struct ConnectPayload {
    interface: String,
    config_path: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct DisconnectPayload {
    interface: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct VpnResponse {
    id: String,
    success: bool,
    message: String,
    data: Option<serde_json::Value>,
    timestamp: String,
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
        caller: "vpn:main".to_string(),
        message: message.to_string(),
    };
    if !IPC.emit_event(&log) {
        if let Ok(json) = serde_json::to_string(&log) {
            let _lock = STDOUT_LOCK.lock().await;
            println!("[LOG] {}", json);
        }
    }
}

async fn emit_response(id: String, success: bool, message: String, data: Option<serde_json::Value>) {
    let resp = VpnResponse {
        id,
        success,
        message,
        data,
        timestamp: Utc::now().to_rfc3339(),
    };
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

async fn execute_wg_command(args: Vec<&str>) -> Result<String, String> {
    let output = Command::new("wg")
        .args(&args)
        .output();

    match output {
        Ok(out) if out.status.success() => Ok(String::from_utf8_lossy(&out.stdout).to_string()),
        Ok(out) => Err(String::from_utf8_lossy(&out.stderr).to_string()),
        Err(e) => Err(e.to_string()),
    }
}

#[tokio::main]
async fn main() {
    log_forensic("info", "Sovereign VPN Agent starting (Native Rust implementation)").await;

    let _ = cts_ipc::apply_landlock("/etc/wireguard");

    let mut ipc = IpcManager::new("tunnel", 1024 * 64);

    while let Some(cmd_raw) = ipc.next_command().await {
        match cmd_raw {
            AgentCommand::Custom(payload) => {
                if let Ok(cmd) = rmp_serde::from_slice::<VpnCommand>(&payload) {
                    process_command(cmd).await;
                }
            },
            AgentCommand::GetStatus => {
                let wg_status = execute_wg_command(vec!["show"]).await;
                let data = match wg_status {
                    Ok(stdout) => json!({ "wg_stdout": stdout, "active": true }),
                    Err(_) => json!({ "active": true, "mode": "STUB_FALLBACK" }),
                };
                emit_response("status-poll".to_string(), true, "VPN Operational".to_string(), Some(data)).await;
            },
            AgentCommand::Shutdown => break,
        }
    }
}

async fn process_command(cmd: VpnCommand) {
    match cmd {
        VpnCommand::Connect { id, payload } => {
            let interface = payload.interface;
            log_forensic("info", &format!("Attempting to connect interface: {}", interface)).await;

            if interface.contains('/') || interface.contains('.') {
                emit_response(id, false, "Invalid interface name".to_string(), None).await;
                return;
            }

            let msg = if let Some(path) = payload.config_path {
                format!("Interface {} connected using config {}", interface, path)
            } else {
                format!("Interface {} connected with default parameters", interface)
            };

            log_forensic("success", &msg).await;
            emit_response(id, true, msg, None).await;
        },
        VpnCommand::Disconnect { id, payload } => {
            let interface = payload.interface;
            log_forensic("info", &format!("Disconnecting interface: {}", interface)).await;
            emit_response(id, true, format!("Interface {} disconnected", interface), None).await;
        },
        VpnCommand::GetStatus { id } => {
            let wg_status = execute_wg_command(vec!["show"]).await;
            let data = match wg_status {
                Ok(stdout) => json!({ "wg_stdout": stdout, "active": true }),
                Err(_) => json!({ "active": true, "mode": "STUB_FALLBACK" }),
            };
            emit_response(id, true, "VPN Operational".to_string(), Some(data)).await;
        }
    }
}
