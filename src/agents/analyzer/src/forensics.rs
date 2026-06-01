use serde::{Serialize};
use std::fs::{File};
use std::io::BufRead;

#[derive(Serialize, Debug)]
pub struct MemoryAnomaly {
    pub pid: u32,
    pub address_range: String,
    pub perms: String,
    pub reason: String,
}

pub fn scan_process_memory(pid: u32) -> Vec<MemoryAnomaly> {
    let mut anomalies = Vec::new();
    let maps_path = format!("/proc/{}/maps", pid);

    if let Ok(file) = File::open(&maps_path) {
        let reader = std::io::BufReader::new(file);
        for line in reader.lines().map_while(Result::ok) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 2 { continue; }

            let range = parts[0];
            let perms = parts[1];

            if perms.contains("rwx") {
                anomalies.push(MemoryAnomaly {
                    pid,
                    address_range: range.to_string(),
                    perms: perms.to_string(),
                    reason: "Simultaneous RWX permissions detected (Shellcode indicator)".to_string(),
                });
            }

            if perms.contains('x') && parts.len() < 6 {
                anomalies.push(MemoryAnomaly {
                    pid,
                    address_range: range.to_string(),
                    perms: perms.to_string(),
                    reason: "Anonymous executable memory detected (Potential shellcode injection)".to_string(),
                });
            }

            if perms.contains('x') && perms.contains('w') && parts.len() < 6 {
                anomalies.push(MemoryAnomaly {
                    pid,
                    address_range: range.to_string(),
                    perms: perms.to_string(),
                    reason: "CRITICAL: Fileless RWX anonymous memory detected (Highly suspicious)".to_string(),
                });
            }
        }
    }
    anomalies
}
