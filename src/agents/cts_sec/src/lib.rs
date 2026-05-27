use sha2::{Sha256, Digest};
use std::fs::File;
use std::io::{Read, BufReader};
use shared_memory::*;
use serde::{Serialize};

#[no_mangle]
pub extern "C" fn hash_sha256(data: *const u8, len: usize, out: *mut u8) {
    let input = unsafe { std::slice::from_raw_parts(data, len) };

    // SOV-P5: Architecture-Specific Native Optimizations
    // sha2 crate automatically uses hardware acceleration (ARM Neon / x86 AVX/SHA-NI)
    // if compiled with appropriate target features.

    let mut hasher = Sha256::new();
    hasher.update(input);
    let result = hasher.finalize();
    unsafe {
        std::ptr::copy_nonoverlapping(result.as_ptr(), out, 32);
    }
}

/// SOV-P5: Native SIMD-accelerated memory obfuscation (XOR)
/// Uses AVX2 on x86_64 and Neon on aarch64 for high-speed morphing.
#[no_mangle]
pub extern "C" fn fast_morph(data: *mut u8, len: usize, key: *const u8, key_len: usize) {
    let slice = unsafe { std::slice::from_raw_parts_mut(data, len) };
    let key_slice = unsafe { std::slice::from_raw_parts(key, key_len) };
    if key_len == 0 { return; }

    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") && key_len >= 32 {
            unsafe { xor_avx2(slice, key_slice) };
            return;
        }
    }

    #[cfg(target_arch = "aarch64")]
    {
        if key_len >= 16 {
            unsafe { xor_neon(slice, key_slice) };
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

#[no_mangle]
pub extern "C" fn hash_file_sha256(path: *const i8, out: *mut u8) -> i32 {
    let path_str = unsafe { std::ffi::CStr::from_ptr(path) }.to_str();
    let path_str = match path_str {
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
    unsafe {
        std::ptr::copy_nonoverlapping(result.as_ptr(), out, 32);
    }
    0
}

#[no_mangle]
pub extern "C" fn create_shmem(path: *const i8, size: usize) -> *mut Shmem {
    let path_str = unsafe { std::ffi::CStr::from_ptr(path) }.to_str().unwrap();

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

#[no_mangle]
pub extern "C" fn shmem_read(shmem_ptr: *mut Shmem, out_buf: *mut u8, max_len: usize) -> i32 {
    if shmem_ptr.is_null() { return -1; }
    let shmem = unsafe { &mut *shmem_ptr };
    let slice = unsafe { shmem.as_slice_mut() };

    if slice.len() < 8 { return -2; }

    let mut len_bytes = [0u8; 4];
    len_bytes.copy_from_slice(&slice[0..4]);
    let len = u32::from_le_bytes(len_bytes) as usize;

    if len == 0 { return 0; }
    if len > max_len || len > slice.len() - 8 { return -3; }

    unsafe {
        std::ptr::copy_nonoverlapping(slice[8..8+len].as_ptr(), out_buf, len);
        let zero_len = 0u32.to_le_bytes();
        std::ptr::copy_nonoverlapping(zero_len.as_ptr(), slice.as_mut_ptr(), 4);
    }
    len as i32
}

#[no_mangle]
pub extern "C" fn shmem_write(shmem_ptr: *mut Shmem, data: *const u8, len: usize) -> bool {
    if shmem_ptr.is_null() { return false; }
    let shmem = unsafe { &mut *shmem_ptr };
    let slice = unsafe { shmem.as_slice_mut() };

    if slice.len() < 8 || len + 8 > slice.len() { return false; }

    let mut current_len_bytes = [0u8; 4];
    current_len_bytes.copy_from_slice(&slice[0..4]);
    let current_len = u32::from_le_bytes(current_len_bytes);

    if current_len != 0 { return false; }

    unsafe {
        std::ptr::copy_nonoverlapping(data, slice[8..8+len].as_mut_ptr(), len);
        let len_bytes = (len as u32).to_le_bytes();
        std::ptr::copy_nonoverlapping(len_bytes.as_ptr(), slice.as_mut_ptr(), 4);
    }
    true
}

#[no_mangle]
pub extern "C" fn serialize_msgpack(json_ptr: *const i8, out_len: *mut usize) -> *mut u8 {
    let json_str = unsafe { std::ffi::CStr::from_ptr(json_ptr) }.to_str().unwrap();
    let value: serde_json::Value = match serde_json::from_str(json_str) {
        Ok(v) => v,
        Err(_) => return std::ptr::null_mut(),
    };
    let mut buf = Vec::new();
    if value.serialize(&mut rmp_serde::Serializer::new(&mut buf)).is_err() {
        return std::ptr::null_mut();
    }

    unsafe { *out_len = buf.len() };
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub extern "C" fn deserialize_msgpack(msgpack_ptr: *const u8, len: usize) -> *mut i8 {
    let buf = unsafe { std::slice::from_raw_parts(msgpack_ptr, len) };
    let value: serde_json::Value = match rmp_serde::from_slice(buf) {
        Ok(v) => v,
        Err(_) => return std::ptr::null_mut(),
    };

    let json_str = match serde_json::to_string(&value) {
        Ok(s) => s,
        Err(_) => return std::ptr::null_mut(),
    };

    let c_str = std::ffi::CString::new(json_str).unwrap();
    c_str.into_raw()
}

#[no_mangle]
pub extern "C" fn free_string(ptr: *mut i8) {
    if !ptr.is_null() {
        unsafe {
            let _ = std::ffi::CString::from_raw(ptr);
        }
    }
}

#[no_mangle]
pub extern "C" fn free_buffer(ptr: *mut u8, len: usize) {
    unsafe {
        let _ = Vec::from_raw_parts(ptr, len, len);
    }
}
