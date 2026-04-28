#![no_std]
#![no_main]

use aya_ebpf::{
    macros::{kprobe, map},
    maps::PerfEventArray,
    programs::ProbeContext,
    helpers::bpf_get_current_pid_tgid,
    helpers::bpf_get_current_comm,
};
use ebpf_common::SyscallEvent;

#[map]
static mut EVENTS: PerfEventArray<SyscallEvent> = PerfEventArray::new(0);

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
