import { jsx } from "hono/jsx";
import { Layout } from "../../components/Layout.tsx";

export const AuditPage = () => {
  return (
    <Layout title="Compliance Audit Ledger // Chain of Custody">
      <div class="p-12">
        <div class="flex justify-between items-start mb-12">
          <div>
            <h1 class="text-3xl font-black tracking-widest uppercase mb-2">Audit_Ledger</h1>
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">Immutable Hash-Chained Event History // Forensic Integrity</p>
          </div>
          <div class="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
             <div class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4" id="audit-events">
           <div class="glass-panel p-8 rounded-2xl animate-pulse text-center text-slate-500 font-black uppercase text-[10px] tracking-widest">
              Verifying Cryptographic Chain...
           </div>
        </div>

        <script dangerouslySetInnerHTML={{ __html: `
          async function loadAudit() {
            const res = await fetch('/api/compliance/audit');
            const events = await res.json();
            const container = document.getElementById('audit-events');
            
            if (events.length === 0) {
              container.innerHTML = '<div class="glass-panel p-12 rounded-2xl text-center text-slate-500 font-black uppercase text-[10px] tracking-widest border border-white/5">Audit ledger is empty. Chain awaiting first event.</div>';
              return;
            }

            container.innerHTML = events.map(e => \`
              <div class="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col hover:border-emerald-500/20 transition-all">
                <div class="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                   <div class="flex items-center gap-4">
                      <span class="px-2 py-0.5 rounded bg-slate-800 text-[8px] font-black \${e.type === 'THREAT' || e.type === 'CRITICAL' ? 'text-danger' : 'text-slate-400'} uppercase tracking-widest">\${e.type}</span>
                      <span class="text-[10px] font-bold text-white tracking-wide uppercase">\${e.message}</span>
                   </div>
                   <span class="text-[9px] font-bold text-slate-600 uppercase tracking-widest">\${new Date(e.timestamp).toLocaleString()}</span>
                </div>
                <div class="flex items-center justify-between">
                   <div class="flex gap-4">
                      <div class="flex flex-col">
                         <span class="text-[7px] font-black text-slate-600 uppercase tracking-widest">Event_Hash</span>
                         <span class="font-mono text-[9px] text-slate-500">\${e.hash.slice(0, 32)}…</span>
                      </div>
                      <div class="flex flex-col">
                         <span class="text-[7px] font-black text-slate-600 uppercase tracking-widest">Parent_Link</span>
                         <span class="font-mono text-[9px] text-slate-500">\${e.prevHash.slice(0, 32)}…</span>
                      </div>
                   </div>
                   \${e.hwSignature ? \`
                   <div class="flex items-center gap-2 px-3 py-1 rounded bg-emerald-500/5 border border-emerald-500/10">
                      <span class="text-[7px] font-black text-emerald-500 uppercase tracking-widest">TPM_SIGNED</span>
                   </div>
                   \` : ''}
                </div>
              </div>
            \`).join('');
          }
          loadAudit();
        ` }} />
      </div>
    </Layout>
  );
};
