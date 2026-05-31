use serde::{Deserialize, Serialize};
use rand::Rng;
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
    UpdateModule { id: String, module: String, old_port: u16, new_port: u16 },
    ToggleModule { id: String, module: String, active: bool, port: u16 },
    RemoveModule { id: String, port: u16 },
    Sabotage {
        id: String,
        source_ip: String,
        level: String,
        #[serde(default)]
        mode: String, // "JITTER", "ERRORS", "DROP", "DYNAMIC"
        #[serde(default)]
        latency_ms: u64
    },
    ClearSabotage { id: String, source_ip: String },
    GetStatus { id: String },
    EnforceLandlock { id: String, rules: Vec<cts_ipc::LandlockPathRule> },
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

#[derive(Clone)]
struct SabotageConfig {
    level: String,
    mode: String,
    latency_ms: u64,
}

struct ListenerState {
    #[allow(dead_code)]
    port: u16,
    active: bool,
    sabotage_ips: HashMap<String, SabotageConfig>,
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

    // BUG-7.2 FIX: Implement global connection limit for this port
    let active_connections = Arc::new(Mutex::new(0usize));
    const MAX_CONNECTIONS_PER_PORT: usize = 50;

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
                let conn_count = Arc::clone(&active_connections);

                {
                    let mut count = conn_count.lock().await;
                    if *count >= MAX_CONNECTIONS_PER_PORT {
                        // Silently drop if at limit to avoid resource exhaustion
                        continue;
                    }
                    *count += 1;
                }
                
