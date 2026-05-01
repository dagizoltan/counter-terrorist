import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const AuditPage = () => {
  return (
    <Layout title="Audit Log">
      <div class="mb-12">
        <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Immutable Audit History</h2>
        <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Tamper-Evident Forensic Records // Kernel & Network Events</p>
      </div>

      <div class="bg-white/5 border border-white/5 overflow-hidden">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-white/5 border-b border-white/5">
              <th class="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Timestamp</th>
              <th class="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Event_Type</th>
              <th class="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Description</th>
              <th class="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Hash_Chain</th>
            </tr>
          </thead>
          <tbody class="text-[11px] font-medium text-slate-300">
            <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-all">
              <td class="p-6 font-mono text-slate-500">2026-04-30 11:13:45</td>
              <td class="p-6"><span class="px-2 py-1 bg-red-600/20 text-red-500 font-bold uppercase text-[9px]">Critical</span></td>
              <td class="p-6 font-mono">SYSCALL_PTRACE detected on process: systemd</td>
              <td class="p-6 text-slate-600 font-mono">0x44a...2f1</td>
            </tr>
             <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-all">
              <td class="p-6 font-mono text-slate-500">2026-04-30 11:10:12</td>
              <td class="p-6"><span class="px-2 py-1 bg-blue-600/20 text-blue-500 font-bold uppercase text-[9px]">Info</span></td>
              <td class="p-6 font-mono">Sidecar: honeypot synchronized successfully</td>
              <td class="p-6 text-slate-600 font-mono">0x91b...c74</td>
            </tr>
          </tbody>
        </table>
        <div class="p-8 text-center bg-black/40">
           <button class="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all">Load More Forensic Records</button>
        </div>
      </div>
    </Layout>
  );
};
