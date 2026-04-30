use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;
use tokio::io::AsyncWriteExt;
use chrono::Utc;

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
enum HoneypotEvent {
    PortAccess { port: u16, source_ip: String },
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

#[tokio::main]
async fn main() {
    // Honey ports to listen on
    let ports = vec![2222, 23, 445, 3389];

    // Launch port listeners
    for port in ports {
        tokio::spawn(async move {
            start_port_listener(port).await;
        });
    }

    emit_event(HoneypotEvent::Status {
        message: "Micro-Honeypot Sidecar Started".to_string(),
    });

    // Keep the main thread alive
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await;
    }
}
