use notify::{Watcher, RecursiveMode, Config, EventKind};
use serde::{Deserialize, Serialize};
use std::path::{Path};
use chrono::Utc;
use std::sync::mpsc::channel;
use std::io::{self, BufRead};

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
        println!("{}", json);
    }
}

fn main() -> anyhow::Result<()> {
    let (tx, rx) = channel();
    let mut watcher = notify::RecommendedWatcher::new(tx, Config::default())?;

    let files_to_watch = vec!["/etc/shadow", "/etc/passwd", "/etc/ssh/sshd_config"];
    for f in files_to_watch {
        let p = Path::new(f);
        if p.exists() {
            let _ = watcher.watch(p, RecursiveMode::NonRecursive);
        }
    }

    emit_event(SidecarEvent::Status { message: "FIM Sovereign Protocol V3.1 Active".to_string() });

    let (cmd_tx, cmd_rx) = channel();
    std::thread::spawn(move || {
        let stdin = io::stdin();
        for line in stdin.lock().lines() {
            if let Ok(line) = line {
                if let Ok(cmd) = serde_json::from_str::<FimCommand>(line.trim()) {
                    let _ = cmd_tx.send(cmd);
                }
            }
        }
    });

    loop {
        if let Ok(res) = rx.try_recv() {
            if let Ok(event) = res {
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
        }

        if let Ok(cmd) = cmd_rx.try_recv() {
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

        std::thread::sleep(std::time::Duration::from_millis(100));
    }
}
