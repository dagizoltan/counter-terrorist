use shared_memory::*;
use landlock::*;
use serde::{Serialize, de::DeserializeOwned};
use std::fs::File;
use std::sync::Arc;
use parking_lot::Mutex;
use std::path::Path;
use tokio::io::AsyncReadExt;

pub struct ShmemWrapper(pub Shmem);
unsafe impl Send for ShmemWrapper {}
unsafe impl Sync for ShmemWrapper {}

#[repr(C)]
struct RingBufferHeader {
    len: u32,
    dirty: u32, // Used for threshold-based signaling
}

pub enum AgentCommand {
    Shutdown,
    GetStatus,
    Custom(Vec<u8>),
}

pub struct IpcManager {
    shmem: Option<Arc<Mutex<ShmemWrapper>>>,
    name: String,
    heartbeat_task: Option<tokio::task::JoinHandle<()>>,
}

impl IpcManager {
    pub fn new(sidecar_name: &str, size: usize) -> Self {
        let path = format!("/dev/shm/cts_{}_{}", sidecar_name, std::process::id());
        let shmem = ShmemConf::new()
            .size(size)
            .flink(&path)
            .create()
            .ok()
            .map(|s| Arc::new(Mutex::new(ShmemWrapper(s))));

        let h_task = tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                use std::io::Write;
                let mut stdout = std::io::stdout();
                let _ = stdout.write_all(&[0x04]);
                let _ = stdout.flush();
            }
        });

        Self { shmem, name: sidecar_name.to_string(), heartbeat_task: Some(h_task) }
    }

    pub fn log<T: Serialize>(&self, severity: &str, message: &str) {
        #[derive(Serialize)]
        struct LogPayload<'a> {
            timestamp: String,
            log_type: &'a str,
            severity: &'a str,
            caller: String,
            message: &'a str,
        }

        let payload = LogPayload {
            timestamp: chrono::Utc::now().to_rfc3339(),
            log_type: "activity",
            severity,
            caller: format!("{}:main", self.name),
            message,
        };

        let mut buf = Vec::new();
        if payload.serialize(&mut rmp_serde::Serializer::new(&mut buf)).is_ok() {
            use std::io::Write;
            let mut stdout = std::io::stdout();
            let _ = stdout.write_all(&[0x03]);
            let _ = stdout.write_all(&(buf.len() as u32).to_le_bytes());
            let _ = stdout.write_all(&buf);
            let _ = stdout.flush();
        }
    }

    pub fn emit_event<T: Serialize>(&self, event: &T) -> bool {
        if let Some(shmem_arc) = &self.shmem {
            let mut buf = Vec::with_capacity(8192);
            if event.serialize(&mut rmp_serde::Serializer::new(&mut buf)).is_ok() {
                let mut shmem_wrapper = shmem_arc.lock();
                let slice = unsafe { shmem_wrapper.0.as_slice_mut() };

                let mut len_bytes = [0u8; 4];
                len_bytes.copy_from_slice(&slice[0..4]);
                let current_len = u32::from_le_bytes(len_bytes);

                if current_len == 0 && buf.len() + 8 <= slice.len() {
                    let len = (buf.len() as u32).to_le_bytes();
                    slice[8..8+buf.len()].copy_from_slice(&buf);

                    // Write length last (commit)
                    slice[0..4].copy_from_slice(&len);

                    // SOV-P5: Strict Binary Signaling (0x02 magic for shmem)
                    use std::io::Write;
                    let mut stdout = std::io::stdout();
                    let _ = stdout.write_all(&[0x02, 0, 0, 0, 0]); // Protocol: [0x02][len: u32] (len unused for shmem trigger)
                    let _ = stdout.flush();
                    return true;
                }
            }
        }

        // Fallback to pipe-based binary protocol if shmem is full or unavailable
        let mut buf = Vec::new();
        if event.serialize(&mut rmp_serde::Serializer::new(&mut buf)).is_ok() {
            use std::io::Write;
            let mut stdout = std::io::stdout();
            let _ = stdout.write_all(&[0x01]);
            let _ = stdout.write_all(&(buf.len() as u32).to_le_bytes());
            let _ = stdout.write_all(&buf);
            let _ = stdout.flush();
            return true;
        }
        false
    }

    pub async fn next_command(&mut self) -> Option<AgentCommand> {
        let mut stdin = tokio::io::stdin();
        let mut len_buf = [0u8; 4];

        if stdin.read_exact(&mut len_buf).await.is_err() {
            return None;
        }

        let len = u32::from_le_bytes(len_buf) as usize;
        let mut payload = vec![0u8; len];
        if stdin.read_exact(&mut payload).await.is_err() {
            return None;
        }

        // Generic probe for common commands
        #[derive(serde::Deserialize)]
        struct GenericCmd { r#type: String }
        if let Ok(cmd) = rmp_serde::from_slice::<GenericCmd>(&payload) {
            match cmd.r#type.as_str() {
                "SHUTDOWN" => return Some(AgentCommand::Shutdown),
                "GET_STATUS" => return Some(AgentCommand::GetStatus),
                _ => {}
            }
        }

        Some(AgentCommand::Custom(payload))
    }
}

pub fn apply_landlock<P: AsRef<Path>>(path: P) -> anyhow::Result<()> {
    let abi = ABI::V1;
    let ruleset = Ruleset::default()
        .handle_access(AccessFs::from_all(abi))?
        .create()?;

    let path_handle = File::open(path)?;
    let ruleset = ruleset.add_rule(PathBeneath::new(path_handle, AccessFs::from_all(abi)))?;
    ruleset.restrict_self()?;
    Ok(())
}

pub fn apply_landlock_multi<P: AsRef<Path>>(paths: &[P]) -> anyhow::Result<()> {
    let abi = ABI::V1;
    let mut ruleset = Ruleset::default()
        .handle_access(AccessFs::from_all(abi))?
        .create()?;

    for path in paths {
        let path_handle = File::open(path)?;
        ruleset = ruleset.add_rule(PathBeneath::new(path_handle, AccessFs::from_all(abi)))?;
    }
    ruleset.restrict_self()?;
    Ok(())
}
