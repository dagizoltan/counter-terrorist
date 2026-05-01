#![no_std]
#![no_main]

use aya_ebpf::{
    macros::{kprobe, map, classifier, lsm},
    maps::{PerfEventArray, HashMap},
    programs::{ProbeContext, TcContext, LsmContext},
    helpers::{bpf_get_current_pid_tgid, bpf_get_current_comm, bpf_ktime_get_ns},
};

// ... (other code)

#[lsm]
pub fn file_open(ctx: LsmContext) -> i32 {
    let comm = bpf_get_current_comm().unwrap_or([0; 16]);
    let comm_str = core::str::from_utf8(&comm).unwrap_or("");

    // Simple policy: If filename contains ".env" and comm is NOT "deno", block.
    // In a real LSM, we'd inspect the path in ctx.
    // For this prototype, we demonstrate the hook logic.
    
    0 // Allow by default
}
use ebpf_common::{SyscallEvent, ShadowBanInfo};
use core::mem;

const TC_ACT_OK: i32 = 0;
const TC_ACT_SHOT: i32 = 2;

#[map]
static mut EVENTS: PerfEventArray<SyscallEvent> = PerfEventArray::new(0);

#[map]
static mut SHADOW_BANS: HashMap<u32, ShadowBanInfo> = HashMap::with_max_entries(1024, 0);

#[classifier]
pub fn tc_ingress(ctx: TcContext) -> i32 {
    match try_tc_ingress(ctx) {
        Ok(ret) => ret,
        Err(_) => TC_ACT_OK,
    }
}

fn try_tc_ingress(ctx: TcContext) -> Result<i32, ()> {
    let eth_proto = u16::from_be(ctx.load::<u16>(12).map_err(|_| ())?);
    if eth_proto != 0x0800 { // ETH_P_IP
        return Ok(TC_ACT_OK);
    }

    // Load source IP (offset: eth(14) + ip_src(12) = 26)
    let src_ip: u32 = ctx.load(26).map_err(|_| ())?;

    if let Some(info) = unsafe { SHADOW_BANS.get_ptr_mut(&src_ip) } {
        let now = unsafe { bpf_ktime_get_ns() };
        let sec = now / 1_000_000_000;
        
        let info_ref = unsafe { &mut *info };
        
        if info_ref.last_timestamp == sec {
            // Limit to ~10 packets per second (approx 1KB/s)
            if info_ref.bytes_this_second > 10 {
                return Ok(TC_ACT_SHOT);
            }
            info_ref.bytes_this_second += 1;
        } else {
            info_ref.last_timestamp = sec;
            info_ref.bytes_this_second = 0;
        }
    }

    Ok(TC_ACT_OK)
}

macro_rules! offset_of {
    ($type:ty, $field:ident) => {
        unsafe { &(*(0 as *const $type)).$field as *const _ as usize }
    };
}

#[repr(C)]
struct ethhdr {
    h_dest: [u8; 6],
    h_source: [u8; 6],
    h_proto: u16,
}

// Required for mmap flags check
const PROT_EXEC: u64 = 0x04;

#[kprobe]
pub fn kprobe_ptrace(ctx: ProbeContext) -> u32 {
    let mut event = SyscallEvent {
        pid: (bpf_get_current_pid_tgid() >> 32) as u32,
        comm: bpf_get_current_comm().unwrap_or([0; 16]),
        syscall_id: 1,
    };
    unsafe { EVENTS.output(&ctx, &event, 0) };
    0
}

#[kprobe]
pub fn kprobe_mmap(ctx: ProbeContext) -> u32 {
    // Prot is usually the third argument (arg2)
    // For x86_64: rdi (arg0), rsi (arg1), rdx (arg2), rcx (arg3), r8 (arg4), r9 (arg5)
    let prot: u64 = ctx.arg(2).unwrap_or(0);

    if (prot & PROT_EXEC) != 0 {
        let mut event = SyscallEvent {
            pid: (bpf_get_current_pid_tgid() >> 32) as u32,
            comm: bpf_get_current_comm().unwrap_or([0; 16]),
            syscall_id: 2,
        };
        unsafe { EVENTS.output(&ctx, &event, 0) };
    }
    0
}

#[kprobe]
pub fn kprobe_execve(ctx: ProbeContext) -> u32 {
    let mut event = SyscallEvent {
        pid: (bpf_get_current_pid_tgid() >> 32) as u32,
        comm: bpf_get_current_comm().unwrap_or([0; 16]),
        syscall_id: 3,
    };
    unsafe { EVENTS.output(&ctx, &event, 0) };
    0
}

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}
