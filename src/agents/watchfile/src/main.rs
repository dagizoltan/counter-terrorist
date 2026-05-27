use serde::{Deserialize, Serialize};
use chrono::Utc;
use tokio::io::{self, AsyncReadExt};
use std::sync::Arc;
use parking_lot::Mutex;
use once_cell::sync::Lazy;
use bytes::{BytesMut, Buf};
use std::os::unix::io::RawFd;
use libc::{fanotify_init, fanotify_mark, fanotify_response, read};
use std::fs;

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

#[derive(Serialize, Debug)]
#[serde(tag = "type")]
enum SidecarEvent {
    FileAlert { path: String, action: String, pid: i32, comm: String },
    Status { message: String },
}

#[derive(Debug, Serialize)]
struct ForensicLog {
    timestamp: String,
    log_type: String,
    severity: String,
    caller: String,
    message: String,
}

static IPC: Lazy<cts_ipc::IpcManager> = Lazy::new(|| cts_ipc::IpcManager::new("watchfile", 1024 * 1024));

async fn log_forensic(severity: &str, message: &str) {
    IPC.log::<()>(severity, message);
}

fn emit_event(event: SidecarEvent) {
    let resp = SidecarResponse {
        id: None,
        success: true,
        message: None,
        data: Some(serde_json::to_value(event).unwrap()),
        timestamp: Utc::now().to_rfc3339(),
    };
    IPC.emit_event(&resp);
}

fn get_comm(pid: i32) -> String {
    fs::read_to_string(format!("/proc/{}/comm", pid))
        .unwrap_or_else(|_| "unknown".to_string())
        .trim()
        .to_string()
}

// BUG-16: More robust verification than comm name
fn verify_actor_hash(pid: i32) -> bool {
    let exe_path = format!("/proc/{}/exe", pid);
    let target = fs::read_link(exe_path).ok();

    if let Some(path) = target {
        let path_str = path.to_string_lossy();
        // Allow systemd and known orchestrator locations
        // BUG-4.4 FIX: Use starts_with to prevent path spoofing via /home/user/var/lib/cts/bin/...
        return path_str == "/lib/systemd/systemd" ||
               path_str == "/usr/bin/deno" ||
               path_str.starts_with("/var/lib/cts/bin/");
    }
    false
}

fn get_path(fd: RawFd) -> String {
    let path = format!("/proc/self/fd/{}", fd);
    fs::read_link(path)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "unknown".to_string())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    log_forensic("info", "Sovereign FIM Active Guard (Fanotify) starting...").await;

    // Initialize fanotify: FAN_CLASS_CONTENT allows for permission events
    let fd = unsafe {
        fanotify_init(libc::FAN_CLASS_CONTENT | libc::FAN_CLOEXEC, libc::O_RDONLY as u32)
    };

    if fd < 0 {
        log_forensic("error", &format!("Failed to initialize fanotify (fd: {}). Ensure CAP_SYS_ADMIN is set.", fd)).await;
        return Ok(());
    }

    // Mark critical paths for MONITORING and PERMISSION
    // We watch /etc, /bin, /usr/bin for modifications
    let paths = ["/etc", "/bin", "/usr/bin"];
    for path in paths {
        let res = unsafe {
            fanotify_mark(
                fd,
                libc::FAN_MARK_ADD | libc::FAN_MARK_MOUNT,
                libc::FAN_OPEN_PERM | libc::FAN_MODIFY | libc::FAN_CLOSE_WRITE | libc::FAN_EVENT_ON_CHILD,
                libc::AT_FDCWD,
                path.as_ptr() as *const libc::c_char,
            )
        };
        if res < 0 {
            log_forensic("warning", &format!("Failed to mark path {}: {}", path, res)).await;
        }
    }

    log_forensic("info", "Fanotify Active Guard engaged on system binaries.").await;

    // Run the event loop in a blocking thread (since fanotify read is blocking)
    tokio::task::spawn_blocking(move || {
        let mut buffer = [0u8; 4096];
        loop {
            let n = unsafe { read(fd, buffer.as_mut_ptr() as *mut libc::c_void, buffer.len()) };
            if n <= 0 { break; }

            let mut offset = 0;
            while offset + std::mem::size_of::<libc::fanotify_event_metadata>() <= n as usize {
                let metadata = unsafe {
                    &*(buffer.as_ptr().add(offset) as *const libc::fanotify_event_metadata)
                };

                if metadata.vers != libc::FANOTIFY_METADATA_VERSION as u8 { break; }

                let pid = metadata.pid;
                let comm = get_comm(pid);
                let path = get_path(metadata.fd);

                // LOGIC: Is this an authorized action?
                let mut action = "ALLOWED";
                let mut response = libc::FAN_ALLOW;

                // CRITICAL PROTECTION: Deny any modification to /etc/shadow or /bin from unauthorized processes
                if (path.contains("/etc/shadow") || path.contains("/bin/")) && metadata.mask & libc::FAN_OPEN_PERM != 0 {
                    // BUG-16: Use binary path verification instead of fragile comm names
                    if !verify_actor_hash(pid) {
                        action = "DENIED";
                        response = libc::FAN_DENY;
                    }
                }

                if metadata.mask & libc::FAN_OPEN_PERM != 0 {
                    let resp = fanotify_response {
                        fd: metadata.fd,
                        response: response as u32,
                    };
                    unsafe {
                        libc::write(fd, &resp as *const _ as *const libc::c_void, std::mem::size_of::<fanotify_response>());
                    }
                }

                if action == "DENIED" || metadata.mask & libc::FAN_MODIFY != 0 {
                    emit_event(SidecarEvent::FileAlert {
                        path: path.clone(),
                        action: format!("{} ({:x})", action, metadata.mask),
                        pid,
                        comm: comm.clone(),
                    });
                }

                // Close the fd provided by fanotify
                unsafe { libc::close(metadata.fd); }
                offset += metadata.event_len as usize;
            }
        }
    });

    // SOV-P5: Mandated Dynamic Landlock gating
    let _ = cts_ipc::apply_landlock("/etc");
    let _ = cts_ipc::apply_landlock("/bin");
    let _ = cts_ipc::apply_landlock("/usr/bin");
    let _ = cts_ipc::apply_landlock("/proc");

    // Keep the main loop alive for stdin (even if we don't use it yet)
    let mut stdin = io::stdin();
    let mut buffer = BytesMut::with_capacity(4096);

    loop {
        let mut byte_buf = [0u8; 1024];
        let n = match stdin.read(&mut byte_buf).await {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };
        buffer.extend_from_slice(&byte_buf[..n]);

        while !buffer.is_empty() {
            if let Ok(_cmd) = rmp_serde::from_slice::<serde_json::Value>(&buffer) {
                buffer.clear();
                break;
            }

            if let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
                buffer.advance(pos + 1);
            } else {
                break;
            }
        }
    }

    Ok(())
}
