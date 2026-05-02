import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { ApplicationStatus } from "@core/ports.ts";

/**
 * System Information Page
 * Hardware and OS deep-dive.
 */
export const SysInfoPage = (props: { status: ApplicationStatus, csrfToken?: string }) => {
  const { platform } = props.status;
  const metrics = platform?.metrics;

  const formatBytes = (bytes?: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Layout title="System Information" csrfToken={props.csrfToken}>
      <div style="margin-bottom:3rem;">
        <div style="display:flex; align-items:center; gap:1.5rem;">
          <div style="width:8px; height:40px; background:var(--cyber-blue); border-radius:4px; box-shadow:0 0 20px var(--cyber-blue-glow);"></div>
          <div>
            <h1 style="font-size:2.5rem; margin:0;">HOST_INTELLIGENCE</h1>
            <p class="mono-label" style="color:var(--text-muted); margin-top:0.25rem;">Hardware & OS Deep-Dive // Real-Time Telemetry // Runtime_Environment</p>
          </div>
        </div>
      </div>

      <div class="tactical-grid" style="margin-bottom:3rem; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr));">
        {/* HARDWARE SPECS */}
        <section class="glass-panel">
           <div style="display:flex; align-items:center; gap:0.75rem; padding-bottom:1rem; border-bottom:1px solid var(--border-color); margin-bottom:2rem;">
              <div style="padding:0.5rem; background:rgba(255,255,255,0.05); border-radius:0.5rem; color:var(--text-secondary);">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>
              </div>
              <h3 class="mono-label" style="color:white; opacity:0.8; font-style:italic;">Hardware_Specification</h3>
           </div>
           <div style="display:flex; flex-direction:column; gap:1.5rem;">
              <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:1rem; border-bottom:1px solid var(--border-color);">
                 <span class="mono-label" style="opacity:0.4;">Hostname</span>
                 <span style="font-size:1rem; font-weight:900; color:white; font-style:italic;">{metrics?.hostname}</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:1rem; border-bottom:1px solid var(--border-color);">
                 <span class="mono-label" style="opacity:0.4;">CPU Cores</span>
                 <span style="font-size:1rem; font-weight:900; color:white; font-style:italic;">{metrics?.cpu.cores} Physical / Virtual</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:1rem; border-bottom:1px solid var(--border-color);">
                 <span class="mono-label" style="opacity:0.4;">Memory Total</span>
                 <span style="font-size:1rem; font-weight:900; color:white; font-style:italic;">{formatBytes(metrics?.memory.total)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                 <span class="mono-label" style="opacity:0.4;">Architecture</span>
                 <span class="mono-label" style="color:var(--cyber-blue); font-size:1rem;">{Deno.build.arch}</span>
              </div>
           </div>
        </section>

        {/* OS & KERNEL */}
        <section class="glass-panel">
           <div style="display:flex; align-items:center; gap:0.75rem; padding-bottom:1rem; border-bottom:1px solid var(--border-color); margin-bottom:2rem;">
              <div style="padding:0.5rem; background:rgba(255,255,255,0.05); border-radius:0.5rem; color:var(--text-secondary);">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <h3 class="mono-label" style="color:white; opacity:0.8; font-style:italic;">Software_Environment</h3>
           </div>
           <div style="display:flex; flex-direction:column; gap:1.5rem;">
              <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:1rem; border-bottom:1px solid var(--border-color);">
                 <span class="mono-label" style="opacity:0.4;">OS Distribution</span>
                 <span style="font-size:1rem; font-weight:900; color:white; font-style:italic;">{platform?.name} {platform?.version}</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:1rem; border-bottom:1px solid var(--border-color);">
                 <span class="mono-label" style="opacity:0.4;">Kernel Tag</span>
                 <span class="log-entry" style="font-size:10px; max-width:200px; border:none; padding:0;">{platform?.tag}</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:1rem; border-bottom:1px solid var(--border-color);">
                 <span class="mono-label" style="opacity:0.4;">Runtime</span>
                 <span class="mono-label" style="color:var(--cyber-blue); font-size:1rem;">Deno v{Deno.version.deno}</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                 <span class="mono-label" style="opacity:0.4;">V8 Engine</span>
                 <span style="font-size:1rem; font-weight:900; color:white; font-style:italic;">v{Deno.version.v8}</span>
              </div>
           </div>
        </section>

        {/* REAL-TIME UTILIZATION */}
        <section style="grid-column: span 2;" class="glass-panel">
           <div style="display:flex; align-items:center; gap:0.75rem; padding-bottom:1rem; border-bottom:1px solid var(--border-color); margin-bottom:2rem;">
              <div style="padding:0.5rem; background:rgba(255,255,255,0.05); border-radius:0.5rem; color:var(--text-secondary);">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
              </div>
              <h3 class="mono-label" style="color:white; opacity:0.8; font-style:italic;">Resource_Utilization</h3>
           </div>
           <div class="tactical-grid" style="grid-template-columns:repeat(3, 1fr);">
              <div style="background:rgba(0,0,0,0.3); padding:2rem; border-radius:1.5rem; border:1px solid var(--border-color); position:relative; overflow:hidden;">
                 <div style="position:absolute; top:0; right:0; padding:1rem; opacity:0.05; pointer-events:none;">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                 </div>
                 <p class="mono-label" style="opacity:0.4; margin-bottom:1.5rem;">Memory Pressure</p>
                 <div class="metric-value" style="font-size:2.5rem; margin-bottom:1.5rem;">{Math.round(((metrics?.memory.used || 0) / (metrics?.memory.total || 1)) * 100)}%</div>
                 <div class="progress-bar">
                    <div class="progress-fill" style={`width: ${((metrics?.memory.used || 0) / (metrics?.memory.total || 1)) * 100}%`}></div>
                 </div>
              </div>
              <div style="background:rgba(0,0,0,0.3); padding:2rem; border-radius:1.5rem; border:1px solid var(--border-color); position:relative; overflow:hidden;">
                 <div style="position:absolute; top:0; right:0; padding:1rem; opacity:0.05; pointer-events:none;">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                 </div>
                 <p class="mono-label" style="opacity:0.4; margin-bottom:1.5rem;">Load Average</p>
                 <div class="metric-value" style="font-size:1.5rem; color:var(--cyber-blue); margin-bottom:1.5rem;">{metrics?.cpu.load.join(" / ")}</div>
                 <div class="mono-label" style="opacity:0.3; font-style:italic;">Normalized_Per_Core</div>
              </div>
              <div style="background:rgba(0,0,0,0.3); padding:2rem; border-radius:1.5rem; border:1px solid var(--border-color); position:relative; overflow:hidden;">
                 <div style="position:absolute; top:0; right:0; padding:1rem; opacity:0.05; pointer-events:none;">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                 </div>
                 <p class="mono-label" style="opacity:0.4; margin-bottom:1.5rem;">Host Uptime</p>
                 <div class="metric-value" style="font-size:2.5rem; margin-bottom:1.5rem;">{Math.floor((metrics?.uptime || 0) / 86400)}D {Math.floor(((metrics?.uptime || 0) % 86400) / 3600)}H</div>
                 <div class="mono-label" style="opacity:0.3; font-style:italic;">Continuous_Operation</div>
              </div>
           </div>
        </section>
      </div>
    </Layout>
  );
};
