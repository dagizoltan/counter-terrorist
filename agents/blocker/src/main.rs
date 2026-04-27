use serde::{Deserialize, Serialize};
use sysinfo::{ProcessExt, System, SystemExt, Pid, PidExt};
use std::env;
use std::process::Command;

#[derive(Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
enum BlockerCommand {
    KillProcess { pid: u32 },
    BlockIp { ip: String },
    RateLimit { ip: String },
    GeoBlock { ip_range: String },
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
        BlockerCommand::RateLimit { ip } => rate_limit_ip(ip),
        BlockerCommand::GeoBlock { ip_range } => geo_block(ip_range),
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
    if ip.parse::<std::net::IpAddr>().is_err() {
        return BlockerResponse {
            success: false,
            message: format!("Invalid IP address: {}", ip),
            timestamp: chrono::Utc::now().to_rfc3339(),
        };
    }

    run_ufw_command(&["deny", "from", &ip], &format!("Blocked IP: {}", ip))
}

fn rate_limit_ip(ip: String) -> BlockerResponse {
    if ip.parse::<std::net::IpAddr>().is_err() {
        return BlockerResponse {
            success: false,
            message: format!("Invalid IP address for rate limiting: {}", ip),
            timestamp: chrono::Utc::now().to_rfc3339(),
        };
    }

    run_ufw_command(&["limit", "from", &ip], &format!("Rate limited IP: {}", ip))
}

fn geo_block(ip_range: String) -> BlockerResponse {
    // Basic validation for IP range (CIDR)
    if !ip_range.contains('/') {
         return BlockerResponse {
            success: false,
            message: format!("Invalid IP range (CIDR expected): {}", ip_range),
            timestamp: chrono::Utc::now().to_rfc3339(),
        };
    }

    run_ufw_command(&["deny", "from", &ip_range], &format!("Geo-blocked IP range: {}", ip_range))
}

fn run_ufw_command(args: &[&str], success_msg: &str) -> BlockerResponse {
    let os = std::env::consts::OS;
    if os != "linux" {
        return BlockerResponse {
            success: false,
            message: format!("Unsupported OS: {}. Only Linux is supported.", os),
            timestamp: chrono::Utc::now().to_rfc3339(),
        };
    }

    let output = Command::new("ufw")
        .args(args)
        .output();
    match output {
        Ok(out) => BlockerResponse {
            success: out.status.success(),
            message: if out.status.success() { success_msg.to_string() } else { format!("UFW command failed: {}", String::from_utf8_lossy(&out.stderr)) },
            timestamp: chrono::Utc::now().to_rfc3339(),
        },
        Err(e) => BlockerResponse {
            success: false,
            message: format!("Failed to execute UFW command: {}", e),
            timestamp: chrono::Utc::now().to_rfc3339(),
        },
    }
}
