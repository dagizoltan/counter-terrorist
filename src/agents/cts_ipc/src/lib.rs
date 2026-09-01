pub mod models;

use ed25519_dalek::{Signer, SigningKey};
use shared_memory::*;
use landlock::*;
use serde::{Serialize, Deserialize};
use std::fs::File;
use std::sync::Arc;
use parking_lot::Mutex;
use std::path::Path;
use log::{info, error, debug, warn};
use std::sync::atomic::{AtomicU32, Ordering};

pub struct ShmemWrapper(pub Shmem);
unsafe impl Send for ShmemWrapper {}
unsafe impl Sync for ShmemWrapper {}

impl Drop for ShmemWrapper {
    fn drop(&mut self) {
        info!("Dropping shared memory segment at {:?}", self.0.get_flink_path());
    }
}

/// SOV-M4: Zero-Copy Lock-Free Ring Buffer implementation for high-performance telemetry.
/// Layout:
/// [0..4]   head (AtomicU32) - Written by Producer
/// [4..8]   tail (AtomicU32) - Written by Consumer
/// [8..12]  capacity (u32)
/// [12..16] reserved
/// [16..]   data
pub struct IpcRingBuffer<'a> {
    head: &'a AtomicU32,
    tail: &'a AtomicU32,
    capacity: u32,
    data: &'a mut [u8],
}

impl<'a> IpcRingBuffer<'a> {
    pub fn new(slice: &'a mut [u8]) -> Option<Self> {
        if slice.len() < 32 { return None; }

        // Check 4-byte pointer alignment for AtomicU32 head/tail pointers
        let ptr = slice.as_ptr() as usize;
        if ptr % std::mem::align_of::<AtomicU32>() != 0 {
            error!("Shared memory buffer slice is unaligned for AtomicU32");
            return None;
        }

        let capacity = (slice.len() - 16) as u32;
        let (header, data) = slice.split_at_mut(16);

        let head = unsafe { &*(header.as_ptr() as *const AtomicU32) };
        let tail = unsafe { &*(header.as_ptr().add(4) as *const AtomicU32) };

        // Publish the capacity every time rather than only when the slot reads zero.
        // Capacity is a pure function of the segment we just mapped, so re-attaching to
        // a segment left behind by an earlier run (or by another process) must not let a
        // stale — or forged — value stand as the bound the consumer reads.
        unsafe {
            let cap_ptr = header.as_mut_ptr().add(8) as *mut u32;
            *cap_ptr = capacity;
        }

        Some(Self { head, tail, capacity, data })
    }

    pub fn push(&mut self, msg: &[u8]) -> bool {
        let msg_len = msg.len() as u32;
        let total_len = 4 + msg_len;

        // Safety: ensure capacity can at least hold one message header and skip marker
        if self.capacity < 8 || total_len > self.capacity - 4 { return false; }

        let head = self.head.load(Ordering::Acquire);
        let tail = self.tail.load(Ordering::Acquire);

        // head and tail are relative to the start of the data section (offset 16)
        let used = if head >= tail {
            head - tail
        } else {
            self.capacity - (tail - head)
        };

        // We leave 1 byte empty to distinguish full/empty
        let free_space = self.capacity - used - 1;

        if free_space < total_len {
            return false;
        }

        // Check if we need to wrap around to keep message contiguous
        if head + total_len + 4 > self.capacity {
            // Can we fit it at the beginning?
            // tail must be far enough from 0.
            // We use Acquire/Release to ensure we see the latest tail.
            if tail > total_len {
                // Write skip marker at current head
                let skip_marker = 0xFFFFFFFFu32.to_le_bytes();
                self.data[head as usize..head as usize + 4].copy_from_slice(&skip_marker);

                // Write message at start
                self.data[0..4].copy_from_slice(&msg_len.to_le_bytes());
                self.data[4..4+msg_len as usize].copy_from_slice(msg);
                self.head.store(total_len, Ordering::Release);
                return true;
            } else {
                return false; // Buffer full/fragmented
            }
        }

        // Normal write
        self.data[head as usize..head as usize + 4].copy_from_slice(&msg_len.to_le_bytes());
        self.data[head as usize + 4..head as usize + 4 + msg_len as usize].copy_from_slice(msg);
        self.head.store(head + total_len, Ordering::Release);

        true
    }
}

