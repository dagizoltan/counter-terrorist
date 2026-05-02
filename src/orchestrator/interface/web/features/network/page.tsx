import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Network Shield Page
 * Perimeter defense and stealth management.
 */
export const NetworkShieldPage = (props: { status: any, csrfToken?: string }) => {
  return (
    <Layout title="Network Shield" islandPaths={[
      '/components/islands/MetricsHydrator.js',
      '/components/islands/FirewallAgent.js',
      '/components/islands/VpnAgent.js',
      '/components/islands/AnonymizerController.js',
      '/components/islands/NetworkMap.js'
    ]} csrfToken={props.csrfToken}>
      <div style="margin-bottom:3rem;">
        <div style="display:flex; align-items:center; gap:1.5rem;">
          <div style="width:8px; height:40px; background:var(--cyber-blue); border-radius:4px; box-shadow:0 0 20px var(--cyber-blue-glow);"></div>
          <div>
            <h1 style="font-size:2.5rem; margin:0;">NETWORK_SHIELD</h1>
            <p class="mono-label" style="color:var(--text-muted); margin-top:0.25rem;">Perimeter Defense // Identity Stealth // Topology Discovery</p>
          </div>
        </div>
      </div>

      <div style="margin-bottom:3rem;">
        <h2 class="section-header">01_TOPOLOGY_DISCOVERY</h2>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:2rem; margin-bottom:2rem;">
          {/* DISCOVERY GRID */}
          <div class="glass-panel">
             <div style="display:flex; justify-content:space-between; align-items:center; mb:2rem; padding-bottom:1rem; border-bottom:1px solid var(--border-color); margin-bottom:1.5rem;">
                <div style="display:flex; align-items:center; gap:0.75rem;">
                  <div style="padding:0.5rem; background:rgba(255,255,255,0.05); border-radius:0.5rem; color:var(--text-secondary);">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
                  </div>
                  <h3 class="mono-label" style="color:white; opacity:0.8;">Local_Discovery_Grid</h3>
                </div>
                <div class="mono-label pulse" style="color:var(--cyber-blue); background:var(--cyber-blue-glow); padding:0.25rem 0.75rem; border-radius:1rem;">Live_Scan</div>
             </div>
             <network-map></network-map>
          </div>

          {/* STEALTH CONTROLS */}
          <div class="glass-panel" style="border-left:4px solid var(--cyber-blue);">
             <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:1rem; border-bottom:1px solid var(--border-color); margin-bottom:1.5rem;">
                <div style="display:flex; align-items:center; gap:0.75rem;">
                   <div style="padding:0.5rem; background:var(--cyber-blue-glow); border-radius:0.5rem; color:var(--cyber-blue);">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                   </div>
                   <h3 class="mono-label" style="color:var(--cyber-blue);">Stealth_Anonymizer_Grid</h3>
                </div>
                <div id="stat-vpn-status" class="mono-label" style="color:var(--cyber-green);">ENCRYPTED</div>
             </div>
             <div style="margin-bottom:2rem;">
                <span class="mono-label" style="opacity:0.4; display:block; margin-bottom:1rem;">Active_Stealth_Configuration</span>
                <anonymizer-controller></anonymizer-controller>
             </div>
             <div style="padding-top:1.5rem; border-top:1px solid var(--border-color);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                   <span class="mono-label" style="opacity:0.5;">Identity_Rotations</span>
                   <span id="stat-vpn-rotations" style="font-size:1.5rem; font-weight:900; color:white;">0 Rotations</span>
                </div>
                <button 
                  onclick="const t=document.querySelector('meta[name=\'csrf-token\']')?.content; fetch('/api/network/rotate', { method: 'POST', headers: {'X-CT-Token': t} }).then(() => alert('Identity rotation initiated.'))"
                  class="tactical-button"
                  style="width:100%; background:var(--cyber-blue); color:white; border:none;"
                >
                  Force_Identity_Rotation
                </button>
             </div>
          </div>
        </div>
      </div>

      <div style="margin-bottom:3rem;">
        <h2 class="section-header">02_PERIMETER_ENFORCEMENT</h2>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:2rem;">
          {/* FIREWALL CONTROLS */}
          <div style="grid-column: span 2;" class="glass-panel">
             <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:1rem; border-bottom:1px solid var(--border-color); margin-bottom:2rem;">
                <div style="display:flex; align-items:center; gap:0.75rem;">
                  <div style="padding:0.5rem; background:rgba(255,255,255,0.05); border-radius:0.5rem; color:var(--text-secondary);">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </div>
                  <h3 class="mono-label" style="color:white; opacity:0.8;">Enforcement_Buffer</h3>
                </div>
                <div style="display:flex; align-items:center; gap:1rem;">
                   <span id="fw-pid" class="mono-label" style="opacity:0.4;">PID_N/A</span>
                   <div class="status-dot critical pulse"></div>
                </div>
             </div>
             <div id="fw-blocked-list" style="margin-bottom:2rem; min-height:100px;">
                <p class="mono-label pulse" style="opacity:0.3; font-style:italic;">Querying firewall state...</p>
             </div>
             <div style="background:rgba(0,0,0,0.3); border:1px solid var(--border-color); padding:2rem; border-radius:1.5rem; position:relative; overflow:hidden;">
                <div style="position:absolute; top:0; right:0; padding:1rem; opacity:0.05;">
                   <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--cyber-red)" stroke-width="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h4 class="mono-label" style="opacity:0.4; margin-bottom:1.5rem;">Manual_Block_Instruction</h4>
                <div style="display:flex; gap:1rem; position:relative; z-index:1;">
                   <input id="fw-block-input" type="text" placeholder="TARGET_IP_ADDR" style="flex-grow:1; background:rgba(0,0,0,0.4); border:1px solid var(--border-color); border-radius:0.75rem; padding:0.75rem 1.5rem; color:white; font-family:'JetBrains Mono', monospace; outline:none;" />
                   <button 
                     onclick="const ip=document.getElementById('fw-block-input').value; const t=document.querySelector('meta[name=\'csrf-token\']')?.content; fetch('/api/agents/firewall/block', { method: 'POST', headers: {'Content-Type': 'application/json', 'X-CT-Token': t}, body: JSON.stringify({ip}) }).then(() => location.reload())"
                     class="tactical-button critical"
                   >
                     Enforce_Block
                   </button>
                </div>
             </div>
          </div>

          {/* TRAFFIC LOGS */}
          <div class="glass-panel" style="display:flex; flex-direction:column;">
             <div style="display:flex; align-items:center; gap:0.75rem; padding-bottom:1rem; border-bottom:1px solid var(--border-color); margin-bottom:2rem;">
                <div style="padding:0.5rem; background:rgba(255,255,255,0.05); border-radius:0.5rem; color:var(--text-secondary);">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
                </div>
                <h3 class="mono-label" style="color:white; opacity:0.8;">Live_Traffic</h3>
             </div>
             <div id="fw-traffic-list" style="flex-grow:1; max-height:400px; overflow-y:auto;" class="log-stream">
                <p class="mono-label pulse" style="opacity:0.3; text-align:center; padding:2rem;">Awaiting packet stream...</p>
             </div>
          </div>
        </div>
      </div>

      <firewall-agent></firewall-agent>
      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
