import { jsx } from "hono/jsx";
import { Layout } from "../../components/Layout.tsx";

export const NetworkPage = () => {
  return (
    <Layout title="Network Access Logs // Perimeter Audit">
      <div class="p-12">
        <div class="mb-12">
          <h1 class="text-3xl font-black tracking-widest uppercase mb-2">Network_Access_Logs</h1>
          <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">Granular Traffic Telemetry // Ingress & Egress</p>
        </div>

        <div class="glass-panel overflow-hidden rounded-2xl border border-white/5">
           <table class="w-full text-left">
              <thead class="bg-white/5 border-b border-white/5">
                 <tr>
                    <th class="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Timestamp</th>
                    <th class="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Direction</th>
                    <th class="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Source</th>
                    <th class="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Destination</th>
                    <th class="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Protocol</th>
                    <th class="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Action</th>
                 </tr>
              </thead>
              <tbody id="network-logs-body">
                 <tr class="animate-pulse">
                    <td colspan="6" class="px-6 py-12 text-center text-[10px] font-black text-slate-600 uppercase tracking-widest">
                       Accessing Network Forensic Buffer...
                    </td>
                 </tr>
              </tbody>
           </table>
        </div>

        <script dangerouslySetInnerHTML={{ __html: `
          async function loadNetworkLogs() {
            const res = await fetch('/api/compliance/network');
            const logs = await res.json();
            const body = document.getElementById('network-logs-body');
            
            if (logs.length === 0) {
              body.innerHTML = '<tr><td colspan="6" class="px-6 py-12 text-center text-[10px] font-black text-slate-600 uppercase tracking-widest">No network traffic events recorded.</td></tr>';
              return;
            }

            body.innerHTML = logs.map(l => \`
              <tr class="border-b border-white/5 hover:bg-white/2 transition-colors">
                <td class="px-6 py-4 font-mono text-[10px] text-slate-400">\${new Date(l.timestamp).toLocaleTimeString()}</td>
                <td class="px-6 py-4">
                   <span class="px-2 py-0.5 rounded bg-slate-800 text-[8px] font-black \${l.direction === 'INBOUND' ? 'text-cyber' : 'text-emerald-500'} uppercase tracking-widest">\${l.direction}</span>
                </td>
                <td class="px-6 py-4 font-mono text-[10px] text-white">\${l.source}</td>
                <td class="px-6 py-4 font-mono text-[10px] text-white">\${l.destination}</td>
                <td class="px-6 py-4 font-mono text-[10px] text-slate-400">\${l.protocol}</td>
                <td class="px-6 py-4">
                   <span class="px-2 py-0.5 rounded bg-slate-800 text-[8px] font-black \${l.action === 'BLOCK' ? 'text-danger' : 'text-success'} uppercase tracking-widest">\${l.action}</span>
                </td>
              </tr>
            \`).join('');
          }
          loadNetworkLogs();
          setInterval(loadNetworkLogs, 10000);
        ` }} />
      </div>
    </Layout>
  );
};
