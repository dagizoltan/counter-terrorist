use notify::{Watcher, RecursiveMode, Config, EventKind};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use chrono::Utc;
use std::sync::mpsc::channel;

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
enum FimEvent {
    FileAlert { path: String, action: String },
    Status { message: String },
}

#[derive(Serialize, Deserialize, Debug)]
struct Message {
    timestamp: String,
    event: FimEvent,
}

fn emit_event(event: FimEvent) {
    let msg = Message {
        timestamp: Utc::now().to_rfc3339(),
        event,
    };
    if let Ok(json) = serde_json::to_string(&msg) {
        println!("{}", json);
    }
}

fn main() -> anyhow::Result<()> {
    let (tx, rx) = channel();

    // Automatically select the best implementation for the current platform
    let mut watcher = notify::RecommendedWatcher::new(tx, Config::default())?;

    let files_to_watch = vec![
        "/etc/shadow",
        "/etc/passwd",
        "/etc/ssh/sshd_config",
        "/etc/nginx/nginx.conf",
    ];

    for file_path in files_to_watch {
        let path = Path::new(file_path);
        if path.exists() {
            if let Err(e) = watcher.watch(path, RecursiveMode::NonRecursive) {
                eprintln!("Failed to watch {}: {}", file_path, e);
            } else {
                emit_event(FimEvent::Status {
                    message: format!("Watching {}", file_path),
                });
            }
        } else {
            eprintln!("File not found, skipping: {}", file_path);
        }
    }

    emit_event(FimEvent::Status {
        message: "FIM Sidecar Started".to_string(),
    });

    for res in rx {
        match res {
            Ok(event) => {
                match event.kind {
                    EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_) => {
                        for path in event.paths {
                            emit_event(FimEvent::FileAlert {
                                path: path.to_string_lossy().into_owned(),
                                action: format!("{:?}", event.kind),
                            });
                        }
                    }
                    _ => {}
                }
            }
            Err(e) => eprintln!("watch error: {:?}", e),
        }
    }

    Ok(())
}