/// IpcManager handles shared memory communication between the orchestrator and sidecars.
/// It provides high-performance binary telemetry and command polling.
pub struct IpcManager {
    shmem: Option<Arc<Mutex<ShmemWrapper>>>,
    cmd_shmem: Option<Arc<Mutex<ShmemWrapper>>>,
    obfuscation_key: Option<Vec<u8>>,
    signing_key: Option<SigningKey>,
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
            Err(_) => {
                // Try to open existing
                match ShmemConf::new().flink(&event_path).open() {
                    Ok(s) => Some(Arc::new(Mutex::new(ShmemWrapper(s)))),
                    Err(e) => {
                        error!("Failed to create/open telemetry shared memory at {}: {:?}", event_path, e);
                        None
                    }
                }
            }
        };

        if shmem.is_none() {
            return Self { shmem: None, cmd_shmem: None, obfuscation_key: None, signing_key: None };
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
            Err(_) => {
                match ShmemConf::new().flink(&cmd_path).open() {
                    Ok(s) => Some(Arc::new(Mutex::new(ShmemWrapper(s)))),
                    Err(e) => {
                        error!("Failed to create/open command shared memory at {}: {:?}", cmd_path, e);
                        None
                    }
                }
            }
        };

        let obfuscation_key = std::env::var("CTS_MESH_SECRET")
            .ok()
            .map(|s| s.as_bytes().to_vec());

        // SOV-P5: Telemetry Signing - Load or generate identity key
        // In a real environment, this would be derived from the TPM or a persistent config.
        let signing_key = std::env::var("CTS_AGENT_KEY")
            .ok()
            .and_then(|s| {
                let bytes = hex::decode(s).ok()?;
                let bytes: [u8; 32] = bytes.try_into().ok()?;
                Some(SigningKey::from_bytes(&bytes))
            });

        Self { shmem, cmd_shmem, obfuscation_key, signing_key }
    }

    /// Emits a serialized event into the shared memory buffer using the Ring Buffer.
    /// In SOV-P5, events are optionally signed if a signing key is available.
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

        // SOV-P5: Telemetry Signing
        // We prepend the 64-byte Ed25519 signature to the payload if the key is available.
        if let Some(key) = &self.signing_key {
            let signature = key.sign(&buf);
            let mut signed_buf = Vec::with_capacity(64 + buf.len());
            signed_buf.extend_from_slice(&signature.to_bytes());
            signed_buf.extend_from_slice(&buf);
            buf = signed_buf;
        }

        // SEC-03: Shared Memory IPC Hardening - Multi-Byte XOR Obfuscation
        if let Some(key) = &self.obfuscation_key {
            if !key.is_empty() {
                for i in 0..buf.len() {
                    buf[i] ^= key[i % key.len()];
                }
            }
        }

        let mut shmem_wrapper = shmem_arc.lock();
        let slice = unsafe { shmem_wrapper.0.as_slice_mut() };

        if let Some(mut ring) = IpcRingBuffer::new(slice) {
            if ring.push(&buf) {
                // SOV-P5: Threshold-based signaling optimization
                println!("SHMEM_UPDATE:{}", buf.len());
                debug!("Emitted event of size {}", buf.len());
                return true;
            } else {
                debug!("Shared memory ring buffer saturated, dropping event");
            }
        }

        false
    }

    /// Polls for a command from the orchestrator.
    /// Returns the deserialized command if available.
    /// Commands still use the legacy single-slot mechanism for simplicity as they are low frequency.
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
            // SOV-06 Hardening: Explicit bounds check to prevent out-of-bounds access on corrupted headers
            if current_len + 8 <= slice.len() {
                let mut data = slice[8..8+current_len].to_vec();

                // SEC-03: Shared Memory IPC Hardening - Multi-Byte XOR Obfuscation
                if let Some(key) = &self.obfuscation_key {
                    if !key.is_empty() {
                        for i in 0..data.len() {
                            data[i] ^= key[i % key.len()];
                        }
                    }
                }

                let cmd = match rmp_serde::from_slice::<T>(&data) {
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
    let canonical_path = std::fs::canonicalize(&path).unwrap_or_else(|_| path.as_ref().to_path_buf());
    let ruleset = Ruleset::default()
        .handle_access(AccessFs::from_all(abi))?
        .create()?;

    let path_handle = File::open(canonical_path)?;
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

    #[test]
    fn test_ring_buffer_basic() {
        let mut buf = [0u8; 128];
        let mut ring = IpcRingBuffer::new(&mut buf).unwrap();

        assert!(ring.push(b"hello"));
        assert!(ring.push(b"world"));

        let head = ring.head.load(Ordering::Relaxed);
        assert!(head > 0);
    }

    #[test]
    fn test_ring_buffer_wrap_around() {
        // 16 bytes header + 64 bytes data = 80 bytes total
        let mut buf = [0u8; 80];
        let mut ring = IpcRingBuffer::new(&mut buf).unwrap();

        // capacity is 64.
        // We push 12 bytes (4 header + 8 data)
        assert!(ring.push(b"12345678")); // head = 12
        assert!(ring.push(b"12345678")); // head = 24
        assert!(ring.push(b"12345678")); // head = 36
        assert!(ring.push(b"12345678")); // head = 48

        // head is 48. Next push 12 bytes. 48 + 12 + 4 = 64.
        // If we push something now, it will wrap because head + 12 + 4 > 64 is FALSE, wait.
        // head + 12 + 4 = 64. 64 is NOT > 64.
        // So it fits without wrapping if we use head + total_len + 4 > capacity.

        assert!(ring.push(b"12345678")); // head = 60

        // Now head is 60. Next push 12 bytes. 60 + 12 + 4 = 76 > 64. MUST WRAP.

        // Consumer "reads" 24 bytes
        ring.tail.store(24, Ordering::Release);

        assert!(ring.push(b"WRAP!!!!"));
        assert_eq!(ring.head.load(Ordering::Relaxed), 12);
    }

    #[test]
    fn test_ring_buffer_oob_prevention() {
        let mut buf = [0u8; 32]; // 16 header + 16 data
        let mut ring = IpcRingBuffer::new(&mut buf).unwrap();

        // Capacity is 16.
        // Try to push something that barely fits
        // msg_len = 4, total_len = 8. 8 + 4 = 12. 12 < 16.
        assert!(ring.push(b"1234"));

        // head is now 8. Next push: msg_len = 4, total_len = 8.
        // 8 + 8 + 4 = 20 > 16. Wraps?
        // tail is 0. 0 is not > 8. Cannot wrap.
        // Should fail.
        assert!(!ring.push(b"5678"));
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
                "read" | "open" | "openat" | "openat2" | "stat" | "statx" | "access" | "faccessat" | "fstatat" => {
                    access |= AccessFs::ReadFile | AccessFs::ReadDir;
                }
                "write" | "truncate" | "ftruncate" | "chmod" | "fchmod" | "fchmodat" | "chown" | "fchown" | "fchownat" => {
                    access |= AccessFs::WriteFile;
                }
                "execute" | "execve" | "execveat" => {
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

        let canonical_path = std::fs::canonicalize(&rule.path).unwrap_or_else(|_| Path::new(&rule.path).to_path_buf());
        let path_handle = match File::open(&canonical_path) {
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
