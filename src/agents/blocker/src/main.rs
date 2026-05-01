use serde::{Deserialize, Serialize};
use sysinfo::{ProcessExt, System, SystemExt, Pid, PidExt};
use std::process::Command;
use std::io;
use chrono::Utc;
use tokio::io::{AsyncBufReadExt, BufReader};

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
    BlockIp { id: String, ip: String },
    UnblockIp { id: String, ip: String },
}

fn emit_response(id: String, success: bool, message: String) {
    let resp = SidecarResponse {
        id: Some(id),
        success,
        message: Some(message),
        data: None,
        timestamp: Utc::now().to_rfc3339(),
    };
    if let Ok(json) = serde_json::to_string(&resp) {
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
                        emit_response(id, res.0, res.1);
                    },
                    BlockerCommand::BlockIp { id, ip } => {
                        let res = block_ip_task(ip).await;
                        emit_response(id, res.0, res.1);
                    },
                    BlockerCommand::UnblockIp { id, ip } => {
                        let res = unblock_ip_task(ip).await;
                        emit_response(id, res.0, res.1);
                    }
                }
            });
        }
    }
}

async fn kill_process_task(pid: u32) -> (bool, String) {
    let mut sys = System::new();
    let my_pid = std::process::id();
    
    if pid < 100 { return (false, format!("Refusing to kill system process {}", pid)); }
    if pid == my_pid { return (false, "Refusing to kill self".to_string()); }

    sys.refresh_process(Pid::from_u32(pid));
    
    if let Some(process) = sys.process(Pid::from_u32(pid)) {
        let name = process.name().to_string();
        let success = process.kill();
        (success, if success { format!("Killed process {} ({})", pid, name) } else { format!("Failed to kill process {}", pid) })
    } else {
        (false, format!("Process {} not found", pid))
    }
}

async fn block_ip_task(ip: String) -> (bool, String) {
    if ip.parse::<std::net::IpAddr>().is_err() {
        return (false, format!("Invalid IP: {}", ip));
    }
    
    let ip_clone = ip.clone();
    let output = tokio::task::spawn_blocking(move || {
        Command::new("ufw").args(["deny", "from", &ip_clone]).output()
    }).await;

    match output {
        Ok(Ok(out)) => (out.status.success(), format!("UFW block for {}", ip)),
        Ok(Err(e)) => (false, format!("UFW failed: {}", e)),
        Err(e) => (false, format!("Task panicked: {}", e)),
    }
}

async fn unblock_ip_task(ip: String) -> (bool, String) {
    let ip_clone = ip.clone();
    let output = tokio::task::spawn_blocking(move || {
        Command::new("ufw").args(["delete", "deny", "from", &ip_clone]).output()
    }).await;

    match output {
        Ok(Ok(out)) => (out.status.success(), format!("UFW unblock for {}", ip)),
        Ok(Err(e)) => (false, format!("UFW failed: {}", e)),
        Err(e) => (false, format!("Task panicked: {}", e)),
    }
}
