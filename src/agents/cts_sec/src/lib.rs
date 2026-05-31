use sha2::{Sha256, Digest};
use std::fs::File;
use std::io::{Read, BufReader};
use shared_memory::*;
use serde::{Serialize};

/// Computes SHA256 hash of the input data.
///
/// # Safety
/// * `data` must be a valid pointer to at least `len` bytes.
/// * `out` must be a valid pointer to a buffer of at least 32 bytes.
#[no_mangle]
pub unsafe extern "C" fn hash_sha256(data: *const u8, len: usize, out: *mut u8) {
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
    let slice = std::slice::from_raw_parts_mut(data, len);
    let key_slice = std::slice::from_raw_parts(key, key_len);
    if key_len == 0 { return; }

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

/// Reads data from a shared memory segment.
///
/// # Safety
/// * `shmem_ptr` must be a valid pointer to a `Shmem` instance.
/// * `out_buf` must be a valid pointer to a buffer of at least `max_len` bytes.
#[no_mangle]
pub unsafe extern "C" fn shmem_read(shmem_ptr: *mut Shmem, out_buf: *mut u8, max_len: usize) -> i32 {
    if shmem_ptr.is_null() { return -1; }
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

/// Writes data to a shared memory segment.
///
/// # Safety
/// * `shmem_ptr` must be a valid pointer to a `Shmem` instance.
/// * `data` must be a valid pointer to at least `len` bytes.
#[no_mangle]
pub unsafe extern "C" fn shmem_write(shmem_ptr: *mut Shmem, data: *const u8, len: usize) -> bool {
    if shmem_ptr.is_null() { return false; }
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
