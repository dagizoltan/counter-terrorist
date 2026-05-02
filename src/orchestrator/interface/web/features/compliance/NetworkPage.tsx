import { jsx } from "hono/jsx";
import { Layout } from "../../components/Layout.tsx";

export const NetworkPage = () => {
  return (
    <Layout title="Network Access Logs // Perimeter Audit">
      <div class="mb-12">
        <h1 class="text-4xl font-black tracking-tighter uppercase mb-2 flex items-center gap-4">
          <span class="w-2 h-10 bg-cyber rounded-full"></span>
          NETWORK_ACCESS_LOGS
        </h1>
        <p class="text-slate-500 text-xs font-bold tracking-[0.4em] uppercase ml-6">Granular Traffic Telemetry // Ingress & Egress // Global_Perimeter_Audit</p>
      </div>

      <div class="mb-12">
        <h2 class="text-[11px] font-black uppercase tracking-[0.5em] text-slate-500 mb-6 flex items-center gap-3">
          <span class="w-8 h-px bg-slate-800"></span>
          01_PERIMETER_TRAFFIC_TELEMETRY
        </h2>
        <div class="glass-panel overflow-hidden rounded-3xl border border-white/5 bg-black/40 group hover:border-white/10 transition-all shadow-2xl">
           <div class="overflow-x-auto custom-scrollbar">
              <table class="w-full text-left border-collapse">
                 <thead class="bg-white/5 border-b border-white/10">
                    <tr>
                       <th class="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Timestamp</th>
                       <th class="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Direction</th>
                       <th class="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Source</th>
                       <th class="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Destination</th>
                       <th class="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Protocol</th>
                       <th class="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Action</th>
                    </tr>
                 </thead>
                 <tbody id="network-logs-body">
                    <tr class="animate-pulse">
                       <td colspan="6" class="px-8 py-20 text-center text-[11px] font-black text-slate-600 uppercase tracking-widest italic opacity-50">
                          Accessing_Network_Forensic_Buffer...
                       </td>
                    </tr>
                 </tbody>
              </table>
           </div>
           <div class="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyber/20 to-transparent"></div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        async function loadNetworkLogs() {
          const res = await fetch('/api/compliance/network');
          const logs = await res.json();
          const body = document.getElementById('network-logs-body');
          
          if (logs.length === 0) {
            body.innerHTML = '<tr><td colspan="6" class="px-8 py-20 text-center text-[11px] font-black text-slate-600 uppercase tracking-widest italic opacity-50">No network traffic events recorded.</td></tr>';
            return;
          }

          body.innerHTML = logs.map(l => \`
            <tr class="border-b border-white/5 hover:bg-white/[0.03] transition-all group/row">
              <td class="px-8 py-5 font-mono text-[11px] text-slate-500 group-hover/row:text-slate-300 transition-colors">\${new Date(l.timestamp).toLocaleTimeString()}</td>
              <td class="px-8 py-5">
                 <span class="px-3 py-1 rounded-full border \${l.direction === 'INBOUND' ? 'bg-cyber/10 border-cyber/30 text-cyber' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'} text-[9px] font-black uppercase tracking-widest shadow-inner shadow-black/20">\${l.direction}</span>
              </td>
              <td class="px-8 py-5 font-mono text-[11px] text-white/80 tracking-tight">\${l.source}</td>
              <td class="px-8 py-5 font-mono text-[11px] text-white/80 tracking-tight">\${l.destination}</td>
              <td class="px-8 py-5 font-mono text-[11px] text-slate-500 uppercase tracking-widest">\${l.protocol}</td>
              <td class="px-8 py-5">
                 <span class="px-3 py-1 rounded-full border \${l.action === 'BLOCK' ? 'bg-danger/10 border-danger/30 text-danger' : 'bg-success/10 border-success/30 text-success'} text-[9px] font-black uppercase tracking-widest shadow-inner shadow-black/20">\${l.action}</span>
              </td>
            </tr>
          \`).join('');
        }
        loadNetworkLogs();
        setInterval(loadNetworkLogs, 10000);
      ` }} />
    </Layout>
  );
};
