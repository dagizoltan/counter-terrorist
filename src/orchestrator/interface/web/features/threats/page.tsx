import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Threats Page
 * Global OSINT ingestion and tactical intelligence.
 */
export const ThreatsPage = (props: { status: any, csrfToken?: string }) => {
  return (
    <Layout title="Threat Intelligence Index" islandPaths={[
      '/components/islands/MetricsHydrator.js',
      '/components/islands/ThreatMap.js',
      '/components/islands/ThreatIntelList.js',
      '/components/islands/NewsFeed.js'
    ]} csrfToken={props.csrfToken}>
      <div style="margin-bottom:3rem;">
        <div style="display:flex; align-items:center; gap:1.5rem;">
          <div style="width:8px; height:40px; background:var(--cyber-orange); border-radius:4px; box-shadow:0 0 20px var(--cyber-orange-glow);"></div>
          <div>
            <h1 style="font-size:2.5rem; margin:0;">THREAT_INTELLIGENCE_INDEX</h1>
            <p class="mono-label" style="color:var(--text-muted); margin-top:0.25rem;">Global OSINT Ingestion // Reputation-Weighted Attribution // Tactical_Signals</p>
          </div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:2rem; margin-bottom:2rem;">
        {/* THREAT STREAM */}
        <div style="grid-column: span 2;" class="glass-panel">
           <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:1rem; border-bottom:1px solid var(--border-color); margin-bottom:2rem;">
              <h3 class="mono-label" style="opacity:0.6;">Global_Threat_Enforcement_Stream</h3>
              <div style="display:flex; align-items:center; gap:0.5rem;">
                 <div class="status-dot active pulse"></div>
                 <span class="mono-label" style="color:var(--cyber-green); font-style:italic;">Weighted_Reputation_Active</span>
              </div>
           </div>
           <div style="overflow-y:auto; max-height:600px;" class="log-stream">
              <threat-intel-list></threat-intel-list>
           </div>
        </div>

        {/* NEWS FEED */}
        <div class="glass-panel">
           <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:1rem; border-bottom:1px solid var(--border-color); margin-bottom:2rem;">
              <h3 class="mono-label" style="opacity:0.6;">Tactical_News_Signals</h3>
           </div>
           <div style="overflow-y:auto; max-height:600px;" class="log-stream">
              <news-feed></news-feed>
           </div>
        </div>

        {/* GEOLOCATION & ANALYTICS */}
        <div style="display:flex; flex-direction:column; gap:2rem;">
           <div class="glass-panel" style="height:300px; padding:0; overflow:hidden; position:relative;">
              <div style="padding:1.5rem; border-bottom:1px solid var(--border-color); position:relative; z-index:1; background:rgba(0,0,0,0.4);">
                 <h3 class="mono-label" style="opacity:0.6;">Geospatial_Map</h3>
              </div>
              <threat-map></threat-map>
           </div>

           <div class="glass-panel">
              <h3 class="mono-label" style="opacity:0.6; padding-bottom:1rem; border-bottom:1px solid var(--border-color); margin-bottom:1.5rem;">Curated_Providers</h3>
              <div style="display:flex; flex-direction:column; gap:1rem;">
                 {[
                   { name: 'Abuse.ch', weight: 'CRITICAL', score: 95 },
                   { name: 'Spamhaus', weight: 'MAX', score: 98 },
                   { name: 'Talos', weight: 'HIGH', score: 90 },
                   { name: 'FireHOL', weight: 'MED', score: 80 }
                 ].map(prov => (
                   <div style="display:flex; justify-content:space-between; align-items:center;">
                      <span class="mono-label" style="opacity:0.5;">{prov.name}</span>
                      <div style="display:flex; align-items:center; gap:0.75rem;">
                         <span class="mono-label" style="color:white; opacity:0.6;">{prov.score}%</span>
                         <span class="mono-label" style="color:var(--cyber-blue);">{prov.weight}</span>
                      </div>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      </div>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
