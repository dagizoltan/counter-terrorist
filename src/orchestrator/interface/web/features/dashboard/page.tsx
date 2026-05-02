import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Atomic Dashboard
 * Hardened tactical overview with CSS-driven design system.
 */
export const Dashboard = (props: { status: any; csrfToken: string }) => {
  const { platform } = props.status;
  const metrics = platform?.metrics;

  const islandPaths = [
    '/components/islands/BlockingLog.js',
    '/components/islands/ProcessTree.js',
    '/components/islands/MetricsHydrator.js',
    '/components/islands/TacticalIntel.js'
  ];

  return (
    <Layout title="Command Console" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      {/* Top Header Section */}
      <div class="flex justify-between items-center mb-12">
        <div class="flex items-center gap-6">
          <div style="width:8px; height:40px; background:var(--cyber-blue); border-radius:4px; box-shadow:0 0 20px var(--cyber-blue-glow);"></div>
          <div>
            <h1 style="font-size:2.5rem; margin:0;">DASHBOARD_OVERVIEW</h1>
            <p class="mono-label" style="color:var(--text-muted); margin-top:0.25rem;">Distributed Security Orchestrator // v4.2-STABLE</p>
          </div>
        </div>
        <div class="flex gap-4">
           <button class="tactical-button">Global_Sweep</button>
           <button class="tactical-button critical">Node_Isolation</button>
        </div>
      </div>

      {/* SECTION 01: SYSTEM VITALITY */}
      <div class="mb-12">
        <h2 class="section-header">01_SYSTEM_VITALITY</h2>
        <div class="tactical-grid">
          {/* CPU Load */}
          <div class="glass-panel metric-card">
            <div class="metric-label">CPU_Load</div>
            <div class="metric-value">{metrics?.cpu.load[0]?.toFixed(2) || "0.00"}</div>
            <div class="progress-bar">
               <div class="progress-fill" style={`width:${Math.min(((metrics?.cpu.load?.[0] || 0) * 10), 100)}%;`}></div>
            </div>
          </div>

          {/* Memory */}
          <div class="glass-panel metric-card" style="border-left-color: var(--text-secondary);">
            <div class="metric-label">Memory_Util</div>
            <div class="metric-value">
              {Math.floor((metrics?.memory?.used || 0) / 1024 / 1024)}
              <span style="font-size:1rem; opacity:0.3; margin-left:0.5rem;">MB</span>
            </div>
            <div class="progress-bar">
               <div class="progress-fill" style={`background:var(--text-secondary); width:${Math.min(((metrics?.memory?.used || 0) / (metrics?.memory?.total || 1)) * 100, 100)}%;`}></div>
            </div>
          </div>

          {/* eBPF Status */}
          <div class="glass-panel metric-card" style="border-left-color: var(--cyber-green);">
            <div class="metric-label">eBPF_Guardian</div>
            <div class="metric-value" style="color:var(--cyber-green); font-size:2.25rem; font-style:italic;">RUNNING</div>
            <div class="flex gap-1 mt-6">
               <div style="width:12px; height:6px; background:var(--cyber-green);"></div>
               <div style="width:12px; height:6px; background:var(--cyber-green); opacity:0.5;"></div>
               <div style="width:12px; height:6px; background:var(--cyber-green); opacity:0.2;"></div>
            </div>
          </div>

          {/* Threat Level */}
          <div class="glass-panel metric-card" style="border-left-color: var(--cyber-orange);">
            <div class="metric-label">Threat_Level</div>
            <div class="metric-value" style="color:var(--cyber-orange); font-size:2.25rem; font-style:italic;">NOMINAL</div>
            <div class="flex items-center gap-2 mt-6">
               <div class="status-dot warning pulse"></div>
               <span class="mono-label" style="opacity:0.5;">Active_Monitoring</span>
            </div>
          </div>
        </div>
      </div>

      <div class="tactical-grid" style="grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); margin-bottom:3rem;">
        {/* SECTION 02: AUTOPILOT */}
        <section class="flex flex-col">
            <h2 class="section-header">02_AUTOPILOT_INTELLIGENCE</h2>
            <div class="glass-panel flex-grow" style="background:rgba(0,0,0,0.3);">
                <div id="tactical-intel-root"></div>
            </div>
        </section>

        {/* SECTION 03: INFRASTRUCTURE */}
        <section class="flex flex-col">
            <h2 class="section-header">03_MISSION_INFRASTRUCTURE</h2>
            <div class="flex flex-col gap-6 flex-grow">
                {/* Perimeter Card */}
                <div class="glass-panel flex items-center justify-between" style="padding:1.5rem;">
                    <div class="flex items-center gap-6">
                        <div class="p-4" style="background:var(--cyber-blue-glow); border-radius:1rem; color:var(--cyber-blue);">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        </div>
                        <div>
                            <div class="mono-label" style="font-size:8px; opacity:0.4;">Network_Perimeter</div>
                            <div style="font-size:1.1rem; font-weight:900; color:white; font-style:italic;">SEARCHING...</div>
                        </div>
                    </div>
                </div>

                {/* Mesh Card */}
                <div class="glass-panel flex items-center justify-between" style="padding:1.5rem;">
                    <div class="flex items-center gap-6">
                        <div class="p-4" style="background:var(--cyber-green-glow); border-radius:1rem; color:var(--cyber-green);">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5"/><path d="M17 12V17a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-5"/><circle cx="12" cy="12" r="3"/></svg>
                        </div>
                        <div>
                            <div class="mono-label" style="font-size:8px; opacity:0.4;">Mesh_Fabric</div>
                            <div style="font-size:1.1rem; font-weight:900; color:white; font-style:italic;">1 ACTIVE NODE</div>
                        </div>
                    </div>
                </div>

                {/* Fleet Card */}
                <div class="glass-panel flex items-center justify-between" style="padding:1.5rem;">
                    <div class="flex items-center gap-6">
                        <div class="p-4" style="background:rgba(255,255,255,0.05); border-radius:1rem; color:var(--text-secondary);">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                        </div>
                        <div>
                            <div class="mono-label" style="font-size:8px; opacity:0.4;">Agent_Fleet</div>
                            <div style="font-size:1.1rem; font-weight:900; color:white; font-style:italic;">3 ACTIVE</div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
      </div>

      <div class="mb-12">
        <section class="glass-panel" style="padding:3rem; background:rgba(0,0,0,0.3);">
          <h2 class="section-header" style="border-bottom:1px solid var(--border-color); padding-bottom:1.5rem;">04_TACTICAL_FORENSICS</h2>
          <div class="tactical-grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));">
             <div class="flex justify-between items-center p-6 bg-white/5 border border-white/5 rounded-2xl">
                <div>
                   <div class="mono-label" style="font-size:8px; opacity:0.4;">Audit_Chain</div>
                   <div style="font-size:1.25rem; font-weight:900; color:var(--cyber-green); font-style:italic;">VERIFIED_SECURE</div>
                </div>
                <div class="flex items-center justify-center" style="width:40px; height:40px; background:var(--cyber-green-glow); border-radius:50%; color:var(--cyber-green);">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                </div>
             </div>
             <div class="flex justify-between items-center p-6 bg-white/5 border border-white/5 rounded-2xl">
                <div>
                   <div class="mono-label" style="font-size:8px; opacity:0.4;">Integrity_Hash</div>
                   <div style="font-size:1.25rem; font-weight:900; color:var(--cyber-blue); font-style:italic;">SHA-256_ACTIVE</div>
                </div>
                <div class="flex items-center justify-center" style="width:40px; height:40px; background:var(--cyber-blue-glow); border-radius:50%; color:var(--cyber-blue);">
                   <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
             </div>
          </div>
        </section>
      </div>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
