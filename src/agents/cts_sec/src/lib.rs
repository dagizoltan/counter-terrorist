use sha2::{Sha256, Digest};
use std::fs::File;
use std::io::{Read, BufReader, Write};
use shared_memory::*;
use serde::{Serialize};
use std::os::unix::io::{AsRawFd, FromRawFd, OwnedFd};
use std::sync::atomic::{AtomicU32, Ordering};

/// Computes SHA256 hash of the input data.
///
/// # Safety
/// * `data` must be a valid pointer to at least `len` bytes.
/// * `out` must be a valid pointer to a buffer of at least 32 bytes.
#[no_mangle]
pub unsafe extern "C" fn hash_sha256(data: *const u8, len: usize, out: *mut u8) {
    if data.is_null() || out.is_null() { return; }
    let input = std::slice::from_raw_parts(data, len);

    let mut hasher = Sha256::new();
    hasher.update(input);
    let result = hasher.finalize();
    std::ptr::copy_nonoverlapping(result.as_ptr(), out, 32);
}

/// SOV-P5: Native optimized MessagePack serialization
///
/// # Safety
/// * `json_ptr` must be a valid, null-terminated C string.
/// * `out_len` must be a valid pointer to a `usize`.
/// * The returned pointer must be freed using `free_buffer`.
#[no_mangle]
pub unsafe extern "C" fn fast_serialize_msgpack(json_ptr: *const i8, out_len: *mut usize) -> *mut u8 {
    if json_ptr.is_null() || out_len.is_null() { return std::ptr::null_mut(); }
    let json_bytes = std::ffi::CStr::from_ptr(json_ptr).to_bytes();

    let mut buf = Vec::with_capacity(8192);

    let value: serde_json::Value = match serde_json::from_slice(json_bytes) {
        Ok(v) => v,
        Err(_) => return std::ptr::null_mut(),
    };

    if value.serialize(&mut rmp_serde::Serializer::new(&mut buf)).is_err() {
        return std::ptr::null_mut();
    }

    *out_len = buf.len();
    let boxed_slice = buf.into_boxed_slice();
    let ptr = boxed_slice.as_ptr() as *mut u8;
    std::mem::forget(boxed_slice);
    ptr
}

/// SOV-P5: Native SIMD-accelerated memory obfuscation (XOR)
///
/// # Safety
/// * `data` must be a valid pointer to at least `len` bytes.
/// * `key` must be a valid pointer to at least `key_len` bytes.
#[no_mangle]
pub unsafe extern "C" fn fast_morph(data: *mut u8, len: usize, key: *const u8, key_len: usize) {
    if data.is_null() || key.is_null() || key_len == 0 { return; }
    let slice = std::slice::from_raw_parts_mut(data, len);
    let key_slice = std::slice::from_raw_parts(key, key_len);

    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") && key_len >= 32 {
            xor_avx2(slice, key_slice);
            return;
        }
    }

    #[cfg(target_arch = "aarch64")]
    {
        if key_len >= 16 {
            xor_neon(slice, key_slice);
            return;
        }
    }

    // Fallback
    for i in 0..len {
        slice[i] ^= key_slice[i % key_len];
    }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
unsafe fn xor_avx2(data: &mut [u8], key: &[u8]) {
    use std::arch::x86_64::*;
    let key_ptr = key.as_ptr() as *const __m256i;
    let key_vec = _mm256_loadu_si256(key_ptr);

    let mut chunks = data.chunks_exact_mut(32);
    for chunk in chunks.by_ref() {
        let data_vec = _mm256_loadu_si256(chunk.as_ptr() as *const __m256i);
        let res_vec = _mm256_xor_si256(data_vec, key_vec);
        _mm256_storeu_si256(chunk.as_mut_ptr() as *mut __m256i, res_vec);
    }

    let rem = chunks.into_remainder();
    for i in 0..rem.len() {
        rem[i] ^= key[i % key.len()];
    }
}

#[cfg(target_arch = "aarch64")]
unsafe fn xor_neon(data: &mut [u8], key: &[u8]) {
    use std::arch::aarch64::*;
    let key_vec = vld1q_u8(key.as_ptr());

    let mut chunks = data.chunks_exact_mut(16);
    for chunk in chunks.by_ref() {
        let data_vec = vld1q_u8(chunk.as_ptr());
        let res_vec = veorq_u8(data_vec, key_vec);
        vst1q_u8(chunk.as_mut_ptr(), res_vec);
    }

    let rem = chunks.into_remainder();
    for i in 0..rem.len() {
        rem[i] ^= key[i % key.len()];
    }
}

