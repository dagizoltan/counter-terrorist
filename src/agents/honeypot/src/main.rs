use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use chrono::Utc;
use std::collections::HashMap;
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

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
enum Command {
    UpdateModule { id: String, module: String, oldPort: u16, newPort: u16 },
    ToggleModule { id: String, module: String, active: bool, port: u16 },
    RemoveModule { id: String, port: u16 },
    Sabotage { id: String, source_ip: String, level: String },
    ClearSabotage { id: String, source_ip: String },
    GetStatus { id: String },
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
enum SidecarEvent {
    PortAccess { port: u16, source_ip: String },
    SessionData { port: u16, source_ip: String, data: String },
    Status { message: String },
}

async fn emit_event(event: SidecarEvent) {
    let resp = SidecarResponse {
        id: None,
        success: true,
        message: None,
        data: Some(serde_json::to_value(event).unwrap()),
        timestamp: Utc::now().to_rfc3339(),
    };
    if let Ok(json) = serde_json::to_string(&resp) {
        let _lock = STDOUT_LOCK.lock().await;
        println!("{}", json);
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

struct ListenerState {
    port: u16,
    active: bool,
    sabotage_ips: Vec<String>,
}

async fn start_port_listener(port: u16, state: Arc<Mutex<HashMap<u16, ListenerState>>>) {
    let addr = format!("0.0.0.0:{}", port);
    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            emit_event(SidecarEvent::Status {
                message: format!("Failed to bind to port {}: {}", port, e),
            }).await;
            return;
        }
    };

    loop {
        {
            let s = state.lock().await;
            if let Some(ls) = s.get(&port) {
                if !ls.active { break; }
            } else {
                break;
            }
        }

        match listener.accept().await {
            Ok((mut socket, addr)) => {
                let ip = addr.ip().to_string();
                let state_clone = Arc::clone(&state);
                
                tokio::spawn(async move {
                    emit_event(SidecarEvent::PortAccess {
                        port,
                        source_ip: ip.clone(),
                    }).await;

                    // Check for sabotage
                    {
                        let s = state_clone.lock().await;
                        if let Some(ls) = s.get(&port) {
                            if ls.sabotage_ips.contains(&ip) {
                                tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                            }
                        }
                    }

                    // INTERACTIVE ENGAGEMENT: Present a fake prompt and capture session data
                    let _ = socket.write_all(b"Sovereign Node v1.0 - Authorized Personnel Only\nlogin: ").await;
                    
                    let mut reader = BufReader::new(socket);
                    let mut line = String::new();
                    
                    // Capture up to 5 lines of interaction for forensic modeling
                    for _ in 0..5 {
                        line.clear();
                        if let Ok(n) = reader.read_line(&mut line).await {
                            if n == 0 { break; }
                            emit_event(SidecarEvent::SessionData {
                                port,
                                source_ip: ip.clone(),
                                data: line.trim().to_string(),
                            }).await;
                            // Mimic a "Password:" prompt after login
                            if line.contains("login") || line.len() > 0 {
                                let _ = reader.get_mut().write_all(b"password: ").await;
                            }
                        } else {
                            break;
                        }
                    }
                    
                    let _ = reader.get_mut().write_all(b"\nAccess Denied. Connection logged.\n").await;
                    let _ = reader.get_mut().shutdown().await;
                });
            }
            Err(_) => continue,
        }
    }
}

#[tokio::main]
async fn main() {
    let state: Arc<Mutex<HashMap<u16, ListenerState>>> = Arc::new(Mutex::new(HashMap::new()));
    let mut stdin = BufReader::new(tokio::io::stdin());
    let mut line = String::new();

    emit_event(SidecarEvent::Status {
        message: "Honeypot Sovereign Protocol V3.1 (Interactive) Active".to_string(),
    }).await;

    loop {
        line.clear();
        match stdin.read_line(&mut line).await {
            Ok(0) => break,
            Ok(_) => {
                if let Ok(cmd) = serde_json::from_str::<Command>(line.trim()) {
                    match cmd {
                        Command::UpdateModule { id, oldPort, newPort, .. } => {
                            {
                                let mut s = state.lock().await;
                                if let Some(ls) = s.get_mut(&oldPort) {
                                    ls.active = false;
                                }
                            }
                            let state_clone = Arc::clone(&state);
                            state.lock().await.insert(newPort, ListenerState { port: newPort, active: true, sabotage_ips: vec![] });
                            tokio::spawn(async move {
                                start_port_listener(newPort, state_clone).await;
                            });
                            emit_response(id, true, format!("Morphed port {} to {}", oldPort, newPort)).await;
                        }
                        Command::ToggleModule { id, active, port, .. } => {
                            if active {
                                let state_clone = Arc::clone(&state);
                                state.lock().await.insert(port, ListenerState { port, active: true, sabotage_ips: vec![] });
                                tokio::spawn(async move {
                                    start_port_listener(port, state_clone).await;
                                });
                            } else {
                                let mut s = state.lock().await;
                                if let Some(ls) = s.get_mut(&port) {
                                    ls.active = false;
                                }
                            }
                            emit_response(id, true, "Toggle success".to_string()).await;
                        }
                        Command::Sabotage { id, source_ip, .. } => {
                            let mut s = state.lock().await;
                            for ls in s.values_mut() {
                                if !ls.sabotage_ips.contains(&source_ip) {
                                    ls.sabotage_ips.push(source_ip.clone());
                                }
                            }
                            emit_response(id, true, "Sabotage engaged".to_string()).await;
                        }
                        Command::ClearSabotage { id, source_ip } => {
                            let mut s = state.lock().await;
                            for ls in s.values_mut() {
                                ls.sabotage_ips.retain(|x| x != &source_ip);
                            }
                            emit_response(id, true, "Sabotage cleared".to_string()).await;
                        }
                        Command::RemoveModule { id, port } => {
                            let mut s = state.lock().await;
                            if let Some(mut ls) = s.remove(&port) {
                                ls.active = false;
                                emit_response(id, true, format!("Module on port {} purged", port)).await;
                            } else {
                                emit_response(id, false, "Module not found".to_string()).await;
                            }
                        }
                        Command::GetStatus { id } => {
                            emit_response(id, true, "Active".to_string()).await;
                        }
                    }
                }
            }
            Err(_) => break,
        }
    }
}
