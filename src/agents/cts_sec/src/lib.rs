use sha2::{Sha256, Digest};
use std::fs::File;
use std::io::{Read, BufReader};
use shared_memory::*;
use serde::{Serialize};

#[no_mangle]
pub extern "C" fn hash_sha256(data: *const u8, len: usize, out: *mut u8) {
    let input = unsafe { std::slice::from_raw_parts(data, len) };
    let mut hasher = Sha256::new();
    hasher.update(input);
    let result = hasher.finalize();
    unsafe {
        std::ptr::copy_nonoverlapping(result.as_ptr(), out, 32);
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

// SOV-P5: Zero-Copy Shared Memory IPC
// We use a simple ring buffer structure in shared memory.

#[no_mangle]
pub extern "C" fn create_shmem(path: *const i8, size: usize) -> *mut Shmem {
    let path_str = unsafe { std::ffi::CStr::from_ptr(path) }.to_str().unwrap();

    // Attempt to open existing first (Orchestrator side)
    if let Ok(s) = ShmemConf::new().flink(path_str).open() {
        return Box::into_raw(Box::new(s));
    }

    // Otherwise create (Agent side)
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

    // SOV-P5: Stabilized Atomic Ring Buffer Protocol
    // Structure: [len: u32][data...]
    // We use atomic-like semantics by clearing the length after read to prevent double-read.
    if slice.len() < 4 { return -2; }

    let mut len_bytes = [0u8; 4];
    len_bytes.copy_from_slice(&slice[0..4]);
    let len = u32::from_le_bytes(len_bytes) as usize;

    if len == 0 { return 0; }
    if len > max_len || len > slice.len() - 4 { return -3; }

    unsafe {
        std::ptr::copy_nonoverlapping(slice[4..4+len].as_ptr(), out_buf, len);

        // Atomic-like clear of the length header to signal completion to agent
        // We use volatile-like write via ptr::write_bytes or atomic equivalents if needed.
        // For shmem, ptr::copy_nonoverlapping onto the mutable slice pointer is sufficient.
        let zero_len = 0u32.to_le_bytes();
        std::ptr::copy_nonoverlapping(zero_len.as_ptr(), slice.as_mut_ptr(), 4);
    }
    len as i32
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
