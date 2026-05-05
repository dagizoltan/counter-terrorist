use serde::{Deserialize, Serialize};
use sysinfo::{ProcessExt, System, SystemExt, Pid, PidExt};
use std::process::Command;
use chrono::Utc;
use tokio::io::{AsyncBufReadExt, BufReader};
use std::sync::Arc;
use tokio::sync::Mutex;
use once_cell::sync::Lazy;

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
}

async fn emit_response(id: String, success: bool, message: String) {
    let resp = SidecarResponse {
        id: Some(id),
        success,
        message: Some(message),
        data: None,
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
        if let Ok(cmd) = serde_json::from_str::<BlockerCommand>(line.trim()) {
            tokio::spawn(async move {
                match cmd {
                    BlockerCommand::KillProcess { id, pid } => {
                        let res = kill_process_task(pid).await;
                        emit_response(id, res.0, res.1).await;
                    },
                    BlockerCommand::QuarantineProcess { id, pid } => {
                        let res = quarantine_process_task(pid).await;
                        emit_response(id, res.0, res.1).await;
                    },
                    BlockerCommand::DumpProcess { id, pid, path } => {
                        let res = dump_process_task(pid, path).await;
                        emit_response(id, res.0, res.1).await;
                    },
                    BlockerCommand::BlockIp { id, ip } => {
                        // HERMETIC: IP blocking is now handled by the eBPF sidecar
                        emit_response(id, false, "IP blocking delegated to eBPF/XDP".to_string()).await;
                    },
                    BlockerCommand::UnblockIp { id, ip } => {
                        emit_response(id, false, "IP unblocking delegated to eBPF/XDP".to_string()).await;
                    }
                }
            });
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
        // Native SIGSTOP
        let success = process.kill_with(sysinfo::Signal::Stop).unwrap_or(false);
        (success, if success { format!("Quarantined (SIGSTOP) process {}", pid) } else { format!("Failed to stop {}", pid) })
    } else {
        (false, "Process not found".to_string())
    }
}

async fn dump_process_task(pid: u32, path: String) -> (bool, String) {
    // Hermetic: Manual procfs copy instead of cp/gcore
    let maps_res = std::fs::copy(format!("/proc/{}/maps", pid), format!("{}.maps", path));
    let env_res = std::fs::copy(format!("/proc/{}/environ", pid), format!("{}.environ", path));
    
    if maps_res.is_ok() && env_res.is_ok() {
        (true, format!("Dumped process {} metadata to {}", pid, path))
    } else {
        (false, "Failed to access /proc files".to_string())
    }
}
