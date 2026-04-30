/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "../../Layout.tsx";

export const EbpfPage = () => (
  <Layout title="Kernel eBPF Observability">
    <div class="mb-12">
      <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Kernel Observability</h2>
      <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Deep syscall tracking // eBPF bytecode hooks</p>
    </div>
    <div class="bg-black/80 border border-white/5 font-mono text-[11px] p-8 h-[600px] overflow-y-auto space-y-1 text-slate-400">
       <p class="text-green-500 font-bold mb-4">--- EBPF KPROBE STREAM START ---</p>
       <p><span class="text-slate-600">[12:10:01]</span> PID: 1244 [systemd] CALL: execve("/usr/bin/python3")</p>
       <p><span class="text-slate-600">[12:10:05]</span> PID: 9928 [nginx] CALL: listen(0.0.0.0:80)</p>
       <p><span class="text-slate-600">[12:10:08]</span> PID: 4331 [bash] CALL: ptrace(PTRACE_ATTACH, 1002)</p>
       <p class="text-red-500 font-black">!!! ALERT: PID 4331 (bash) ATTEMPTED PTRACE ATTACH TO CRITICAL PROCESS !!!</p>
       <p><span class="text-slate-600">[12:10:12]</span> PID: 1244 [systemd] CALL: mmap(PROT_EXEC | PROT_WRITE)</p>
       <p><span class="text-slate-600">[12:10:15]</span> PID: 8821 [sshd] CALL: setuid(0)</p>
    </div>
  </Layout>
);

export const FimPage = () => (
  <Layout title="File Integrity Monitoring">
    <div class="mb-12">
      <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Integrity Sentinel</h2>
      <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Real-time inode watching // SHA-256 verification</p>
    </div>
    <div class="space-y-4">
       {[
         { file: '/etc/shadow', event: 'READ', user: 'root', time: '10s ago', severity: 'WARN' },
         { file: '/etc/nginx/nginx.conf', event: 'MODIFY', user: 'dagizoltan', time: '1m ago', severity: 'INFO' },
         { file: '/usr/bin/sudo', event: 'EXEC', user: 'root', time: '5m ago', severity: 'INFO' },
         { file: '/etc/passwd', event: 'ATTEMPTED_WRITE', user: 'guest', time: 'JUST NOW', severity: 'CRITICAL' },
       ].map(ev => (
         <div class="bg-white/5 border border-white/5 p-6 flex justify-between items-center">
            <div class="flex items-center gap-6">
               <div class={`w-1 h-12 ${ev.severity === 'CRITICAL' ? 'bg-red-600' : 'bg-slate-700'}`}></div>
               <div>
                  <h3 class="text-lg font-black uppercase font-mono">{ev.file}</h3>
                  <p class="text-[9px] text-slate-500 font-bold uppercase">{ev.event} by {ev.user} // {ev.time}</p>
               </div>
            </div>
            <span class={`px-3 py-1 text-[9px] font-black uppercase ${ev.severity === 'CRITICAL' ? 'bg-red-600 text-white' : 'text-slate-500 border border-white/10'}`}>{ev.severity}</span>
         </div>
       ))}
    </div>
  </Layout>
);
