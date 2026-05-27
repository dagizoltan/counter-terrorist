use serde::{Deserialize, Serialize};
use sysinfo::{ProcessExt, System, SystemExt, Pid, PidExt};
use std::process::Command;
use chrono::Utc;
use tokio::io::{self, AsyncReadExt};
use std::sync::Arc;
use tokio::sync::Mutex;
use once_cell::sync::Lazy;
use bytes::BytesMut;

static STDOUT_LOCK: Lazy<Arc<Mutex<()>>> = Lazy::new(|| Arc::new(Mutex::new(())));

#[derive(Serialize, Deserialize, Debug)]
struct SidecarResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
    timestamp: String,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
enum BlockerCommand {
    KillProcess { id: String, pid: u32 },
    QuarantineProcess { id: String, pid: u32 },
    DumpProcess { id: String, pid: u32, path: String },
    BlockIp { id: String, ip: String },
    UnblockIp { id: String, ip: String },
    GetStatus { id: String },
}

#[derive(Debug, Serialize)]
struct ForensicLog {
    timestamp: String,
    log_type: String,
    severity: String,
    caller: String,
    message: String,
}

static IPC: Lazy<cts_ipc::IpcManager> = Lazy::new(|| cts_ipc::IpcManager::new("enforcer", 1024 * 1024));

async fn log_forensic(severity: &str, message: &str) {
    IPC.log::<()>(severity, message);
}

async fn emit_response(id: String, success: bool, message: String) {
    let resp = SidecarResponse {
        id: Some(id),
        success,
        message: Some(message),
        data: None,
        timestamp: Utc::now().to_rfc3339(),
    };
    IPC.emit_event(&resp);
}

#[tokio::main]
async fn main() {
    log_forensic("info", "Sovereign Blocker Agent active (Hermetic Mode)").await;

    // SOV-P5: Mandated Dynamic Landlock gating
    let _ = cts_ipc::apply_landlock("/proc");
    let _ = cts_ipc::apply_landlock("/sys");
    let _ = cts_ipc::apply_landlock("./volume");

    let mut stdin = io::stdin();
    let mut buffer = BytesMut::with_capacity(4096);

    loop {
        let mut byte_buf = [0u8; 1024];
        let n = match stdin.read(&mut byte_buf).await {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };
        buffer.extend_from_slice(&byte_buf[..n]);

        while !buffer.is_empty() {
            if let Ok(cmd) = rmp_serde::from_slice::<BlockerCommand>(&buffer) {
                handle_enforcer_command(cmd).await;
                buffer.clear();
                break;
            }

            if let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
                let line_bytes = buffer.split_to(pos + 1);
                if let Ok(cmd) = serde_json::from_slice::<BlockerCommand>(&line_bytes[..pos]) {
                    handle_enforcer_command(cmd).await;
                }
            } else {
                break;
            }
        }
    }
}

async fn handle_enforcer_command(cmd: BlockerCommand) {
            match cmd {
                BlockerCommand::KillProcess { id, pid } => {
                    log_forensic("info", &format!("Executing kill on PID {}", pid)).await;
                    let res = kill_process_task(pid).await;
                    emit_response(id, res.0, res.1).await;
                },
                BlockerCommand::QuarantineProcess { id, pid } => {
                    log_forensic("info", &format!("Executing quarantine on PID {}", pid)).await;
                    let res = quarantine_process_task(pid).await;
                    emit_response(id, res.0, res.1).await;
                },
                BlockerCommand::DumpProcess { id, pid, path } => {
                    log_forensic("info", &format!("Executing memory dump on PID {} to {}", pid, path)).await;
                    let res = dump_process_task(pid, path).await;
                    emit_response(id, res.0, res.1).await;
                },
                BlockerCommand::BlockIp { id, .. } => {
                    emit_response(id, false, "IP blocking delegated to eBPF/XDP".to_string()).await;
                },
                BlockerCommand::UnblockIp { id, .. } => {
                    emit_response(id, false, "IP unblocking delegated to eBPF/XDP".to_string()).await;
                },
                BlockerCommand::GetStatus { id } => {
                    emit_response(id, true, "Active".to_string()).await;
                }
            }
}

async fn kill_process_task(pid: u32) -> (bool, String) {
    let mut sys = System::new();
    sys.refresh_process(Pid::from_u32(pid));
    
    if let Some(process) = sys.process(Pid::from_u32(pid)) {
        let success = process.kill();
        (success, if success { format!("Killed process {}", pid) } else { format!("Failed to kill {}", pid) })
    } else {
        (false, "Process not found".to_string())
    }
}

async fn quarantine_process_task(pid: u32) -> (bool, String) {
    let mut sys = System::new();
    sys.refresh_process(Pid::from_u32(pid));
    
    if let Some(process) = sys.process(Pid::from_u32(pid)) {
        let success = process.kill_with(sysinfo::Signal::Stop).unwrap_or(false);
        (success, if success { format!("Quarantined (SIGSTOP) process {}", pid) } else { format!("Failed to stop {}", pid) })
    } else {
        (false, "Process not found".to_string())
    }
}

async fn dump_process_task(pid: u32, requested_path: String) -> (bool, String) {
    let base_dir = "./volume/storage/forensics";
    
    // Ensure the jail directory exists
    if let Err(e) = std::fs::create_dir_all(base_dir) {
        return (false, format!("Failed to create jail directory: {}", e));
    }

    // SECURITY: Extract only the filename from the requested path to prevent traversal
    let path_obj = std::path::Path::new(&requested_path);
    let filename = match path_obj.file_name() {
        Some(name) => name.to_string_lossy(),
        None => return (false, "Invalid dump filename".to_string()),
    };

    let safe_path = format!("{}/{}", base_dir, filename);
    
    let maps_res = std::fs::copy(format!("/proc/{}/maps", pid), format!("{}.maps", safe_path));
    let env_res = std::fs::copy(format!("/proc/{}/environ", pid), format!("{}.environ", safe_path));
    
    match (maps_res, env_res) {
        (Ok(_), Ok(_)) => (true, format!("Dumped process {} metadata to {}", pid, safe_path)),
        (Err(e), _) | (_, Err(e)) => {
            (false, format!("Forensic dump failed for PID {}: {}", pid, e))
        }
    }
}
