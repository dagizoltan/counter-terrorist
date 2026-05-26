#![no_std]
#![no_main]

use aya_ebpf::{
    macros::{kprobe, map, classifier, xdp},
    maps::{PerfEventArray, HashMap, LruHashMap},
    programs::{ProbeContext, TcContext, XdpContext},
    helpers::{bpf_get_current_pid_tgid, bpf_get_current_comm, bpf_ktime_get_ns},
};

use sentinel_common::{SyscallEvent, ShadowBanInfo, SessionKey, SessionValue, IpV6Addr, SyscallAllowKey};
use core::mem;

const TC_ACT_OK: i32 = 0;
const TC_ACT_SHOT: i32 = 2;

const XDP_PASS: u32 = 2;
const XDP_DROP: u32 = 1;

#[map]
static mut EVENTS: PerfEventArray<SyscallEvent> = PerfEventArray::new(0);

#[map]
static mut SHADOW_BANS: HashMap<IpV6Addr, ShadowBanInfo> = HashMap::with_max_entries(1024, 0);

#[map]
static mut HIDE_CONFIG: HashMap<u32, u8> = HashMap::with_max_entries(1024, 0);

#[map]
static mut ACTIVE_SESSIONS: LruHashMap<SessionKey, SessionValue> = LruHashMap::with_max_entries(4096, 0);

#[map]
static mut TRUSTED_COMM: HashMap<[u8; 16], u8> = HashMap::with_max_entries(1024, 0);

#[map]
static mut XDP_BLOCK_LIST: HashMap<IpV6Addr, u32> = HashMap::with_max_entries(1024, 0);

#[map]
static mut ALLOWED_PORTS: HashMap<u16, u8> = HashMap::with_max_entries(1024, 0);

#[map]
static mut FIREWALL_CONFIG: HashMap<u32, u32> = HashMap::with_max_entries(8, 0); // [0] = lockdown

#[map]
static mut ENFORCEMENT_POLICY: HashMap<u32, u32> = HashMap::with_max_entries(1024, 0); // Key: PID, Value: Policy flags (1=BlockAll, 2=NetBlock, 4=FileBlock, 8=MountBlock)

#[map]
static mut SYSCALL_ALLOWLIST: LruHashMap<SyscallAllowKey, u8> = LruHashMap::with_max_entries(4096, 0);

#[xdp]
pub fn xdp_ingress(ctx: XdpContext) -> u32 {
    match try_xdp_ingress(&ctx) {
        Ok(ret) => ret,
        Err(_) => XDP_PASS,
    }
}

#[inline(always)]
fn load<T>(ctx: &XdpContext, offset: usize) -> Result<T, ()> {
    let start = ctx.data();
    let end = ctx.data_end();
    if start + offset + mem::size_of::<T>() > end {
        return Err(());
    }
    unsafe { Ok(core::ptr::read_unaligned((start + offset) as *const T)) }
}

fn try_xdp_ingress(ctx: &XdpContext) -> Result<u32, ()> {
    let eth_proto = u16::from_be(load::<u16>(ctx, 12)?);

    let (src_ip, dst_ip, proto, src_port, dst_port, family) = if eth_proto == 0x0800 { // IPv4
        let src_v4: [u8; 4] = load(ctx, 26)?;
        let dst_v4: [u8; 4] = load(ctx, 30)?;
        let mut src = [0u8; 16];
        let mut dst = [0u8; 16];
        src[0..4].copy_from_slice(&src_v4);
        dst[0..4].copy_from_slice(&dst_v4);
        let proto: u8 = load(ctx, 23)?;
        let (sp, dp) = if proto == 6 || proto == 17 {
            (load::<u16>(ctx, 34)?, load::<u16>(ctx, 36)?)
        } else { (0, 0) };
        (src, dst, proto, sp, dp, 4u8)
    } else if eth_proto == 0x86DD { // IPv6
        let src: [u8; 16] = load(ctx, 22)?;
        let dst: [u8; 16] = load(ctx, 38)?;
        let proto: u8 = load(ctx, 20)?;
        let (sp, dp) = if proto == 6 || proto == 17 {
            (load::<u16>(ctx, 54)?, load::<u16>(ctx, 56)?)
        } else { (0, 0) };
        (src, dst, proto, sp, dp, 6u8)
    } else {
        return Ok(XDP_PASS);
    };

    // 1. GLOBAL LOCKDOWN CHECK
    if let Some(lockdown) = unsafe { FIREWALL_CONFIG.get(&0) } {
        if *lockdown == 1 {
            let key = SessionKey { src_ip: dst_ip, dst_ip: src_ip, src_port: dst_port, dst_port: src_port, proto, family };
            if unsafe { ACTIVE_SESSIONS.get(&key) }.is_some() {
                return Ok(XDP_PASS);
            }
            return Ok(XDP_DROP);
        }
    }

    // 2. EXPLICIT BLOCK LIST CHECK
    if unsafe { XDP_BLOCK_LIST.get(&IpV6Addr { addr: src_ip }) }.is_some() {
        return Ok(XDP_DROP);
    }

    // 3. STATEFUL CHECK: Look for reversed tuple
    let key = SessionKey { src_ip: dst_ip, dst_ip: src_ip, src_port: dst_port, dst_port: src_port, proto, family };

    if unsafe { ACTIVE_SESSIONS.get(&key) }.is_some() {
        return Ok(XDP_PASS);
    }

    // 4. ALLOWED PORTS CHECK
    let dport_host = u16::from_be(dst_port);

    // Fail-safe management ports
    if dport_host == 22 || dport_host == 8000 || dport_host == 8001 {
        return Ok(XDP_PASS);
    }

    if unsafe { ALLOWED_PORTS.get(&dport_host) }.is_some() {
        return Ok(XDP_PASS);
    }

    Ok(XDP_DROP)
}

