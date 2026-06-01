use shared_memory::*;
use landlock::*;
use serde::{Serialize, Deserialize};
use std::fs::File;
use std::sync::Arc;
use parking_lot::Mutex;
use std::path::Path;
use log::{info, error, debug, warn};

pub struct ShmemWrapper(pub Shmem);
unsafe impl Send for ShmemWrapper {}
unsafe impl Sync for ShmemWrapper {}

impl Drop for ShmemWrapper {
    fn drop(&mut self) {
        info!("Dropping shared memory segment at {:?}", self.0.get_flink_path());
    }
}

#[repr(C)]
#[allow(dead_code)]
struct RingBufferHeader {
    len: u32,
    dirty: u32, // Used for threshold-based signaling
}

/// IpcManager handles shared memory communication between the orchestrator and sidecars.
/// It provides high-performance binary telemetry and command polling.
pub struct IpcManager {
    shmem: Option<Arc<Mutex<ShmemWrapper>>>,
    cmd_shmem: Option<Arc<Mutex<ShmemWrapper>>>,
}

impl IpcManager {
    /// Creates a new IpcManager with the given sidecar name and buffer size.
    /// It initializes both telemetry and command shared memory segments.
    pub fn new(sidecar_name: &str, size: usize) -> Self {
        let pid = std::process::id();
        let event_path = format!("/dev/shm/cts_{}_{}", sidecar_name, pid);
        let shmem = ShmemConf::new()
            .size(size)
            .flink(&event_path)
            .create();

        let shmem = match shmem {
            Ok(s) => {
                info!("Created telemetry shared memory at {} (size: {})", event_path, size);
                Some(Arc::new(Mutex::new(ShmemWrapper(s))))
            }
            Err(e) => {
                error!("Failed to create telemetry shared memory at {}: {:?}", event_path, e);
                None
            }
        };

        if shmem.is_none() {
            return Self { shmem: None, cmd_shmem: None };
        }

        let cmd_path = format!("/dev/shm/cts_cmd_{}_{}", sidecar_name, pid);
        let cmd_shmem = ShmemConf::new()
            .size(64 * 1024) // 64KB for commands
            .flink(&cmd_path)
            .create();

        let cmd_shmem = match cmd_shmem {
            Ok(s) => {
                info!("Created command shared memory at {}", cmd_path);
                Some(Arc::new(Mutex::new(ShmemWrapper(s))))
            }
            Err(e) => {
                error!("Failed to create command shared memory at {}: {:?}", cmd_path, e);
                None
            }
        };

        if cmd_shmem.is_none() {
            return Self { shmem: None, cmd_shmem: None };
        }

        Self { shmem, cmd_shmem }
    }

    /// Emits a serialized event into the shared memory buffer.
    /// Uses MessagePack for efficient binary serialization.
    pub fn emit_event<T: Serialize>(&self, event: &T) -> bool {
        let shmem_arc = match &self.shmem {
            Some(s) => s,
            None => return false,
        };

        let mut buf = Vec::with_capacity(8192);
        if let Err(e) = event.serialize(&mut rmp_serde::Serializer::new(&mut buf)) {
            error!("Failed to serialize event: {:?}", e);
            return false;
        }

        let mut shmem_wrapper = shmem_arc.lock();
        let slice = unsafe { shmem_wrapper.0.as_slice_mut() };

        if slice.len() < 8 {
            error!("Shared memory buffer too small");
            return false;
        }

        let mut len_bytes = [0u8; 4];
        len_bytes.copy_from_slice(&slice[0..4]);
        let current_len = u32::from_le_bytes(len_bytes);

        // Atomic-like commit: only write if current_len is 0 (buffer consumed)
        if current_len == 0 {
            if buf.len() + 8 <= slice.len() {
                let len = (buf.len() as u32).to_le_bytes();
                slice[8..8+buf.len()].copy_from_slice(&buf);

                // Write length last to commit the record
                slice[0..4].copy_from_slice(&len);

                // SOV-P5: Threshold-based signaling optimization
                // We signal via stdout to wake up the orchestrator's event loop
                println!("SHMEM_UPDATE:{}", buf.len());
                debug!("Emitted event of size {}", buf.len());
                return true;
            } else {
                warn!("Event too large for shared memory buffer ({} > {})", buf.len(), slice.len() - 8);
            }
        } else {
            // Buffer saturation - orchestrator is not keeping up
            debug!("Shared memory buffer saturated, dropping event");
        }
        false
    }

