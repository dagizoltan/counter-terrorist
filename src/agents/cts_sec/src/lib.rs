use sha2::{Sha256, Digest};
use std::fs::File;
use std::io::{Read, BufReader};

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