#[classifier]
pub fn tc_egress(ctx: TcContext) -> i32 {
    let _ = try_tc_egress(&ctx);
    TC_ACT_OK
}

#[inline(always)]
fn load_tc<T>(ctx: &TcContext, offset: usize) -> Result<T, ()> {
    let start = ctx.data();
    let end = ctx.data_end();
    if start + offset + mem::size_of::<T>() > end {
        return Err(());
    }
    unsafe { Ok(core::ptr::read_unaligned((start + offset) as *const T)) }
}

fn try_tc_egress(ctx: &TcContext) -> Result<(), ()> {
    let eth_proto = u16::from_be(load_tc::<u16>(ctx, 12)?);

    let (src_ip, dst_ip, proto, total_len, src_port, dst_port, family) = if eth_proto == 0x0800 {
        let src_v4: [u8; 4] = load_tc(ctx, 26)?;
        let dst_v4: [u8; 4] = load_tc(ctx, 30)?;
        let mut src = [0u8; 16];
        let mut dst = [0u8; 16];
        src[0..4].copy_from_slice(&src_v4);
        dst[0..4].copy_from_slice(&dst_v4);
        let proto: u8 = load_tc(ctx, 23)?;
        let total_len: u16 = u16::from_be(load_tc(ctx, 16)?);
        let (sp, dp) = if proto == 6 || proto == 17 {
            (load_tc::<u16>(ctx, 34)?, load_tc::<u16>(ctx, 36)?)
        } else { (0, 0) };
        (src, dst, proto, total_len as u64, sp, dp, 4u8)
    } else if eth_proto == 0x86DD {
        let src: [u8; 16] = load_tc(ctx, 22)?;
        let dst: [u8; 16] = load_tc(ctx, 38)?;
        let proto: u8 = load_tc(ctx, 20)?;
        let payload_len: u16 = u16::from_be(load_tc(ctx, 18)?);
        let total_len = payload_len as u64 + 40; // IPv6 header is 40 bytes
        let (sp, dp) = if proto == 6 || proto == 17 {
            (load_tc::<u16>(ctx, 54)?, load_tc::<u16>(ctx, 56)?)
        } else { (0, 0) };
        (src, dst, proto, total_len, sp, dp, 6u8)
    } else {
        return Ok(());
    };

    let key = SessionKey { src_ip, dst_ip, src_port, dst_port, proto, family };
    
    if let Some(val) = unsafe { ACTIVE_SESSIONS.get_ptr_mut(&key) } {
        unsafe {
            (*val).last_seen = bpf_ktime_get_ns();
            (*val).bytes_count += total_len;
        }
    } else {
        let val = SessionValue {
            last_seen: unsafe { bpf_ktime_get_ns() },
            bytes_count: total_len
        };
        let _ = unsafe { ACTIVE_SESSIONS.insert(&key, &val, 0) };
    }
    
    Ok(())
}

#[kprobe]
pub fn kprobe_execve(ctx: ProbeContext) -> u32 {
    let comm = bpf_get_current_comm().unwrap_or([0; 16]);
    if unsafe { TRUSTED_COMM.get(&comm) }.is_some() {
        return 0;
    }

    let event = SyscallEvent {
        pid: (bpf_get_current_pid_tgid() >> 32) as u32,
        comm,
        syscall_id: 59,
        fd: 0,
        port: 0,
        family: 0,
        ip: [0; 16],
    };
    unsafe { EVENTS.output(&ctx, &event, 0) };
    0
}

#[kprobe]
pub fn kprobe_ptrace(ctx: ProbeContext) -> u32 {
    let comm = bpf_get_current_comm().unwrap_or([0; 16]);
    if unsafe { TRUSTED_COMM.get(&comm) }.is_some() {
        return 0;
    }

    let event = SyscallEvent {
        pid: (bpf_get_current_pid_tgid() >> 32) as u32,
        comm,
        syscall_id: 101,
        fd: 0,
        port: 0,
        family: 0,
        ip: [0; 16],
    };
    unsafe { EVENTS.output(&ctx, &event, 0) };
    0
}

