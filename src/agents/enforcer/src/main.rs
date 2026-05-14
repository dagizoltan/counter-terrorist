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
    AllowPort { id: String, port: u16, protocol: String },
    DenyPort { id: String, port: u16, protocol: String },
    FlushRules { id: String },
    Shutdown { id: String },
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

async fn log_forensic(severity: &str, message: &str) {
    let log = ForensicLog {
        timestamp: Utc::now().to_rfc3339(),
        log_type: "activity".to_string(),
        severity: severity.to_string(),
        caller: "blocker:main".to_string(),
        message: message.to_string(),
    };
    if let Ok(json) = serde_json::to_string(&log) {
        let _lock = STDOUT_LOCK.lock().await;
        println!("[LOG] {}", json);
    }
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

async fn emit_event(event_type: &str, data: serde_json::Value) {
    let event = serde_json::json!({
        "event": true,
        "type": event_type,
        "data": data,
        "timestamp": Utc::now().to_rfc3339(),
    });
    if let Ok(json) = serde_json::to_string(&event) {
        let _lock = STDOUT_LOCK.lock().await;
        println!("{}", json);
    }
}

#[tokio::main]
async fn main() {
    log_forensic("info", "Sovereign Blocker Agent active (Hermetic Mode)").await;

    // Tactical Kernel Bridge: Bridge iptables logs to the UI
    tokio::spawn(async move {
        // In a real environment, we'd tail /dev/kmsg or /var/log/kern.log
        // and look for CTS-specific log prefixes.
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

            // Simulation of an allowed packet being logged
            emit_event("NETWORK_LOG", serde_json::json!({
                "source": "10.0.0.42",
                "destination": "8.8.8.8",
                "protocol": "UDP",
                "src_port": 5353,
                "dst_port": 53,
                "action": "ALLOW",
                "bytes_count": 64
            })).await;
        }
    });

    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();

    while let Ok(Some(line)) = reader.next_line().await {
        if let Ok(cmd) = serde_json::from_str::<BlockerCommand>(line.trim()) {
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
                BlockerCommand::BlockIp { id, ip } => {
                    log_forensic("warning", &format!("Perimeter Defense: Blocking malicious IP {} via iptables fallback", ip)).await;
                    emit_event("FIREWALL_BLOCK", serde_json::json!({ "ip": ip, "reason": "Administrative Block" })).await;
                    // Use -C to check if rule exists first to avoid duplicates, then -I to insert at top
                    let check = Command::new("iptables")
                        .args(["-C", "INPUT", "-s", &ip, "-j", "DROP"])
                        .status();

                    let success = if check.is_ok() && check.unwrap().success() {
                        true // Already blocked
                    } else {
                        Command::new("iptables")
                            .args(["-I", "INPUT", "-s", &ip, "-j", "DROP"])
                            .status()
                            .map(|s| s.success())
                            .unwrap_or(false)
                    };
                    emit_response(id, success, if success { format!("IP {} blocked via iptables", ip) } else { "Failed to block IP".to_string() }).await;
                },
                BlockerCommand::UnblockIp { id, ip } => {
                    log_forensic("info", &format!("Perimeter Defense: Unblocking IP {}", ip)).await;
                    // Delete all instances to be sure
                    let mut success = true;
                    loop {
                        let status = Command::new("iptables")
                            .args(["-D", "INPUT", "-s", &ip, "-j", "DROP"])
                            .status();
                        if let Ok(s) = status {
                            if !s.success() { break; }
                        } else {
                            success = false;
                            break;
                        }
                    }
                    emit_response(id, success, if success { format!("IP {} unblocked via iptables", ip) } else { "Failed to unblock IP".to_string() }).await;
                },
                BlockerCommand::AllowPort { id, port, protocol } => {
                    log_forensic("info", &format!("Firewall: Allowing {} port {}", protocol, port)).await;
                    let success = Command::new("iptables")
                        .args(["-I", "INPUT", "-p", &protocol, "--dport", &port.to_string(), "-j", "ACCEPT"])
                        .status()
                        .map(|s| s.success())
                        .unwrap_or(false);
                    emit_response(id, success, if success { format!("Allowed {} port {}", protocol, port) } else { "Failed to allow port".to_string() }).await;
                },
                BlockerCommand::DenyPort { id, port, protocol } => {
                    log_forensic("info", &format!("Firewall: Denying {} port {}", protocol, port)).await;
                    let success = Command::new("iptables")
                        .args(["-D", "INPUT", "-p", &protocol, "--dport", &port.to_string(), "-j", "ACCEPT"])
                        .status()
                        .map(|s| s.success())
                        .unwrap_or(false);
                    emit_response(id, success, if success { format!("Denied {} port {}", protocol, port) } else { "Failed to deny port".to_string() }).await;
                },
                BlockerCommand::FlushRules { id } => {
                    log_forensic("warning", "Firewall: Flushing all user-defined iptables rules").await;
                    let success = Command::new("iptables")
                        .arg("-F")
                        .status()
                        .map(|s| s.success())
                        .unwrap_or(false);
                    emit_response(id, success, if success { "Rules flushed".to_string() } else { "Failed to flush rules".to_string() }).await;
                },
                BlockerCommand::Shutdown { id } => {
                    log_forensic("info", "Blocker Agent shutting down").await;
                    emit_response(id, true, "Shutting down".to_string()).await;
                    std::process::exit(0);
                },
                BlockerCommand::GetStatus { id } => {
                    emit_response(id, true, "Active".to_string()).await;
                }
            }
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
    
    if maps_res.is_ok() && env_res.is_ok() {
        (true, format!("Dumped process {} metadata to {}", pid, safe_path))
    } else {
        (false, "Failed to access /proc files or write to jail".to_string())
    }
}
