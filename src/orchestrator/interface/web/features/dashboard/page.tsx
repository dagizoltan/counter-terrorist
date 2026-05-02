import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Atomic Dashboard
 * Hardened tactical overview with zero-class dependency.
 */
export const Dashboard = (props: { status: any; csrfToken: string }) => {
  const { os, platform } = props.status;
  const metrics = platform?.metrics;

  const islandPaths = [
    '/components/islands/BlockingLog.js',
    '/components/islands/ProcessTree.js',
    '/components/islands/MetricsHydrator.js',
    '/components/islands/TacticalIntel.js'
  ];

  const styles = {
    card: "padding:2rem; border-radius:1.5rem; background:rgba(15,23,42,0.7); border:1px solid rgba(255,255,255,0.05); position:relative; overflow:hidden;",
    headerLine: "width:8px; height:40px; background:#0ea5e9; border-radius:4px; box-shadow:0 0 20px rgba(14,165,233,0.3);",
    metricValue: "font-size:3rem; font-weight:900; font-family:monospace; color:white;",
    grid: "display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:2rem;",
    button: "padding:0.75rem 2rem; border-radius:1rem; font-weight:900; font-size:10px; text-transform:uppercase; letter-spacing:0.2em; cursor:pointer; transition:all 0.3s; border:1px solid transparent;",
    sectionTitle: "font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:0.4em; color:rgba(148,163,184,0.4); display:flex; align-items:center; gap:1rem; margin-bottom:2rem;"
  };

  return (
    <Layout title="Command Console" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      {/* Top Header Section */}
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3rem;">
        <div style="display:flex; align-items:center; gap:1.5rem;">
          <div style={styles.headerLine}></div>
          <div>
            <h1 style="font-size:2.5rem; font-weight:900; letter-spacing:-0.05em; text-transform:uppercase; margin:0;">DASHBOARD_OVERVIEW</h1>
            <p style="font-size:10px; font-weight:900; color:rgba(148,163,184,0.5); text-transform:uppercase; letter-spacing:0.4em; margin-top:0.25rem;">Distributed Security Orchestrator // v4.2-STABLE</p>
          </div>
        </div>
        <div style="display:flex; gap:1rem;">
           <button style={styles.button + " background:rgba(14,165,233,0.1); color:#0ea5e9; border-color:rgba(14,165,233,0.2);"}>Global_Sweep</button>
           <button style={styles.button + " background:rgba(239,68,68,0.1); color:#ef4444; border-color:rgba(239,68,68,0.2);"}>Node_Isolation</button>
        </div>
      </div>

      {/* SECTION 01: SYSTEM VITALITY */}
      <div style="margin-bottom:3rem;">
        <h2 style={styles.sectionTitle}>
          <div style="width:32px; height:1px; background:rgba(255,255,255,0.1);"></div>
          01_SYSTEM_VITALITY
        </h2>
        <div style={styles.grid}>
          {/* CPU Load */}
          <div style={styles.card + " border-left:4px solid #0ea5e9;"}>
            <div style="font-size:9px; font-weight:900; color:rgba(148,163,184,0.5); text-transform:uppercase; letter-spacing:0.2em; margin-bottom:1.5rem;">CPU_Load</div>
            <div style={styles.metricValue}>{metrics?.cpu.load[0]?.toFixed(2) || "0.00"}</div>
            <div style="height:6px; background:rgba(255,255,255,0.05); border-radius:3px; margin-top:1.5rem; overflow:hidden;">
               <div style={`height:100%; background:#0ea5e9; width:${Math.min(((metrics?.cpu.load?.[0] || 0) * 10), 100)}%; transition:width 1s;`}></div>
            </div>
          </div>

          {/* Memory */}
          <div style={styles.card + " border-left:4px solid rgba(148,163,184,0.3);"}>
            <div style="font-size:9px; font-weight:900; color:rgba(148,163,184,0.5); text-transform:uppercase; letter-spacing:0.2em; margin-bottom:1.5rem;">Memory_Util</div>
            <div style={styles.metricValue}>
              {Math.floor((metrics?.memory?.used || 0) / 1024 / 1024)}
              <span style="font-size:1rem; opacity:0.3; margin-left:0.5rem;">MB</span>
            </div>
            <div style="height:6px; background:rgba(255,255,255,0.05); border-radius:3px; margin-top:1.5rem; overflow:hidden;">
               <div style={`height:100%; background:#94a3b8; width:${Math.min(((metrics?.memory?.used || 0) / (metrics?.memory?.total || 1)) * 100, 100)}%;`}></div>
            </div>
          </div>

          {/* eBPF Status */}
          <div style={styles.card + " border-left:4px solid #10b981;"}>
            <div style="font-size:9px; font-weight:900; color:rgba(148,163,184,0.5); text-transform:uppercase; letter-spacing:0.2em; margin-bottom:1.5rem;">eBPF_Guardian</div>
            <div style="font-size:2rem; font-weight:900; color:#10b981; text-transform:uppercase; font-style:italic;">Running</div>
            <div style="display:flex; gap:4px; margin-top:1.5rem;">
               <div style="width:12px; height:6px; background:#10b981;"></div>
               <div style="width:12px; height:6px; background:rgba(16,185,129,0.5);"></div>
               <div style="width:12px; height:6px; background:rgba(16,185,129,0.2);"></div>
            </div>
          </div>

          {/* Threat Level */}
          <div style={styles.card + " border-left:4px solid #f59e0b;"}>
            <div style="font-size:9px; font-weight:900; color:rgba(148,163,184,0.5); text-transform:uppercase; letter-spacing:0.2em; margin-bottom:1.5rem;">Threat_Level</div>
            <div style="font-size:2rem; font-weight:900; color:#f59e0b; text-transform:uppercase; font-style:italic;">Nominal</div>
            <div style="display:flex; align-items:center; gap:0.5rem; margin-top:1.5rem;">
               <div style="width:8px; height:8px; border-radius:50%; background:#f59e0b;"></div>
               <span style="font-size:8px; font-weight:900; color:rgba(148,163,184,0.4); text-transform:uppercase;">No active incursions</span>
            </div>
          </div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:3rem; margin-bottom:3rem;">
        {/* SECTION 02: AUTOPILOT */}
        <section style="display:flex; flex-direction:column;">
            <h2 style={styles.sectionTitle}>
                <div style="width:32px; height:1px; background:rgba(255,255,255,0.1);"></div>
                02_AUTOPILOT_INTELLIGENCE
            </h2>
            <div style={styles.card + " flex-grow:1; background:rgba(15,23,42,0.4); border-radius:2rem;"}>
                <div id="tactical-intel-root"></div>
            </div>
        </section>

        {/* SECTION 03: INFRASTRUCTURE */}
        <section style="display:flex; flex-direction:column;">
            <h2 style={styles.sectionTitle}>
                <div style="width:32px; height:1px; background:rgba(255,255,255,0.1);"></div>
                03_MISSION_INFRASTRUCTURE
            </h2>
            <div style="display:flex; flex-direction:column; gap:1.5rem; flex-grow:1;">
                {/* Perimeter Card */}
                <div style={styles.card + " display:flex; align-items:center; justify-content:space-between; padding:1.5rem;"}>
                    <div style="display:flex; align-items:center; gap:1.5rem;">
                        <div style="padding:1rem; background:rgba(14,165,233,0.1); border-radius:1rem; color:#0ea5e9;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        </div>
                        <div>
                            <div style="font-size:8px; font-weight:900; color:rgba(148,163,184,0.5); text-transform:uppercase; letter-spacing:0.2em;">Network_Perimeter</div>
                            <div style="font-size:1.1rem; font-weight:900; color:white; font-style:italic;">SEARCHING...</div>
                        </div>
                    </div>
                </div>

                {/* Mesh Card */}
                <div style={styles.card + " display:flex; align-items:center; justify-content:space-between; padding:1.5rem;"}>
                    <div style="display:flex; align-items:center; gap:1.5rem;">
                        <div style="padding:1rem; background:rgba(16,185,129,0.1); border-radius:1rem; color:#10b981;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5"/><path d="M17 12V17a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-5"/><circle cx="12" cy="12" r="3"/></svg>
                        </div>
                        <div>
                            <div style="font-size:8px; font-weight:900; color:rgba(148,163,184,0.5); text-transform:uppercase; letter-spacing:0.2em;">Mesh_Fabric</div>
                            <div style="font-size:1.1rem; font-weight:900; color:white; font-style:italic;">1 ACTIVE NODE</div>
                        </div>
                    </div>
                </div>

                {/* Fleet Card */}
                <div style={styles.card + " display:flex; align-items:center; justify-content:space-between; padding:1.5rem;"}>
                    <div style="display:flex; align-items:center; gap:1.5rem;">
                        <div style="padding:1rem; background:rgba(255,255,255,0.05); border-radius:1rem; color:#94a3b8;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                        </div>
                        <div>
                            <div style="font-size:8px; font-weight:900; color:rgba(148,163,184,0.5); text-transform:uppercase; letter-spacing:0.2em;">Agent_Fleet</div>
                            <div style="font-size:1.1rem; font-weight:900; color:white; font-style:italic;">3 ACTIVE</div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
      </div>

      <div style="margin-bottom:3rem;">
        <section style={styles.card + " padding:3rem; background:rgba(15,23,42,0.4); border-radius:2rem;"}>
          <h2 style="font-size:12px; font-weight:900; text-transform:uppercase; letter-spacing:0.4em; margin-bottom:2.5rem; color:white; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:1.5rem;">04_TACTICAL_FORENSICS</h2>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:2rem;">
             <div style="display:flex; justify-content:space-between; align-items:center; padding:1.5rem; background:rgba(255,255,255,0.03); border-radius:1.5rem; border:1px solid rgba(255,255,255,0.05);">
                <div>
                   <div style="font-size:8px; font-weight:900; color:rgba(148,163,184,0.5); text-transform:uppercase; letter-spacing:0.2em;">Audit_Chain</div>
                   <div style="font-size:1.25rem; font-weight:900; color:#10b981; font-style:italic;">VERIFIED_SECURE</div>
                </div>
                <div style="width:40px; height:40px; background:rgba(16,185,129,0.1); border-radius:50%; display:flex; align-items:center; justify-content:center; color:#10b981;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                </div>
             </div>
             <div style="display:flex; justify-content:space-between; align-items:center; padding:1.5rem; background:rgba(255,255,255,0.03); border-radius:1.5rem; border:1px solid rgba(255,255,255,0.05);">
                <div>
                   <div style="font-size:8px; font-weight:900; color:rgba(148,163,184,0.5); text-transform:uppercase; letter-spacing:0.2em;">Integrity_Hash</div>
                   <div style="font-size:1.25rem; font-weight:900; color:rgba(14,165,233,0.8); font-style:italic;">SHA-256_ACTIVE</div>
                </div>
                <div style="width:40px; height:40px; background:rgba(14,165,233,0.1); border-radius:50%; display:flex; align-items:center; justify-content:center; color:#0ea5e9;">
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
