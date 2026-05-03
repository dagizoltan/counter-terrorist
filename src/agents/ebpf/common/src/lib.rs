#![no_std]

#[repr(C)]
#[derive(Clone, Copy)]
pub struct SyscallEvent {
    pub pid: u32,
    pub comm: [u8; 16],
    pub syscall_id: u32, // x86_64: 101 (ptrace), 9 (mmap), 59 (execve)
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct ShadowBanInfo {
    pub last_timestamp: u64,
    pub bytes_this_second: u64,
}

#[cfg(feature = "user")]
unsafe impl aya::Pod for SyscallEvent {}
#[cfg(feature = "user")]
unsafe impl aya::Pod for ShadowBanInfo {}