#[kprobe]
pub fn kprobe_mmap(ctx: ProbeContext) -> u32 {
    let prot: u64 = ctx.arg(2).unwrap_or(0);
    if (prot & 0x04) != 0 { // PROT_EXEC
        let event = SyscallEvent {
            pid: (bpf_get_current_pid_tgid() >> 32) as u32,
            comm: bpf_get_current_comm().unwrap_or([0; 16]),
            syscall_id: 9,
            fd: 0,
            port: 0,
            family: 0,
            ip: [0; 16],
        };
        unsafe { EVENTS.output(&ctx, &event, 0) };
    }
    0
}

#[aya_ebpf::macros::lsm]
pub fn sb_mount(_ctx: aya_ebpf::programs::LsmContext) -> i32 {
    let pid = (bpf_get_current_pid_tgid() >> 32) as u32;
    if let Some(policy) = unsafe { ENFORCEMENT_POLICY.get(&pid) } {
        if (*policy & 8) != 0 || (*policy & 1) != 0 {
            return -1; // EPERM
        }
    }
    0
}

#[kprobe]
pub fn kprobe_connect(ctx: ProbeContext) -> u32 {
    let comm = bpf_get_current_comm().unwrap_or([0; 16]);
    if unsafe { TRUSTED_COMM.get(&comm) }.is_some() {
        return 0;
    }

    let event = SyscallEvent {
        pid: (bpf_get_current_pid_tgid() >> 32) as u32,
        comm,
        syscall_id: 42,
        fd: ctx.arg(0).unwrap_or(0),
        port: 0,
        family: 0,
        ip: [0; 16],
    };
    unsafe { EVENTS.output(&ctx, &event, 0) };
    0
}

#[kprobe]
pub fn kprobe_openat(ctx: ProbeContext) -> u32 {
    let comm = bpf_get_current_comm().unwrap_or([0; 16]);
    if unsafe { TRUSTED_COMM.get(&comm) }.is_some() {
        return 0;
    }

    let event = SyscallEvent {
        pid: (bpf_get_current_pid_tgid() >> 32) as u32,
        comm,
        syscall_id: 257,
        fd: 0,
        port: 0,
        family: 0,
        ip: [0; 16],
    };
    unsafe { EVENTS.output(&ctx, &event, 0) };
    0
}

#[aya_ebpf::macros::lsm]
pub fn file_open(_ctx: aya_ebpf::programs::LsmContext) -> i32 {
    let pid = (bpf_get_current_pid_tgid() >> 32) as u32;
    if let Some(policy) = unsafe { ENFORCEMENT_POLICY.get(&pid) } {
        if (*policy & 4) != 0 || (*policy & 1) != 0 {
            return -1; // EPERM
        }

        // Adaptive: If bit 16 is set, check syscall allowlist (e.g. 257 for openat)
        if (*policy & 0x10000) != 0 {
            if unsafe { SYSCALL_ALLOWLIST.get(&SyscallAllowKey { pid, syscall_id: 257 }) }.is_none() &&
               unsafe { SYSCALL_ALLOWLIST.get(&SyscallAllowKey { pid, syscall_id: 2 }) }.is_none() {
                return -1;
            }
        }
    }
    0
}

#[aya_ebpf::macros::lsm]
pub fn socket_connect(_ctx: aya_ebpf::programs::LsmContext) -> i32 {
    let pid = (bpf_get_current_pid_tgid() >> 32) as u32;
    if let Some(policy) = unsafe { ENFORCEMENT_POLICY.get(&pid) } {
        if (*policy & 2) != 0 || (*policy & 1) != 0 {
            return -1; // EPERM
        }

        // Adaptive: If bit 16 is set, check syscall allowlist (42 for connect)
        if (*policy & 0x10000) != 0 {
            if unsafe { SYSCALL_ALLOWLIST.get(&SyscallAllowKey { pid, syscall_id: 42 }) }.is_none() {
                return -1;
            }
        }
    }
    0
}

#[aya_ebpf::macros::lsm]
pub fn bprm_check_security(_ctx: aya_ebpf::programs::LsmContext) -> i32 {
    let pid = (bpf_get_current_pid_tgid() >> 32) as u32;
    if let Some(policy) = unsafe { ENFORCEMENT_POLICY.get(&pid) } {
        if (*policy & 1) != 0 {
            return -1;
        }

        // Adaptive: If bit 16 is set, check syscall allowlist (59 for execve)
        if (*policy & 0x10000) != 0 {
            if unsafe { SYSCALL_ALLOWLIST.get(&SyscallAllowKey { pid, syscall_id: 59 }) }.is_none() {
                return -1;
            }
        }
    }
    0
}

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}