/// Computes SHA256 hash of a file.
///
/// # Safety
/// * `path` must be a valid, null-terminated C string.
/// * `out` must be a valid pointer to a buffer of at least 32 bytes.
#[no_mangle]
pub unsafe extern "C" fn hash_file_sha256(path: *const i8, out: *mut u8) -> i32 {
    if path.is_null() || out.is_null() { return -4; }
    let path_str = match std::ffi::CStr::from_ptr(path).to_str() {
        Ok(s) => s,
        Err(_) => return -1,
    };

    let file = match File::open(path_str) {
        Ok(f) => f,
        Err(_) => return -2,
    };

    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536];

    loop {
        let count = match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(c) => c,
            Err(_) => return -3,
        };
        hasher.update(&buffer[..count]);
    }

    let result = hasher.finalize();
    std::ptr::copy_nonoverlapping(result.as_ptr(), out, 32);
    0
}

/// Creates or opens a shared memory segment.
///
/// # Safety
/// * `path` must be a valid, null-terminated C string.
#[no_mangle]
pub unsafe extern "C" fn create_shmem(path: *const i8, size: usize) -> *mut Shmem {
    if path.is_null() { return std::ptr::null_mut(); }
    let path_str = match std::ffi::CStr::from_ptr(path).to_str() {
        Ok(s) => s,
        Err(_) => return std::ptr::null_mut(),
    };

    if let Ok(s) = ShmemConf::new().flink(path_str).open() {
        return Box::into_raw(Box::new(s));
    }

    let shmem = ShmemConf::new()
        .size(size)
        .flink(path_str)
        .create();

    match shmem {
        Ok(s) => Box::into_raw(Box::new(s)),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Reads data from a shared memory segment. (Legacy Single-Slot)
///
/// # Safety
/// * `shmem_ptr` must be a valid pointer to a `Shmem` instance.
/// * `out_buf` must be a valid pointer to a buffer of at least `max_len` bytes.
#[no_mangle]
pub unsafe extern "C" fn shmem_read(shmem_ptr: *mut Shmem, out_buf: *mut u8, max_len: usize) -> i32 {
    if shmem_ptr.is_null() || out_buf.is_null() { return -1; }
    let shmem = &mut *shmem_ptr;
    let slice = shmem.as_slice_mut();

    if slice.len() < 8 { return -2; }

    let mut len_bytes = [0u8; 4];
    len_bytes.copy_from_slice(&slice[0..4]);
    let len = u32::from_le_bytes(len_bytes) as usize;

    if len == 0 { return 0; }
    if len > max_len || len > slice.len() - 8 { return -3; }

    std::ptr::copy_nonoverlapping(slice[8..8+len].as_ptr(), out_buf, len);
    let zero_len = 0u32.to_le_bytes();
    std::ptr::copy_nonoverlapping(zero_len.as_ptr(), slice.as_mut_ptr(), 4);

    len as i32
}

/// SOV-M4: Zero-Copy Ring Buffer Pull
/// Returns a pointer to the next message and its length.
/// Returns 0 if no message is available.
///
/// # Safety
/// * `shmem_ptr` must be a valid pointer to a `Shmem` instance.
/// * `out_len` must be a valid pointer to a `u32`.
#[no_mangle]
pub unsafe extern "C" fn shmem_ring_pull(shmem_ptr: *mut Shmem, out_len: *mut u32) -> *const u8 {
    if shmem_ptr.is_null() || out_len.is_null() { return std::ptr::null(); }
    let shmem = &mut *shmem_ptr;
    let slice = shmem.as_slice_mut();
    if slice.len() < 32 { return std::ptr::null(); }

    let head_ptr = slice.as_ptr() as *const AtomicU32;
    let tail_ptr = slice.as_ptr().add(4) as *const AtomicU32;
    let cap_ptr = slice.as_ptr().add(8) as *const u32;

    let head = (*head_ptr).load(Ordering::Acquire);
    let tail = (*tail_ptr).load(Ordering::Acquire);
    let capacity = *cap_ptr;

    if head == tail { return std::ptr::null(); }

    let data_offset = 16;

    // Safety check: ensure current tail + 4 is within capacity
    if tail + 4 > capacity { return std::ptr::null(); }

    let mut len_bytes = [0u8; 4];
    len_bytes.copy_from_slice(&slice[data_offset + tail as usize..data_offset + tail as usize + 4]);
    let mut msg_len = u32::from_le_bytes(len_bytes);

    let mut effective_tail = tail;

    if msg_len == 0xFFFFFFFF {
        // Skip to beginning
        effective_tail = 0;
        // Safety check: ensure capacity can hold another header at start
        if capacity < 4 { return std::ptr::null(); }
        len_bytes.copy_from_slice(&slice[data_offset..data_offset + 4]);
        msg_len = u32::from_le_bytes(len_bytes);

        if msg_len == 0 || msg_len == 0xFFFFFFFF {
            return std::ptr::null();
        }
    }

    if msg_len == 0 || msg_len > capacity - 4 || effective_tail + 4 + msg_len > capacity {
        return std::ptr::null();
    }

    *out_len = msg_len;
    slice.as_ptr().add(data_offset + effective_tail as usize + 4)
}

/// SOV-M4: Zero-Copy Ring Buffer Commit
/// Advances the tail pointer after processing a message.
///
/// # Safety
/// * `shmem_ptr` must be a valid pointer to a `Shmem` instance.
#[no_mangle]
pub unsafe extern "C" fn shmem_ring_commit(shmem_ptr: *mut Shmem) {
    if shmem_ptr.is_null() { return; }
    let shmem = &mut *shmem_ptr;
    let slice = shmem.as_slice_mut();
    if slice.len() < 32 { return; }

    let head_ptr = slice.as_ptr() as *const AtomicU32;
    let tail_ptr = slice.as_ptr().add(4) as *const AtomicU32;
    let cap_ptr = slice.as_ptr().add(8) as *const u32;

    let head = (*head_ptr).load(Ordering::Acquire);
    let tail = (*tail_ptr).load(Ordering::Acquire);
    let capacity = *cap_ptr;

    if head == tail { return; }

    let data_offset = 16;

    if tail + 4 > capacity { return; }

    let mut len_bytes = [0u8; 4];
    len_bytes.copy_from_slice(&slice[data_offset + tail as usize..data_offset + tail as usize + 4]);
    let msg_len = u32::from_le_bytes(len_bytes);

    if msg_len == 0xFFFFFFFF {
        // Skip marker, jump to 0 and commit first message there
        if capacity < 4 { return; }
        len_bytes.copy_from_slice(&slice[data_offset..data_offset + 4]);
        let wrapped_msg_len = u32::from_le_bytes(len_bytes);
        if wrapped_msg_len != 0 && wrapped_msg_len != 0xFFFFFFFF && 4 + wrapped_msg_len <= capacity {
            (*tail_ptr).store(4 + wrapped_msg_len, Ordering::Release);
        }
    } else {
        if tail + 4 + msg_len <= capacity {
            (*tail_ptr).store(tail + 4 + msg_len, Ordering::Release);
        }
    }
}

/// Writes data to a shared memory segment.
///
/// # Safety
/// * `shmem_ptr` must be a valid pointer to a `Shmem` instance.
/// * `data` must be a valid pointer to at least `len` bytes.
#[no_mangle]
pub unsafe extern "C" fn shmem_write(shmem_ptr: *mut Shmem, data: *const u8, len: usize) -> bool {
    if shmem_ptr.is_null() || data.is_null() { return false; }
    let shmem = &mut *shmem_ptr;
    let slice = shmem.as_slice_mut();

    if slice.len() < 8 || len + 8 > slice.len() { return false; }

    let mut current_len_bytes = [0u8; 4];
    current_len_bytes.copy_from_slice(&slice[0..4]);
    let current_len = u32::from_le_bytes(current_len_bytes);

    if current_len != 0 { return false; }

    std::ptr::copy_nonoverlapping(data, slice[8..8+len].as_mut_ptr(), len);
    let len_bytes = (len as u32).to_le_bytes();
    std::ptr::copy_nonoverlapping(len_bytes.as_ptr(), slice.as_mut_ptr(), 4);

    true
}

/// Serializes a JSON string to MessagePack.
///
/// # Safety
/// * `json_ptr` must be a valid, null-terminated C string.
/// * `out_len` must be a valid pointer to a `usize`.
#[no_mangle]
pub unsafe extern "C" fn serialize_msgpack(json_ptr: *const i8, out_len: *mut usize) -> *mut u8 {
    if json_ptr.is_null() || out_len.is_null() { return std::ptr::null_mut(); }
    let json_str = match std::ffi::CStr::from_ptr(json_ptr).to_str() {
        Ok(s) => s,
        Err(_) => return std::ptr::null_mut(),
    };
    let value: serde_json::Value = match serde_json::from_str(json_str) {
        Ok(v) => v,
        Err(_) => return std::ptr::null_mut(),
    };
    let mut buf = Vec::new();
    if value.serialize(&mut rmp_serde::Serializer::new(&mut buf)).is_err() {
        return std::ptr::null_mut();
    }

    *out_len = buf.len();
    let boxed_slice = buf.into_boxed_slice();
    let ptr = boxed_slice.as_ptr() as *mut u8;
    std::mem::forget(boxed_slice);
    ptr
}

/// Deserializes MessagePack to a JSON string.
///
/// # Safety
/// * `msgpack_ptr` must be a valid pointer to at least `len` bytes.
#[no_mangle]
pub unsafe extern "C" fn deserialize_msgpack(msgpack_ptr: *const u8, len: usize) -> *mut i8 {
    if msgpack_ptr.is_null() { return std::ptr::null_mut(); }
    let buf = std::slice::from_raw_parts(msgpack_ptr, len);
    let value: serde_json::Value = match rmp_serde::from_slice(buf) {
        Ok(v) => v,
        Err(_) => return std::ptr::null_mut(),
    };

    let json_str = match serde_json::to_string(&value) {
        Ok(s) => s,
        Err(_) => return std::ptr::null_mut(),
    };

    match std::ffi::CString::new(json_str) {
        Ok(c_str) => c_str.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Frees a string allocated by `deserialize_msgpack`.
///
/// # Safety
/// * `ptr` must be a pointer returned by `deserialize_msgpack` or `std::ptr::null_mut()`.
#[no_mangle]
pub unsafe extern "C" fn free_string(ptr: *mut i8) {
    if !ptr.is_null() {
        let _ = std::ffi::CString::from_raw(ptr);
    }
}

/// Frees a buffer allocated by `fast_serialize_msgpack` or `serialize_msgpack`.
///
/// # Safety
/// * `ptr` must be a pointer returned by the serialization functions.
/// * `len` must be the same length returned by those functions.
#[no_mangle]
pub unsafe extern "C" fn free_buffer(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        let _ = Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len));
    }
}

/// SOV-P1: Binary Sovereignty - Execution from Memory
/// Creates a sealed memfd and loads the provided binary data into it.
/// Returns the file descriptor or -1 on failure.
///
/// # Safety
/// * `name` must be a valid, null-terminated C string.
/// * `data` must be a valid pointer to at least `len` bytes.
#[no_mangle]
pub unsafe extern "C" fn create_sealed_memfd(name: *const i8, data: *const u8, len: usize) -> i32 {
    if name.is_null() || data.is_null() || len == 0 { return -1; }

    // libc Constants for memfd_create and fcntl
    const MFD_CLOEXEC: u32 = 0x0001;
    const MFD_ALLOW_SEALING: u32 = 0x0002;
    const F_ADD_SEALS: i32 = 1033;
    const F_SEAL_SEAL: i32 = 0x0001;
    const F_SEAL_SHRINK: i32 = 0x0002;
    const F_SEAL_GROW: i32 = 0x0004;
    const F_SEAL_WRITE: i32 = 0x0008;

    // 1. Create anonymous memory file
    let fd = libc::syscall(libc::SYS_memfd_create, name.cast::<libc::c_char>(), MFD_CLOEXEC | MFD_ALLOW_SEALING) as i32;
    if fd < 0 { return -1; }

    let mut file = std::fs::File::from(OwnedFd::from_raw_fd(fd));

    // 2. Load binary data
    let data_slice = std::slice::from_raw_parts(data, len);
    if file.write_all(data_slice).is_err() {
        return -1;
    }

    // 3. Seal the file to prevent modifications
    let seals = F_SEAL_SEAL | F_SEAL_SHRINK | F_SEAL_GROW | F_SEAL_WRITE;
    if libc::fcntl(fd, F_ADD_SEALS, seals) < 0 {
        return -1;
    }

    // 4. Return the raw FD (ownership transferred to orchestrator)
    std::mem::forget(file);
    fd
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256() {
        let data = b"hello world";
        let mut out = [0u8; 32];
        unsafe { hash_sha256(data.as_ptr(), data.len(), out.as_mut_ptr()) };
        let expected = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
        assert_eq!(hex::encode(out), expected);
    }

    #[test]
    fn test_fast_serialize() {
        use std::ffi::CString;
        let json = CString::new("{\"key\":\"value\"}").unwrap();
        let mut out_len = 0usize;
        unsafe {
            let ptr = fast_serialize_msgpack(json.as_ptr(), &mut out_len);
            assert!(!ptr.is_null());
            assert!(out_len > 0);
            free_buffer(ptr, out_len);
        }
    }
}
