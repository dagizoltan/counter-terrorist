use shared_memory::*;
use landlock::*;
use serde::Serialize;
use std::fs::File;
use std::sync::Arc;
use parking_lot::Mutex;
use std::path::Path;

pub struct ShmemWrapper(pub Shmem);
unsafe impl Send for ShmemWrapper {}
unsafe impl Sync for ShmemWrapper {}

#[repr(C)]
struct RingBufferHeader {
    len: u32,
    dirty: u32, // Used for threshold-based signaling
}

pub struct IpcManager {
    shmem: Option<Arc<Mutex<ShmemWrapper>>>,
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

        Self { shmem }
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

                    // SOV-P5: Threshold-based signaling optimization
                    // We only signal via stdout if we aren't using a high-frequency polling model
                    println!("SHMEM_UPDATE:{}", buf.len());
                    return true;
                }
            }
        }
        false
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
