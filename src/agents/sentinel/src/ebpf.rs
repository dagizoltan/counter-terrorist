use aya::Bpf;
use aya::programs::{KProbe, SchedClassifier, TcAttachType, Lsm};
use aya::Btf;

pub fn attach_tc(bpf: &mut Bpf, iface: &str) -> Result<(), anyhow::Error> {
    if let Some(prog) = bpf.program_mut("tc_ingress") {
        if let Ok(tc_prog) = <&mut SchedClassifier>::try_from(prog) {
            let _ = tc_prog.load();
            let _ = tc_prog.attach(iface, TcAttachType::Ingress);
        }
    }
    Ok(())
}

pub fn attach_kprobes(bpf: &mut Bpf) -> Result<(), anyhow::Error> {
    for (name, func) in [
        ("kprobe_ptrace", "sys_ptrace"),
        ("kprobe_mmap", "sys_mmap"),
        ("kprobe_execve", "sys_execve"),
        ("kprobe_connect", "sys_connect"),
        ("kprobe_openat", "sys_openat")
    ] {
        if let Some(prog) = bpf.program_mut(name) {
            if let Ok(p) = <&mut KProbe>::try_from(prog) {
                let _ = p.load();
                let _ = p.attach(func, 0).or_else(|_| p.attach(format!("__x64_{}", func), 0));
            }
        }
    }
    Ok(())
}

pub fn attach_lsm(bpf: &mut Bpf) -> Result<(), anyhow::Error> {
    let btf = Btf::from_sys_fs().ok();
    if let Some(btf) = &btf {
        for name in ["file_open", "socket_connect", "sb_mount", "bprm_check_security"] {
            if let Some(prog) = bpf.program_mut(name) {
                if let Ok(lsm_prog) = <&mut Lsm>::try_from(prog) {
                    if lsm_prog.load(name, btf).is_ok() {
                        let _ = lsm_prog.attach();
                    }
                }
            }
        }
    }
    Ok(())
}
