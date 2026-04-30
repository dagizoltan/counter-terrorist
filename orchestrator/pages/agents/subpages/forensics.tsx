/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "../../Layout.tsx";

export const EbpfPage = () => (
  <Layout title="Kernel eBPF Observability" islandPaths={['/pages/dashboard/islands/BlockingLog.js']}>
    <div class="mb-12">
      <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Kernel Observability</h2>
      <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Deep syscall tracking // eBPF bytecode hooks</p>
    </div>
    <div class="bg-white/5 border border-white/5 p-6 mb-8 flex items-center gap-4">
       <div id="ebpf-status-dot" class="w-3 h-3 bg-slate-600 rounded-full"></div>
       <span id="ebpf-status-text" class="text-[10px] font-black uppercase tracking-widest text-slate-500">Checking eBPF sidecar status...</span>
    </div>
    <div class="bg-black/80 border border-white/5 font-mono text-[11px] p-0 h-[600px] overflow-hidden">
       <p class="text-green-500 font-bold p-4 border-b border-white/5">--- LIVE SYSCALL EVENT STREAM ---</p>
       <blocking-log id="ebpf-log"></blocking-log>
    </div>
  </Layout>
);

export const FimPage = () => (
  <Layout title="File Integrity Monitoring" islandPaths={['/pages/dashboard/islands/BlockingLog.js']}>
    <div class="mb-12">
      <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Integrity Sentinel</h2>
      <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Real-time inode watching // SHA-256 verification</p>
    </div>
    <div class="bg-white/5 border border-white/5 p-6 mb-8 flex items-center gap-4">
       <div id="fim-status-dot" class="w-3 h-3 bg-slate-600 rounded-full"></div>
       <span id="fim-status-text" class="text-[10px] font-black uppercase tracking-widest text-slate-500">Checking FIM sidecar status...</span>
    </div>
    <div class="bg-black/80 border border-white/5 font-mono text-[11px] p-0 h-[600px] overflow-hidden">
       <p class="text-green-500 font-bold p-4 border-b border-white/5">--- LIVE FILE INTEGRITY EVENT STREAM ---</p>
       <blocking-log id="fim-log"></blocking-log>
    </div>
  </Layout>
);
