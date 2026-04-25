use serde::{Deserialize, Serialize};
use sysinfo::{ProcessExt, System, SystemExt, Pid, PidExt};
use std::env;
use std::process::Command;

#[derive(Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
enum BlockerCommand {
    KillProcess { pid: u32 },
    BlockIp { ip: String },
}

#[derive(Serialize, Debug)]
struct BlockerResponse {
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
    let command: BlockerCommand = match serde_json::from_str(cmd_json) {
        Ok(c) => c,
        Err(e) => {
            let res = BlockerResponse {
                success: false,
                message: format!("Invalid command: {}", e),
                timestamp: chrono::Utc::now().to_rfc3339(),
            };
            println!("{}", serde_json::to_string(&res).unwrap());
            return;
        }
    };

    let response = match command {
        BlockerCommand::KillProcess { pid } => kill_process(pid),
        BlockerCommand::BlockIp { ip } => block_ip(ip),
    };

    println!("{}", serde_json::to_string(&response).unwrap());
}

fn kill_process(pid: u32) -> BlockerResponse {
    let mut sys = System::new_all();
    sys.refresh_all();

    if let Some(process) = sys.process(Pid::from_u32(pid)) {
        let name = process.name().to_string();
        let success = process.kill();
        BlockerResponse {
            success,
            message: if success { format!("Killed process {} ({})", pid, name) } else { format!("Failed to kill process {}", pid) },
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    } else {
        BlockerResponse {
            success: false,
            message: format!("Process {} not found", pid),
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    }
}

fn block_ip(ip: String) -> BlockerResponse {
    let os = std::env::consts::OS;
    let (cmd, args) = if os == "linux" {
        ("ufw", vec!["deny", "from", &ip])
    } else if os == "macos" {
        // macOS PacketFilter (PF) requires more complex management, placeholder for PoC
        ("echo", vec!["Blocking IP on macOS via PF (Stub):", &ip])
    } else if os == "windows" {
        ("netsh", vec!["advfirewall", "firewall", "add", "rule", &format!("name=BlockIP_{}", ip), "dir=in", "action=block", &format!("remoteip={}", ip)])
    } else {
        ("echo", vec!["Unsupported OS for firewall blocking"])
    };

    let output = Command::new(cmd).args(args).output();
    match output {
        Ok(out) => BlockerResponse {
            success: out.status.success(),
            message: format!("Firewall command executed for IP: {}", ip),
            timestamp: chrono::Utc::now().to_rfc3339(),
        },
        Err(e) => BlockerResponse {
            success: false,
            message: format!("Failed to execute firewall command: {}", e),
            timestamp: chrono::Utc::now().to_rfc3339(),
        },
    }
}