                tokio::spawn(async move {
                    emit_event(SidecarEvent::PortAccess {
                        port,
                        source_ip: ip.clone(),
                    }).await;

                    // Randomized Latency (frustrate scanners)
                    let base_latency = {
                        use rand::Rng;
                        let mut rng = rand::thread_rng();
                        rng.gen_range(50..500)
                    };
                    tokio::time::sleep(tokio::time::Duration::from_millis(base_latency)).await;

                    // Tarpitting Check
                    let sabotage_cfg = {
                        let s = state_clone.lock().await;
                        s.get(&port).and_then(|ls| ls.sabotage_ips.get(&ip).cloned())
                    };

                    if let Some(cfg) = &sabotage_cfg {
                        // SOV-P2: Dynamic Sabotage - Timing Jitter
                        let delay = if cfg.mode == "JITTER" || cfg.mode == "DYNAMIC" {
                            let jitter = rand::thread_rng().gen_range(500..3000);
                            cfg.latency_ms + jitter
                        } else {
                            cfg.latency_ms.max(2000)
                        };
                        tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
                    } else {
                        // Keep things from being unused if not in sabotage
                    }

                    // INTERACTIVE ENGAGEMENT: Present a fake prompt and capture session data
                    let mut is_vault = false;
                    if port == 8200 {
                        is_vault = true;
                        let _ = socket.write_all(b"{\"initialized\":true,\"sealed\":false,\"version\":\"1.12.0\"}\n").await;
                    } else {
                        // DECEPTION: Port-Aware Multi-OS Banners (H-09)
                        let banners = match port {
                            22 => vec![
                                "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.10\n",
                                "SSH-2.0-OpenSSH_9.1\n",
                                "SSH-2.0-OpenSSH_7.6p1 Ubuntu-4ubuntu0.3\n",
                                "SSH-2.0-dropbear_2020.81\n"
                            ],
                            3389 => vec![
                                "Windows Terminal Server\nlogin: ",
                                "Microsoft Remote Desktop Protocol\nUser: ",
                                "Remote Desktop Service (v10.0.19041)\n"
                            ],
                            80 | 8080 => vec![
                                "HTTP/1.1 200 OK\r\nServer: nginx/1.18.0 (Ubuntu)\r\nContent-Type: text/html\r\n\r\n",
                                "HTTP/1.1 401 Unauthorized\r\nServer: Apache/2.4.41 (Unix)\r\nWWW-Authenticate: Basic realm=\"Restricted\"\r\n\r\n"
                            ],
                            6379 => vec![
                                "+OK\r\n",
                                "-NOAUTH Authentication required.\r\n"
                            ],
                            _ => vec![
                                "Sovereign Node v1.0 - Authorized Personnel Only\nlogin: ",
                                "Unauthorized access is a federal crime.\nUser: ",
                                "Internal Mesh Relay [ID: 0x442A]\nCredentials: ",
                                "Access Restricted to Sovereign Control Plane Agents\nID: "
                            ]
                        };
                        let banner = banners[rand::thread_rng().gen_range(0..banners.len())];
                        let _ = socket.write_all(banner.as_bytes()).await;
                    }
                    
                    let mut reader = BufReader::new(socket);
                    let mut line = String::new();
                    
                    // Capture up to 5 lines of interaction for forensic modeling
                    for i in 0..5 {
                        line.clear();
                        if let Ok(n) = reader.read_line(&mut line).await {
                            if n == 0 { break; }
                            
                            if let Some(cfg) = &sabotage_cfg {
                                // Tarpit: Progressively slow down responses
                                let mut delay = (i + 1) * 2000;
                                if cfg.mode == "DYNAMIC" {
                                    delay += rand::thread_rng().gen_range(0..2000);
                                }
                                tokio::time::sleep(tokio::time::Duration::from_millis(delay as u64)).await;
                            } else {
                                // Randomized Latency for responses
                                let response_latency = {
                                    use rand::Rng;
                                    let mut rng = rand::thread_rng();
                                    rng.gen_range(100..1000)
                                };
                                tokio::time::sleep(tokio::time::Duration::from_millis(response_latency)).await;
                            }

                            emit_event(SidecarEvent::SessionData {
                                port,
                                source_ip: ip.clone(),
                                data: line.trim().to_string(),
                            }).await;
                            
                            if is_vault {
                                // SOV-P2: Dynamic Sabotage - Error Variety
                                let mut errors = vec![
                                    "{\"errors\":[\"permission denied\"]}\n",
                                    "{\"errors\":[\"core: sealed\"]}\n",
                                    "{\"errors\":[\"invalid token\"]}\n"
                                ];
                                if let Some(cfg) = &sabotage_cfg {
                                    if cfg.mode == "ERRORS" || cfg.mode == "DYNAMIC" {
                                        errors.push("{\"errors\":[\"upstream maintenance mode\"]}\n");
                                        errors.push("{\"errors\":[\"identity verification required (TPM-MFA)\"]}\n");
                                        errors.push("{\"errors\":[\"rate limit exceeded: backoff for 300s\"]}\n");
                                    }
                                    let _ = cfg.level; // Mark used
                                }
                                let err = errors[rand::thread_rng().gen_range(0..errors.len())];
                                let _ = reader.get_mut().write_all(err.as_bytes()).await;
                            } else {
                                // Mimic a "Password:" prompt after login
                                if line.contains("login") || !line.is_empty() {
                                    let _ = reader.get_mut().write_all(b"password: ").await;
                                }
                            }
                        } else {
                            break;
                        }
                    }
                    
                    if sabotage_cfg.is_some() {
                        tokio::time::sleep(tokio::time::Duration::from_millis(5000)).await;
                    }

                    let _ = reader.get_mut().write_all(b"\nAccess Denied. Connection logged.\n").await;
                    let _ = reader.get_mut().shutdown().await;

                    // Release connection slot
                    let mut count = conn_count.lock().await;
                    if *count > 0 { *count -= 1; }
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
                        Command::UpdateModule { id, old_port, new_port, .. } => {
                            {
                                let mut s = state.lock().await;
                                if let Some(ls) = s.get_mut(&old_port) {
                                    ls.active = false;
                                }
                            }
                            let state_clone = Arc::clone(&state);
                            state.lock().await.insert(new_port, ListenerState { port: new_port, active: true, sabotage_ips: HashMap::new() });
                            tokio::spawn(async move {
                                start_port_listener(new_port, state_clone).await;
                            });
                            emit_response(id, true, format!("Morphed port {} to {}", old_port, new_port)).await;
                        }
                        Command::ToggleModule { id, active, port, .. } => {
                            if active {
                                let state_clone = Arc::clone(&state);
                                state.lock().await.insert(port, ListenerState { port, active: true, sabotage_ips: HashMap::new() });
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
                        Command::Sabotage { id, source_ip, level, mode, latency_ms } => {
                            const MAX_SABOTAGE_IPS: usize = 1000;
                            let mut s = state.lock().await;
                            for ls in s.values_mut() {
                                if ls.sabotage_ips.len() >= MAX_SABOTAGE_IPS && !ls.sabotage_ips.contains_key(&source_ip) {
                                    // FIFO eviction (approximate)
                                    if let Some(first_key) = ls.sabotage_ips.keys().next().cloned() {
                                        ls.sabotage_ips.remove(&first_key);
                                    }
                                }
                                ls.sabotage_ips.insert(source_ip.clone(), SabotageConfig {
                                    level: level.clone(),
                                    mode: mode.clone(),
                                    latency_ms,
                                });
                            }
                            emit_response(id, true, format!("Dynamic Sabotage ({}) engaged for {}", mode, source_ip)).await;
                        }
                        Command::ClearSabotage { id, source_ip } => {
                            let mut s = state.lock().await;
                            for ls in s.values_mut() {
                                ls.sabotage_ips.remove(&source_ip);
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
                        Command::EnforceLandlock { id, rules } => {
                            match cts_ipc::apply_granular_landlock(&rules) {
                                Ok(_) => emit_response(id, true, "Granular Landlock policies applied".to_string()).await,
                                Err(e) => emit_response(id, false, format!("Landlock failed: {}", e)).await,
                            }
                        }
                    }
                }
            }
            Err(_) => break,
        }
    }
}
