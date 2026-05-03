import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Events Page
 * Unified live threat stream viewer.
 */
export const EventsPage = (props: { csrfToken?: string }) => {
  const islandPaths = ['/components/islands/BlockingLog.js'];

  return (
    <Layout title="Security Events" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      <div style="margin-bottom:3rem;">
        <div style="display:flex; align-items:center; gap:1.5rem;">
          <div style="width:8px; height:40px; background:var(--cyber-red); border-radius:4px; box-shadow:0 0 20px var(--cyber-red-glow);"></div>
          <div>
            <h1 style="font-size:2.5rem; margin:0;">LIVE_THREAT_STREAM</h1>
            <p class="mono-label" style="color:var(--text-muted); margin-top:0.25rem;">Real-time forensic telemetry // Unified event pipeline</p>
          </div>
        </div>
      </div>

      <div class="glass-panel" style="padding:0; overflow:hidden;">
        <div style="padding:2rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05);">
          <h2 class="mono-label" style="color:white; opacity:0.8;">Full_Forensic_Log</h2>
          <div style="display:flex; gap:1rem; align-items:center;">
            <span class="mono-label" style="opacity:0.4;">Stream Active</span>
            <div class="status-dot critical pulse"></div>
          </div>
        </div>
        <div style="min-height:700px; padding:2rem; background:rgba(0,0,0,0.2);">
          <blocking-log id="main-log-full"></blocking-log>
        </div>
      </div>
    </Layout>
  );
};
