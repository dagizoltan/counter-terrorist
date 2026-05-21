import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { TacticalHeader, TacticalPanel, StatusPill, TacticalSectionTitle } from "@interface/components/Tactical.tsx";

/**
 * Mission Dashboard // Sovereign Overwatch
 * Primary strategic command interface.
 * Refined for high-readability and zero-underscore policy.
 */
export const Dashboard = (props: { status: any; csrfToken: string; nonce?: string; hostname?: string; userRole?: string }) => {
  const { platform } = props.status;

  const islandPaths = [
    '/components/islands/NetworkMap.js',
    '/components/islands/HoneypotChart.js',
    '/components/islands/NewsFeed.js',
    '/components/islands/BlockingLog.js'
  ];

  return (
    <Layout title="System Overview // Sovereign Overwatch" islandPaths={islandPaths} csrfToken={props.csrfToken} nonce={props.nonce} hostname={props.hostname} userRole={props.userRole}>
      {/* 01 Unified Page Header */}
      <TacticalHeader
        title="Operational Overview"
        subtitle={`Operational State: Active // Node: ${platform?.hostname || "localhost"}`}
      >
        <a href="/forensics/compliance" class="t-btn px-8 py-4 bg-primary/10 border-primary/20 text-primary hover:bg-primary/20 group transition-all">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Governance
        </a>
        {props.userRole === "admin" && (
        <button class="t-btn px-8 py-4 group hover:scale-105 transition-transform">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="group-hover:rotate-180 transition-transform duration-500"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Force Sweep
        </button>
        )}
      </TacticalHeader>

      {/* ── Phase 01: Overwatch (Strategic Core) ────────────────────────── */}
      <section class="mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <TacticalSectionTitle label="Strategic Core Telemetry" />

        <div class="grid grid-cols-12 gap-6">
          <TacticalPanel class="col-span-12 lg:col-span-3 group hover:bg-white/[0.02] transition-all" paddings="p-10">
            <div class="flex justify-between items-center mb-10">
              <span class="mono-xs font-black text-slate-400 uppercase tracking-widest">System Integrity</span>
              <StatusPill
                status={props.status.audit?.hardwareVerified ? 'success' : 'warning'}
                label={props.status.audit?.hardwareVerified ? 'HARDWARE' : 'SOFTWARE'}
                class="!px-4 !py-1 text-[8px]"
              />
            </div>
            <div class="flex items-baseline gap-5">
              <span class="text-6xl font-black italic tracking-tighter text-white tabular-nums" id="stat-audit-score-large">{props.status.audit?.integrityScore || 100}<span class="text-success">%</span></span>
              <span class="mono-xs text-slate-500 font-bold uppercase tracking-widest">Trust</span>
            </div>
          </TacticalPanel>

          <TacticalPanel class="col-span-12 lg:col-span-3 group hover:bg-white/[0.02] transition-all" paddings="p-10">
            <div class="flex justify-between items-center mb-10">
               <span class="mono-xs font-black text-slate-400 uppercase tracking-widest">Load Factor</span>
               <span class="mono-xs text-success font-black uppercase tracking-widest" id="stat-node-status">{props.status.node?.uptime || 'Active'}</span>
            </div>
            <div class="flex items-baseline gap-5">
              <span class="text-6xl font-black italic tracking-tighter text-white tabular-nums" id="stat-cpu-load-large">{props.status.node?.cpu?.load || 0}<span class="text-warning">%</span></span>
              <span class="mono-xs text-slate-500 font-bold uppercase tracking-widest">CPU</span>
            </div>
          </TacticalPanel>

          <TacticalPanel class="col-span-12 lg:col-span-3 group hover:bg-white/[0.02] transition-all" paddings="p-10">
            <div class="flex justify-between items-center mb-10">
               <span class="mono-xs font-black text-slate-400 uppercase tracking-widest">Threat Feed</span>
               <div class="flex gap-2">
                  <div class="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_var(--success)] animate-pulse"></div>
               </div>
            </div>
            <div class="flex items-baseline gap-5">
              <span class="text-6xl font-black italic tracking-tighter text-white tabular-nums" id="stat-threat-hits">{props.status.threats?.totalIngested || 0}</span>
              <span class="mono-xs text-slate-500 font-bold uppercase tracking-widest">Indicators</span>
            </div>
          </TacticalPanel>

          <TacticalPanel class="col-span-12 lg:col-span-3 group hover:bg-white/[0.02] transition-all" paddings="p-10">
            <div class="flex justify-between items-center mb-10">
               <span class="mono-xs font-black text-slate-400 uppercase tracking-widest">Enforcement</span>
               <StatusPill status="danger" label="STRICT" class="px-3 py-1 text-[8px]" />
            </div>
            <div class="flex items-baseline gap-5">
              <span class="text-6xl font-black italic tracking-tighter text-danger tabular-nums" id="stat-fw-blocked">{props.status.firewall?.blockedCount || 42}</span>
              <span class="mono-xs text-slate-500 font-bold uppercase tracking-widest">Blocked</span>
            </div>
          </TacticalPanel>
        </div>
      </section>

      {/* ── Phase 02: Enforcement Ledger (NEW) ─────────────────────────── */}
      <section class="mb-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <TacticalSectionTitle label="Active Enforcement Ledger" color="primary" />
        <div class="t-panel glass-panel p-0 border-t-2 border-primary/30 overflow-hidden shadow-2xl">
           <header class="p-8 border-b border-white/5 flex justify-between items-center bg-black/40 backdrop-blur-md">
              <div class="flex items-center gap-6">
                 <div class="p-4 bg-primary/10 border border-primary/20 rounded-2xl text-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)]">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                 </div>
                 <h3 class="tactical-title text-2xl tracking-widest uppercase">Perimeter Isolation Events</h3>
              </div>
              <a href="/system/ledger" class="t-btn px-6 py-3 text-[10px]">Full Ledger →</a>
           </header>
           <div class="h-[400px]">
              <blocking-log compact="true" limit="12"></blocking-log>
           </div>
        </div>
      </section>

      {/* ── Phase 03: Signal (Tactical Awareness) ────────────────────────── */}
      <section class="mb-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <TacticalSectionTitle label="Tactical Intelligence Deck" color="danger" />
        <div class="grid grid-cols-1 gap-6">
          <TacticalPanel
            title="External Threat Databases"
            borderColor="danger/30"
            class="col-span-12 bg-black/40"
          >
             <news-feed limit="4" compact="true"></news-feed>
             <div class="mt-6 pt-4 border-t border-white/5 flex justify-end">
                <a href="/intel/feed" class="mono-xs text-slate-500 hover:text-white transition-colors uppercase tracking-widest font-black">Open Intelligence Center →</a>
             </div>
          </TacticalPanel>
        </div>
      </section>

      {/* ── Phase 04: Strike (Mesh Topology) ────────────────────────── */}
      <section class="animate-in fade-in slide-in-from-bottom-4 duration-1000 mb-12">
        <TacticalSectionTitle label="Defensive Mesh Topology" color="success" />
        <div class="grid grid-cols-12 gap-6">
          <div class="col-span-12 lg:col-span-8 t-panel glass-panel p-0 border-t-2 border-success/30 overflow-hidden shadow-2xl">
             <header class="p-8 border-b border-white/5 flex justify-between items-center bg-black/40 backdrop-blur-md">
                <div class="flex items-center gap-6">
                   <div class="p-4 bg-success/10 border border-success/20 rounded-2xl text-success shadow-[0_0_15px_rgba(var(--success-rgb),0.2)]">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><path d="m19 19-3-3"/><path d="m5 5 3 3"/><path d="m16 8 3-3"/><path d="m8 16-3 3"/></svg>
                   </div>
                   <h3 class="tactical-title text-2xl tracking-widest uppercase">Neighbor Signal Graph</h3>
                </div>
             </header>
             <div class="h-[600px] relative bg-black/60 group">
                <div class="absolute inset-0 z-0 opacity-60">
                   <network-map></network-map>
                </div>
                {/* Tactical Legend */}
                <div class="absolute bottom-8 right-8 p-6 bg-black/90 border border-white/10 rounded-2xl backdrop-blur-2xl z-10 pointer-events-none shadow-2xl">
                   <div class="flex flex-col gap-4">
                      <div class="flex items-center gap-4">
                         <div class="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]"></div>
                         <span class="mono-xs text-slate-400 font-bold uppercase tracking-widest">Authorized Node</span>
                      </div>
                      <div class="flex items-center gap-4">
                         <div class="w-3 h-3 rounded-full bg-danger shadow-[0_0_8px_var(--danger)]"></div>
                         <span class="mono-xs text-slate-400 font-bold uppercase tracking-widest">Malicious Origin</span>
                      </div>
                   </div>
                </div>
             </div>
          </div>
          
           <div class="col-span-12 lg:col-span-4 flex flex-col gap-6">
              <TacticalPanel title="Deception Lures" borderColor="warning/30" class="flex flex-col shadow-2xl">
                 <div class="flex items-center justify-center min-h-[300px]">
                    <honeypot-chart></honeypot-chart>
                 </div>
              </TacticalPanel>

              <TacticalPanel borderColor="slate-700" class="flex flex-col shadow-2xl">
                 {/* BUG-5.4 FIX: Use real metrics for intervention force based on active nodes and health */}
                 <div class="flex justify-between items-baseline mb-4">
                    <span class="mono-xs text-slate-500 font-bold uppercase tracking-widest">Intervention Force</span>
                    <span class="mono-xs text-white font-black italic tracking-[0.2em] tabular-nums text-lg">{Math.min(100, (props.status.mesh?.activeNodes || 0) * 20 + (props.status.audit?.integrityScore === 100 ? 20 : 0))}%</span>
                 </div>
                 <div class="h-2 bg-white/5 rounded-full overflow-hidden shadow-inner">
                    <div class="h-full bg-danger shadow-[0_0_15px_rgba(var(--danger-rgb),0.5)]" style={`width: ${Math.min(100, (props.status.mesh?.activeNodes || 0) * 20 + (props.status.audit?.integrityScore === 100 ? 20 : 0))}%`}></div>
                 </div>
                 <div class="mt-6 pt-6 border-t border-white/5 flex justify-between items-center">
                    <span class="mono-xs text-slate-600 font-bold uppercase tracking-widest">Strike State</span>
                    <StatusPill
                      status={props.status.audit?.integrityScore > 90 && props.status.mesh?.activeNodes > 0 ? 'success' : 'warning'}
                      label={props.status.audit?.integrityScore > 90 && props.status.mesh?.activeNodes > 0 ? 'ARMED' : 'STANDBY'}
                      class="!px-3 !py-0.5"
                    />
                 </div>
              </TacticalPanel>
           </div>
        </div>
      </section>
    </Layout>
  );
};
