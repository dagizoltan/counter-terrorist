use serde::{Deserialize, Serialize};
use sysinfo::{PidExt, ProcessExt, System, SystemExt};
use std::io::{self, BufRead};
use std::process::Command;

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
enum ScannerCommand {
    GetProcesses,
    RunRkhunter,
    SCAN, // Legacy support for baseline
}

#[derive(Serialize, Deserialize, Debug)]
struct ProcessInfo {
    pid: u32,
    name: String,
    cpu_usage: f32,
    memory_usage: u64,
    #[serde(default)]
    exe_path: String,
    #[serde(default)]
    hash: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
enum ScannerResponse {
    ProcessList(Vec<ProcessInfo>),
    RkhunterResult {
        success: bool,
        output: String,
    },
    #[serde(rename = "SCAN")]
    ScanResponse {
        processes: Vec<ProcessInfo>,
    },
    Error(String),
}

fn main() {
    let stdin = io::stdin();
    let mut sys = System::new_all();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Try parsing as JSON first, fallback to legacy "SCAN" string
        let command: ScannerCommand = if trimmed == "SCAN" {
            ScannerCommand::SCAN
        } else {
            match serde_json::from_str(trimmed) {
                Ok(c) => c,
                Err(e) => {
                    let resp = ScannerResponse::Error(format!("Invalid command: {}", e));
                    println!("{}", serde_json::to_string(&resp).unwrap());
                    continue;
                }
            }
        };

        let response = match command {
            ScannerCommand::GetProcesses | ScannerCommand::SCAN => {
                sys.refresh_all();
                let mut processes = Vec::new();
                for (pid, process) in sys.processes() {
                    processes.push(ProcessInfo {
                        pid: pid.as_u32(),
                        name: process.name().to_string(),
                        cpu_usage: process.cpu_usage(),
                        memory_usage: process.memory(),
                        exe_path: process.exe().to_string_lossy().to_string(),
                        hash: "".to_string(), // Hash calculation not implemented in this milestone
                    });
                }
                processes.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap());

                if matches!(command, ScannerCommand::SCAN) {
                    ScannerResponse::ScanResponse { processes }
                } else {
                    let top_processes = processes.into_iter().take(20).collect();
                    ScannerResponse::ProcessList(top_processes)
                }
            }
            ScannerCommand::RunRkhunter => {
                match Command::new("rkhunter").args(["--check", "--sk", "--nocolors"]).output() {
                    Ok(output) => ScannerResponse::RkhunterResult {
                        success: output.status.success(),
                        output: String::from_utf8_lossy(&output.stdout).to_string(),
                    },
                    Err(e) => ScannerResponse::Error(format!("Failed to execute rkhunter: {}", e)),
                }
            }
        };

        println!("{}", serde_json::to_string(&response).unwrap());
    }
}
