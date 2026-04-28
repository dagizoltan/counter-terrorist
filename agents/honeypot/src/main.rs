use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;
use tokio::io::AsyncWriteExt;
use inotify::{Inotify, WatchMask};
use std::path::PathBuf;
use chrono::Utc;

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
enum HoneypotEvent {
    PortAccess { port: u16, source_ip: String },
    FileAccess { path: String, event_type: String },
    Status { message: String },
}

#[derive(Serialize, Deserialize, Debug)]
struct Message {
    timestamp: String,
    event: HoneypotEvent,
}

fn emit_event(event: HoneypotEvent) {
    let msg = Message {
        timestamp: Utc::now().to_rfc3339(),
        event,
    };
    if let Ok(json) = serde_json::to_string(&msg) {
        println!("{}", json);
    }
}

async fn start_port_listener(port: u16) {
    let addr = format!("0.0.0.0:{}", port);
    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            emit_event(HoneypotEvent::Status {
                message: format!("Failed to bind to port {}: {}", port, e),
            });
            return;
        }
    };

    loop {
        match listener.accept().await {
            Ok((mut socket, addr)) => {
                emit_event(HoneypotEvent::PortAccess {
                    port,
                    source_ip: addr.ip().to_string(),
                });
                // Immediate close to avoid providing any real interaction
                let _ = socket.shutdown().await;
            }
            Err(_) => continue,
        }
    }
}

async fn start_file_monitor(paths: Vec<PathBuf>) {
    let mut inotify = match Inotify::init() {
        Ok(i) => i,
        Err(e) => {
            emit_event(HoneypotEvent::Status {
                message: format!("Failed to initialize inotify: {}", e),
            });
            return;
        }
    };

    for path in paths {
        if path.exists() {
            let mask = WatchMask::ACCESS | WatchMask::MODIFY | WatchMask::OPEN;
            if let Err(e) = inotify.watches().add(&path, mask) {
                emit_event(HoneypotEvent::Status {
                    message: format!("Failed to watch {:?}: {}", path, e),
                });
            }
        }
    }

    let mut buffer = [0; 1024];
    loop {
        let events = match inotify.read_events_blocking(&mut buffer) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for event in events {
            let event_type = format!("{:?}", event.mask);
            let path = event.name.map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "unknown".to_string());
            emit_event(HoneypotEvent::FileAccess {
                path,
                event_type,
            });
        }
    }
}

#[tokio::main]
async fn main() {
    // Honey ports to listen on
    let ports = vec![22, 23, 445, 3389];

    // Launch port listeners
    for port in ports {
        tokio::spawn(async move {
            start_port_listener(port).await;
        });
    }

    // Launch file monitor
    let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
    let monitor_paths = vec![
        PathBuf::from(format!("{}/Documents", home)),
        PathBuf::from(format!("{}/Desktop", home)),
    ];

    tokio::spawn(async move {
        start_file_monitor(monitor_paths).await;
    });

    emit_event(HoneypotEvent::Status {
        message: "Honeypot Sidecar Started".to_string(),
    });

    // Keep the main thread alive
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await;
    }
}