    /// Polls for a command from the orchestrator.
    /// Returns the deserialized command if available.
    pub fn poll_command<T: serde::de::DeserializeOwned>(&self) -> Option<T> {
        let shmem_arc = match &self.cmd_shmem {
            Some(s) => s,
            None => return None,
        };

        let mut shmem_wrapper = shmem_arc.lock();
        let slice = unsafe { shmem_wrapper.0.as_slice_mut() };

        if slice.len() < 8 {
            return None;
        }

        let mut len_bytes = [0u8; 4];
        len_bytes.copy_from_slice(&slice[0..4]);
        let current_len = u32::from_le_bytes(len_bytes) as usize;

        if current_len > 0 {
            if current_len + 8 <= slice.len() {
                let data = &slice[8..8+current_len];
                let cmd = match rmp_serde::from_slice::<T>(data) {
                    Ok(c) => {
                        debug!("Received command of size {}", current_len);
                        Some(c)
                    }
                    Err(e) => {
                        error!("Failed to deserialize command: {:?}", e);
                        None
                    }
                };

                // Clear length to signal completion to orchestrator
                let zero_len = [0u8; 4];
                slice[0..4].copy_from_slice(&zero_len);

                return cmd;
            } else {
                error!("Invalid command length {} in shared memory", current_len);
                // Clear corrupted length
                let zero_len = [0u8; 4];
                slice[0..4].copy_from_slice(&zero_len);
            }
        }
        None
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LandlockPathRule {
    pub path: String,
    pub syscalls: Vec<String>,
}

/// Applies a simple Landlock restriction to the current process.
pub fn apply_landlock<P: AsRef<Path>>(path: P) -> anyhow::Result<()> {
    let abi = ABI::V1;
    let ruleset = Ruleset::default()
        .handle_access(AccessFs::from_all(abi))?
        .create()?;

    let path_handle = File::open(path)?;
    let ruleset = ruleset.add_rule(PathBeneath::new(path_handle, AccessFs::from_all(abi)))?;
    ruleset.restrict_self()?;
    info!("Applied Landlock restriction");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_landlock_rule_serialization() {
        let rule = LandlockPathRule {
            path: "/etc".to_string(),
            syscalls: vec!["read".to_string(), "open".to_string()],
        };
        let json = serde_json::to_string(&rule).unwrap();
        assert!(json.contains("/etc"));
    }
}

/// Applies granular Landlock filesystem restrictions based on the provided rules.
pub fn apply_granular_landlock(rules: &[LandlockPathRule]) -> anyhow::Result<()> {
    let abi = ABI::V1;
    let mut ruleset = Ruleset::default()
        .handle_access(AccessFs::from_all(abi))?
        .create()?;

    for rule in rules {
        let mut access = BitFlags::from_flag(AccessFs::ReadFile);
        for sc in &rule.syscalls {
            match sc.as_str() {
                "read" | "open" | "openat" | "stat" | "access" => {
                    access |= AccessFs::ReadFile | AccessFs::ReadDir;
                }
                "write" | "truncate" | "chmod" | "chown" => {
                    access |= AccessFs::WriteFile;
                }
                "execute" | "execve" => {
                    access |= AccessFs::Execute;
                }
                "mkdir" | "mkdirat" => {
                    access |= AccessFs::MakeDir;
                }
                "unlink" | "unlinkat" | "rmdir" => {
                    access |= AccessFs::RemoveFile | AccessFs::RemoveDir;
                }
                "mknod" | "mknodat" => {
                    access |= AccessFs::MakeChar | AccessFs::MakeBlock | AccessFs::MakeFifo | AccessFs::MakeSock;
                }
                "symlink" | "symlinkat" => {
                    access |= AccessFs::MakeSym;
                }
                _ => {
                    access |= AccessFs::ReadFile;
                }
            }
        }

        if access.is_empty() {
            access |= AccessFs::ReadFile;
        }

        let path_handle = match File::open(&rule.path) {
            Ok(h) => h,
            Err(e) => {
                warn!("Failed to open Landlock rule path {}: {:?}", rule.path, e);
                continue;
            }
        };
        ruleset = ruleset.add_rule(PathBeneath::new(path_handle, access))?;
    }

    ruleset.restrict_self()?;
    info!("Applied granular Landlock restrictions with {} rules", rules.len());
    Ok(())
}
