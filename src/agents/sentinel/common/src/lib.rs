#![no_std]
use zerocopy::{AsBytes, FromBytes, FromZeroes};

#[repr(C)]
#[derive(Clone, Copy, AsBytes, FromBytes, FromZeroes)]
pub struct SyscallEvent {
    pub pid: u32,
    pub comm: [u8; 16],
    pub syscall_id: u32, // x86_64: 101 (ptrace), 9 (mmap), 59 (execve), 42 (connect), 257 (openat)
    pub fd: u32,
    pub port: u16,
    pub family: u16,
    pub ip: [u8; 16],
}

#[repr(C)]
#[derive(Clone, Copy, AsBytes, FromBytes, FromZeroes)]
pub struct ShadowBanInfo {
    pub last_timestamp: u64,
    pub bytes_this_second: u64,
}

#[repr(C)]
#[derive(Clone, Copy, PartialEq, Eq, AsBytes, FromBytes, FromZeroes)]
pub struct SessionKey {
    pub src_ip: [u8; 16],
    pub dst_ip: [u8; 16],
    pub src_port: u16,
    pub dst_port: u16,
    pub proto: u8,
    pub family: u8,
}

#[repr(C)]
#[derive(Clone, Copy, PartialEq, Eq, AsBytes, FromBytes, FromZeroes)]
pub struct IpV6Addr {
    pub addr: [u8; 16],
}

#[repr(C)]
#[derive(Clone, Copy, PartialEq, Eq, AsBytes, FromBytes, FromZeroes)]
pub struct SyscallAllowKey {
    pub pid: u32,
    pub syscall_id: u32,
}

#[repr(C)]
#[derive(Clone, Copy, AsBytes, FromBytes, FromZeroes)]
pub struct SessionValue {
    pub last_seen: u64,
    pub bytes_count: u64,
}

#[cfg(feature = "user")]
unsafe impl aya::Pod for SyscallEvent {}
#[cfg(feature = "user")]
unsafe impl aya::Pod for ShadowBanInfo {}
#[cfg(feature = "user")]
unsafe impl aya::Pod for SessionKey {}
#[cfg(feature = "user")]
unsafe impl aya::Pod for SessionValue {}
#[cfg(feature = "user")]
unsafe impl aya::Pod for IpV6Addr {}
#[cfg(feature = "user")]
unsafe impl aya::Pod for SyscallAllowKey {}
