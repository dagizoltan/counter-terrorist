use serde::{Deserialize, Serialize};
use sysinfo::{ProcessExt, System, SystemExt, Pid, PidExt};
use std::env;
use std::process::Command;

#[derive(Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
enum BlockerCommand {
    KillProcess { pid: u32 },
    BlockIp { ip: String },
    UnblockIp { ip: String },
}

#[derive(Serialize, Debug)]
struct BlockerResponse {
    id: String,
    success: bool,
    message: String,
    timestamp: String,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: blocker <json_command>");
        std::process::exit(1);
    }

    let cmd_json = &args[1];

    // We need to extract the ID manually or use a wrapper struct because the command is tagged
    let raw_cmd: serde_json::Value = match serde_json::from_str(cmd_json) {
        Ok(v) => v,
        Err(e) => {
             let res = BlockerResponse {
                id: "unknown".to_string(),
                success: false,
                message: format!("Invalid JSON: {}", e),
                timestamp: chrono::Utc::now().to_rfc3339(),
            };
            println!("{}", serde_json::to_string(&res).unwrap());
            return;
        }
    };

    let id = raw_cmd["id"].as_str().unwrap_or("unknown").to_string();

    let command: BlockerCommand = match serde_json::from_value(raw_cmd) {
        Ok(c) => c,
        Err(e) => {
            let res = BlockerResponse {
                id,
                success: false,
                message: format!("Invalid command structure: {}", e),
                timestamp: chrono::Utc::now().to_rfc3339(),
            };
            println!("{}", serde_json::to_string(&res).unwrap());
            return;
        }
    };

    let response = match command {
        BlockerCommand::KillProcess { pid } => kill_process(id, pid),
        BlockerCommand::BlockIp { ip } => block_ip(id, ip),
        BlockerCommand::UnblockIp { ip } => unblock_ip(id, ip),
    };

    println!("{}", serde_json::to_string(&response).unwrap());
}

fn kill_process(id: String, pid: u32) -> BlockerResponse {
    let my_pid = std::process::id();

    if pid < 100 {
        return BlockerResponse {
            id,
            success: false,
            message: format!("Refusing to kill system process {} (PID < 100)", pid),
            timestamp: chrono::Utc::now().to_rfc3339(),
        };
    }

    if pid == my_pid {
        return BlockerResponse {
            id,
            success: false,
            message: "Refusing to kill self".to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        };
    }

    let mut sys = System::new_all();
    sys.refresh_all();

    // Check if process is parent
    let my_process = sys.process(Pid::from_u32(my_pid));
    if let Some(me) = my_process {
        if let Some(ppid) = me.parent() {
            if pid == ppid.as_u32() {
                return BlockerResponse {
                    id,
                    success: false,
                    message: "Refusing to kill parent orchestrator process".to_string(),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                };
            }
        }
    }

    if let Some(process) = sys.process(Pid::from_u32(pid)) {
        let name = process.name().to_string();
        let success = process.kill();
        BlockerResponse {
            id,
            success,
            message: if success { format!("Killed process {} ({})", pid, name) } else { format!("Failed to kill process {}", pid) },
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    } else {
        BlockerResponse {
            id,
            success: false,
            message: format!("Process {} not found", pid),
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    }
}

fn block_ip(id: String, ip: String) -> BlockerResponse {
    if ip.parse::<std::net::IpAddr>().is_err() {
        return BlockerResponse {
            id: id.clone(),
            success: false,
            message: format!("Invalid IP address: {}", ip),
            timestamp: chrono::Utc::now().to_rfc3339(),
        };
    }

    let os = std::env::consts::OS;
    if os != "linux" {
        return BlockerResponse {
            id,
            success: false,
            message: format!("Unsupported OS: {}. Only Linux is supported.", os),
            timestamp: chrono::Utc::now().to_rfc3339(),
        };
    }

    // Check if rule already exists (idempotency)
    let status_output = Command::new("ufw")
        .args(["status", "verbose"])
        .output();

    if let Ok(out) = status_output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        if stdout.contains(&ip) && stdout.contains("DENY IN") {
            return BlockerResponse {
                id,
                success: true,
                message: format!("IP {} is already blocked", ip),
                timestamp: chrono::Utc::now().to_rfc3339(),
            };
        }
    }

    let output = Command::new("ufw")
        .args(["deny", "from", &ip])
        .output();
    match output {
        Ok(out) => BlockerResponse {
            id,
            success: out.status.success(),
            message: format!("Firewall command executed for IP: {}", ip),
            timestamp: chrono::Utc::now().to_rfc3339(),
        },
        Err(e) => BlockerResponse {
            id,
            success: false,
            message: format!("Failed to execute firewall command: {}", e),
            timestamp: chrono::Utc::now().to_rfc3339(),
        },
    }
}

fn unblock_ip(id: String, ip: String) -> BlockerResponse {
    if ip.parse::<std::net::IpAddr>().is_err() {
        return BlockerResponse {
            id: id.clone(),
            success: false,
            message: format!("Invalid IP address: {}", ip),
            timestamp: chrono::Utc::now().to_rfc3339(),
        };
    }

    let os = std::env::consts::OS;
    if os != "linux" {
        return BlockerResponse {
            id,
            success: false,
            message: format!("Unsupported OS: {}. Only Linux is supported.", os),
            timestamp: chrono::Utc::now().to_rfc3339(),
        };
    }

    let output = Command::new("ufw")
        .args(["delete", "deny", "from", &ip])
        .output();
    match output {
        Ok(out) => BlockerResponse {
            id,
            success: out.status.success(),
            message: format!("Firewall unblock command executed for IP: {}", ip),
            timestamp: chrono::Utc::now().to_rfc3339(),
        },
        Err(e) => BlockerResponse {
            id,
            success: false,
            message: format!("Failed to execute firewall unblock command: {}", e),
            timestamp: chrono::Utc::now().to_rfc3339(),
        },
    }
}
