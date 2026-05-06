#![no_std]
#![no_main]

use aya_ebpf::{
    macros::{kprobe, map, classifier, xdp},
    maps::{PerfEventArray, HashMap},
    programs::{ProbeContext, TcContext, XdpContext},
    helpers::{bpf_get_current_pid_tgid, bpf_get_current_comm, bpf_ktime_get_ns},
};

use ebpf_common::{SyscallEvent, ShadowBanInfo, SessionKey, SessionValue};
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

#[xdp]
pub fn xdp_ingress(ctx: XdpContext) -> u32 {
    match try_xdp_ingress(ctx) {
        Ok(ret) => ret,
        Err(_) => XDP_PASS,
    }
}

fn try_xdp_ingress(ctx: XdpContext) -> Result<u32, ()> {
    let eth_proto = u16::from_be(ctx.load::<u16>(12).map_err(|_| ())?);
    if eth_proto != 0x0800 { return Ok(XDP_PASS); }

    let src_ip: u32 = ctx.load(26).map_err(|_| ())?;
    let dst_ip: u32 = ctx.load(30).map_err(|_| ())?;
    let proto: u8 = ctx.load(23).map_err(|_| ())?;

    let (src_port, dst_port) = if proto == 6 || proto == 17 {
        (ctx.load::<u16>(34).map_err(|_| ())?, ctx.load::<u16>(36).map_err(|_| ())?)
    } else { (0, 0) };

    // STATEFUL CHECK: Look for reversed tuple (Since this is ingress, we match an egress session)
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

    // Pass public orchestrator ports
    if u16::from_be(dst_port) == 8001 {
        return Ok(XDP_PASS);
    }

    Ok(XDP_DROP)
}

#[classifier]
pub fn tc_egress(ctx: TcContext) -> i32 {
    let _ = try_tc_egress(ctx);
    TC_ACT_OK
}

fn try_tc_egress(ctx: TcContext) -> Result<(), ()> {
    let eth_proto = u16::from_be(ctx.load::<u16>(12).map_err(|_| ())?);
    if eth_proto != 0x0800 { return Ok(()); }

    let src_ip: u32 = ctx.load(26).map_err(|_| ())?;
    let dst_ip: u32 = ctx.load(30).map_err(|_| ())?;
    let proto: u8 = ctx.load(23).map_err(|_| ())?;

    let (src_port, dst_port) = if proto == 6 || proto == 17 {
        (ctx.load::<u16>(34).map_err(|_| ())?, ctx.load::<u16>(36).map_err(|_| ())?)
    } else { (0, 0) };

    let key = SessionKey { src_ip, dst_ip, src_port, dst_port, proto };
    let val = SessionValue { last_seen: unsafe { bpf_ktime_get_ns() }, bytes_count: 0 };
    
    let _ = unsafe { ACTIVE_SESSIONS.insert(&key, &val, 0) };
    
    Ok(())
}

#[kprobe]
pub fn kprobe_ptrace(ctx: ProbeContext) -> u32 {
    let mut event = SyscallEvent {
        pid: (bpf_get_current_pid_tgid() >> 32) as u32,
        comm: bpf_get_current_comm().unwrap_or([0; 16]),
        syscall_id: 101,
    };
    unsafe { EVENTS.output(&ctx, &event, 0) };
    0
}

#[kprobe]
pub fn kprobe_mmap(ctx: ProbeContext) -> u32 {
    let prot: u64 = ctx.arg(2).unwrap_or(0);
    if (prot & 0x04) != 0 { // PROT_EXEC
        let mut event = SyscallEvent {
            pid: (bpf_get_current_pid_tgid() >> 32) as u32,
            comm: bpf_get_current_comm().unwrap_or([0; 16]),
            syscall_id: 9,
        };
        unsafe { EVENTS.output(&ctx, &event, 0) };
    }
    0
}

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}
