#![no_std]

#[repr(C)]
#[derive(Clone, Copy)]
pub struct SyscallEvent {
    pub pid: u32,
    pub comm: [u8; 16],
    pub syscall_id: u32, // 1: ptrace, 2: mmap, 3: execve
}

#[cfg(feature = "user")]
unsafe impl aya::Pod for SyscallEvent {}
