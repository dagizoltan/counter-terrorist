import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { HoneypotModule } from "@domain/protection/honeypot_service.ts";

export const HoneypotDetailPage = (props: { module: HoneypotModule }) => {
  const islandPaths = [
    '/pages/dashboard/islands/HoneypotChart.js',
    '/components/islands/HoneypotLog.js'
  ];

  return (
    <Layout nonce={props.nonce} title={`${props.module.name} // Forensic Detail`} islandPaths={islandPaths}>
      {/* 1. Unified Page Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>{props.module.name}</h1>
          <span class="subtitle">Port: {props.module.port}</span>
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
              <honeypot-log module-id={props.module.id}></honeypot-log>
           </div>
        </div>
      </div>
    </Layout>
  );
};
