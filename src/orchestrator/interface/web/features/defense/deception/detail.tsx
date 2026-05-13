import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { HoneypotModule } from "@domain/protection/honeypot_service.ts";

export const HoneypotDetailPage = (props: { module: HoneypotModule }) => {
  const islandPaths = ['/pages/dashboard/islands/HoneypotChart.js'];

  return (
    <Layout nonce={props.nonce} title={`${props.module.name} // Forensic Detail`} islandPaths={islandPaths}>
      {/* 1. Unified Page Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>{props.module.name}</h1>
          <span class="subtitle">Honeypot Node: {props.module.id} // Port: {props.module.port}</span>
        </div>
        <div class="flex gap-4">
          <button class="t-btn px-6 py-3 text-[9px]">Download Logs</button>
          <button class="t-btn px-6 py-3 text-[9px] border-slate-800">Reset Metrics</button>
        </div>
      </header>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* STATS GRID */}
        <div class="lg:col-span-1 space-y-8">
          <div class="bg-white/5 border border-white/5 p-8">
            <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6">Interaction Latency</h3>
            <div class="text-3xl font-black mb-2">12ms</div>
            <p class="text-[9px] text-slate-500 font-bold uppercase">Real-time response time</p>
          </div>
          <div class="bg-white/5 border border-white/5 p-8">
            <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6">Unique Attackers</h3>
            <div class="text-3xl font-black mb-2">84</div>
            <p class="text-[9px] text-slate-500 font-bold uppercase">Last 24 hours</p>
          </div>
        </div>

        {/* CHART */}
        <div class="lg:col-span-2 bg-white/5 border border-white/5 p-8">
          <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-8 pb-4 border-b border-white/5">Traffic Analysis // {props.module.id.toUpperCase()}</h3>
          <div class="h-64">
             <honeypot-chart id="detail-chart"></honeypot-chart>
          </div>
        </div>

        {/* EVENT STREAM */}
        <div class="lg:col-span-3 bg-white/5 border border-white/5">
           <div class="p-8 pb-4 border-b border-white/5">
              <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500">Forensic Event Pipeline</h3>
           </div>
           <div class="p-8">
              <div class="space-y-4 font-mono text-[10px]">
                 <div class="flex gap-4 text-slate-500">
                    <span class="text-white font-bold">[12:44:01]</span>
                    <span class="text-red-500 uppercase font-black">Connection</span>
                    <span>192.168.1.100 initiated handshake on port {props.module.port}</span>
                 </div>
                 <div class="flex gap-4 text-slate-500">
                    <span class="text-white font-bold">[12:44:03]</span>
                    <span class="text-yellow-500 uppercase font-black">Payload</span>
                    <span>Received SSH-2.0-libssh_0.8.1 banner</span>
                 </div>
                 <div class="flex gap-4 text-slate-500">
                    <span class="text-white font-bold">[12:44:05]</span>
                    <span class="text-green-500 uppercase font-black">Blocked</span>
                    <span>IP quarantined by Firewall Engine</span>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </Layout>
  );
};
