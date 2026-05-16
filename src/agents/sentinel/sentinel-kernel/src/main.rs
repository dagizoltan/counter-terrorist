#![no_std]
#![no_main]

use aya_ebpf::{
    macros::{kprobe, map, classifier, xdp},
    maps::{PerfEventArray, HashMap},
    programs::{ProbeContext, TcContext, XdpContext},
    helpers::{bpf_get_current_pid_tgid, bpf_get_current_comm, bpf_ktime_get_ns},
};

use sentinel_common::{SyscallEvent, ShadowBanInfo, SessionKey, SessionValue};
use core::mem;

const TC_ACT_OK: i32 = 0;
const TC_ACT_SHOT: i32 = 2;

const XDP_PASS: u32 = 2;
const XDP_DROP: u32 = 1;

#[map]
static mut EVENTS: PerfEventArray<SyscallEvent> = PerfEventArray::new(0);

#[map]
static mut SHADOW_BANS: HashMap<u32, ShadowBanInfo> = HashMap::with_max_entries(1024, 0);

#[map]
static mut HIDE_CONFIG: HashMap<u32, u8> = HashMap::with_max_entries(1024, 0);

#[map]
static mut ACTIVE_SESSIONS: HashMap<SessionKey, SessionValue> = HashMap::with_max_entries(4096, 0);

#[map]
static mut TRUSTED_COMM: HashMap<[u8; 16], u8> = HashMap::with_max_entries(1024, 0);

#[map]
static mut XDP_BLOCK_LIST: HashMap<u32, u32> = HashMap::with_max_entries(1024, 0);

#[map]
static mut ALLOWED_PORTS: HashMap<u16, u8> = HashMap::with_max_entries(1024, 0);

#[map]
static mut FIREWALL_CONFIG: HashMap<u32, u32> = HashMap::with_max_entries(8, 0); // [0] = lockdown

#[map]
static mut ENFORCEMENT_POLICY: HashMap<u32, u32> = HashMap::with_max_entries(1024, 0); // Key: PID, Value: Policy flags (1=BlockAll, 2=NetBlock, 4=FileBlock, 8=MountBlock)

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
    if eth_proto != 0x0800 { return Ok(XDP_PASS); }

    let src_ip: u32 = load(ctx, 26)?;
    let dst_ip: u32 = load(ctx, 30)?;
    let proto: u8 = load(ctx, 23)?;

    let (src_port, dst_port) = if proto == 6 || proto == 17 {
        (load::<u16>(ctx, 34)?, load::<u16>(ctx, 36)?)
    } else { (0, 0) };

    // 1. GLOBAL LOCKDOWN CHECK
    if let Some(lockdown) = unsafe { FIREWALL_CONFIG.get(&0) } {
        if *lockdown == 1 {
            // Even in lockdown, we might want to allow some traffic? 
            // For now, absolute deny unless it's an active session from us.
            let key = SessionKey { src_ip: dst_ip, dst_ip: src_ip, src_port: dst_port, dst_port: src_port, proto };
            if unsafe { ACTIVE_SESSIONS.get(&key) }.is_some() {
                return Ok(XDP_PASS);
            }
            return Ok(XDP_DROP);
        }
    }

    // 2. EXPLICIT BLOCK LIST CHECK
    if unsafe { XDP_BLOCK_LIST.get(&src_ip) }.is_some() {
        return Ok(XDP_DROP);
    }

    // 3. STATEFUL CHECK: Look for reversed tuple
    let key = SessionKey {
        src_ip: dst_ip,
        dst_ip: src_ip,
        src_port: dst_port,
        dst_port: src_port,
        proto,
    };

    if unsafe { ACTIVE_SESSIONS.get(&key) }.is_some() {
        return Ok(XDP_PASS);
    }

    // 4. ALLOWED PORTS CHECK
    let dport_host = u16::from_be(dst_port);

    // BUG-18: Fail-safe management ports to prevent lockout
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
    if eth_proto != 0x0800 { return Ok(()); }

    let src_ip: u32 = load_tc(ctx, 26)?;
    let dst_ip: u32 = load_tc(ctx, 30)?;
    let proto: u8 = load_tc(ctx, 23)?;
    let total_len: u16 = u16::from_be(load_tc(ctx, 16)?); // IP Total Length

    let (src_port, dst_port) = if proto == 6 || proto == 17 {
        (load_tc::<u16>(ctx, 34)?, load_tc::<u16>(ctx, 36)?)
    } else { (0, 0) };

    let key = SessionKey { src_ip, dst_ip, src_port, dst_port, proto };
    
    // EXFILTRATION DETECTION: Update volume metrics per session
    if let Some(val) = unsafe { ACTIVE_SESSIONS.get_ptr_mut(&key) } {
        unsafe {
            (*val).last_seen = bpf_ktime_get_ns();
            (*val).bytes_count += total_len as u64;
        }
    } else {
        let val = SessionValue {
            last_seen: unsafe { bpf_ktime_get_ns() },
            bytes_count: total_len as u64
        };
        let _ = unsafe { ACTIVE_SESSIONS.insert(&key, &val, 0) };
    }
    
    Ok(())
}

#[kprobe]
pub fn kprobe_execve(ctx: ProbeContext) -> u32 {
    let comm = bpf_get_current_comm().unwrap_or([0; 16]);
    
    // In-Kernel Filtering: Skip events from known trusted processes (e.g., orchestrator, sidecars)
    if unsafe { TRUSTED_COMM.get(&comm) }.is_some() {
        return 0;
    }

    let event = SyscallEvent {
        pid: (bpf_get_current_pid_tgid() >> 32) as u32,
        comm,
        syscall_id: 59,
        fd: 0,
        port: 0,
        ip: 0,
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
        comm, // BUG-21: Reuse comm instead of calling bpf_get_current_comm() again
        syscall_id: 101,
        fd: 0,
        port: 0,
        ip: 0,
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
            ip: 0,
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
        ip: 0,
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
        ip: 0,
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
    }
    0
}

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}
