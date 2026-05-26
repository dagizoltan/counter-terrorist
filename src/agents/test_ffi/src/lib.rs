use sha2::{Sha256, Digest};

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
