use notify::{Watcher, RecursiveMode, Config, EventKind};
use serde::{Deserialize, Serialize};
use std::path::Path;
use chrono::Utc;
use tokio::sync::mpsc;
use tokio::io::{self, AsyncBufReadExt, BufReader};
use std::sync::Arc;
use parking_lot::Mutex;
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
enum FimCommand {
    WatchPath { id: String, path: String },
    UnwatchPath { id: String, path: String },
    GetStatus { id: String },
}

#[derive(Serialize, Debug)]
#[serde(tag = "type")]
enum SidecarEvent {
    FileAlert { path: String, action: String },
    Status { message: String },
}

fn emit_event(event: SidecarEvent) {
    let resp = SidecarResponse {
        id: None,
        success: true,
        message: None,
        data: Some(serde_json::to_value(event).unwrap()),
        timestamp: Utc::now().to_rfc3339(),
    };
    if let Ok(json) = serde_json::to_string(&resp) {
        let _lock = STDOUT_LOCK.lock();
        println!("{}", json);
    }
}

fn emit_response(id: String, success: bool, message: String) {
    let resp = SidecarResponse {
        id: Some(id),
        success,
        message: Some(message),
        data: None,
        timestamp: Utc::now().to_rfc3339(),
    };
    if let Ok(json) = serde_json::to_string(&resp) {
        let _lock = STDOUT_LOCK.lock();
        println!("{}", json);
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let (tx, mut rx) = mpsc::channel(100);
    
    // Create a watcher that sends events to our tokio channel
    let mut watcher = notify::RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                let _ = tx.blocking_send(event);
            }
        },
        Config::default(),
    )?;

    let files_to_watch = vec!["/etc/shadow", "/etc/passwd", "/etc/ssh/sshd_config"];
    for f in files_to_watch {
        let p = Path::new(f);
        if p.exists() {
            let _ = watcher.watch(p, RecursiveMode::NonRecursive);
        }
    }

    emit_event(SidecarEvent::Status { message: "FIM Sovereign Protocol V4.0 Active (Tokio)".to_string() });

    let (cmd_tx, mut cmd_rx) = mpsc::channel::<FimCommand>(32);
    
    // Spawn a task to handle stdin
    tokio::spawn(async move {
        let stdin = io::stdin();
        let mut reader = BufReader::new(stdin).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            if let Ok(cmd) = serde_json::from_str::<FimCommand>(line.trim()) {
                let _ = cmd_tx.send(cmd).await;
            }
        }
    });

    loop {
        tokio::select! {
            Some(event) = rx.recv() => {
                match event.kind {
                    EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_) => {
                        for path in event.paths {
                            emit_event(SidecarEvent::FileAlert {
                                path: path.to_string_lossy().into_owned(),
                                action: format!("{:?}", event.kind),
                            });
                        }
                    }
                    _ => {}
                }
            }
            Some(cmd) = cmd_rx.recv() => {
                match cmd {
                    FimCommand::WatchPath { id, path } => {
                        let p = Path::new(&path);
                        if p.exists() {
                            match watcher.watch(p, RecursiveMode::NonRecursive) {
                                Ok(_) => emit_response(id, true, format!("Watching {}", path)),
                                Err(e) => emit_response(id, false, format!("Watch failed: {}", e)),
                            }
                        } else {
                            emit_response(id, false, format!("Path not found: {}", path));
                        }
                    },
                    FimCommand::UnwatchPath { id, path } => {
                        let p = Path::new(&path);
                        match watcher.unwatch(p) {
                            Ok(_) => emit_response(id, true, format!("Unwatched {}", path)),
                            Err(e) => emit_response(id, false, format!("Unwatch failed: {}", e)),
                        }
                    },
                    FimCommand::GetStatus { id } => {
                        emit_response(id, true, "Active".to_string());
                    }
                }
            }
        }
    }
}

