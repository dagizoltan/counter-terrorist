import { jsx as _jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const FirewallPage = (props: { csrfToken?: string, nonce?: string, userRole?: string }) => (
  <Layout title="Perimeter Defense // Firewall & Tunnel" islandPaths={['/components/islands/FirewallAgent.js', '/components/islands/AnonymizerController.js', '/components/islands/VpnAgent.js']} csrfToken={props.csrfToken} userRole={props.userRole}>
    <header class="flex justify-between items-end mb-12">
      <div class="flex items-center gap-6">
        <a href="/agents" class="w-16 h-16 flex items-center justify-center bg-white/5 border border-white/5 hover:border-danger/40 text-slate-500 hover:text-danger group transition-all">
           <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="group-hover:-translate-x-1"><path d="m15 18-6-6 6-6"/></svg>
        </a>
        <div style="width:12px; height:60px; background:var(--danger); border-radius:4px; box-shadow:0 0 20px var(--danger-glow);"></div>
        <div class="flex flex-col gap-2">
          <h1 style="font-size:4rem; line-height:0.9; letter-spacing:-0.07em; font-weight:900; color:white; margin:0;">PERIMETER & TUNNEL</h1>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="dot active" style="background:var(--danger);"></span>
              <span class="mono text-[10px] font-black text-danger tracking-[0.2em] uppercase">Firewall Enforcer Active</span>
            </div>
            <span class="text-slate-700">/</span>
            <div class="flex items-center gap-2">
              <span class="dot active" style="background:var(--primary);"></span>
              <span class="mono text-[10px] font-black text-primary tracking-[0.2em] uppercase">Identity Anonymizer Online</span>
            </div>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-6">
         <div class="flex flex-col items-end">
            <span class="mono-xs text-slate-600 font-black uppercase tracking-widest">Egress_Stability</span>
            <span class="text-2xl font-black text-success italic">99.9%</span>
         </div>
      </div>
    </header>
    
    {/* ANONYMIZER (VPN) SECTION */}
    <section class="mb-12">
      <div class="flex items-center gap-6 mb-6 pb-4 border-b border-white/5">
         <div class="w-12 h-1.5 bg-primary rounded-full"></div>
         <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em]">01_IDENTITY_CAMOUFLAGE_ROUTING</h2>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        {[
          { id: 'vpn-protocol', label: 'Tunnel_Protocol', value: 'WIREGUARD', theme: 'primary', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
          { id: 'vpn-region', label: 'Egress_Region', value: 'EU-CENTRAL', theme: 'primary', icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3.6 9h16.8 M3.6 15h16.8 M11.5 3a17 17 0 0 0 0 18 M12.5 3a17 17 0 0 1 0 18' },
          { id: 'vpn-status', label: 'Stealth_Level', value: 'MAXIMUM', theme: 'warning', icon: 'M12 2v20M2 12h20' },
          { id: 'vpn-rotation', label: 'Next_Rotation', value: '24m 12s', theme: 'success', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' }
        ].map(card => (
          <div class="t-panel glass-panel p-6 border-t-2 transition-all hover:bg-white/[0.03] group" style={`border-top-color: var(--${card.theme})`}>
            <div class="flex justify-between items-start mb-4">
              <span class="mono-xs font-black text-slate-500 uppercase tracking-widest">{card.label}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="opacity-20 group-hover:opacity-100 transition-opacity"><path d={card.icon}/></svg>
            </div>
            <span id={card.id} class="text-2xl font-black text-white italic tracking-tighter uppercase">{card.value}</span>
          </div>
        ))}
      </div>

      <div class="grid grid-cols-12 gap-6">
        <div class="col-span-12 lg:col-span-4">
          <div class="t-panel glass-panel p-8 bg-black/40 h-full border-t-2 border-primary/30">
            <header class="mb-10 flex items-center gap-4">
              <div class="w-2 h-8 bg-primary rounded-full"></div>
              <h3 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em]">Protocol_Steering</h3>
            </header>
            <anonymizer-controller></anonymizer-controller>
          </div>
        </div>

        <div class="col-span-12 lg:col-span-8">
          <div class="t-panel glass-panel p-0 bg-black/40 overflow-hidden h-full flex flex-col border-t-2 border-primary/30">
            <header class="p-8 border-b border-white/5 bg-black/40 flex justify-between items-center">
              <div class="flex items-center gap-4">
                <span class="dot active"></span>
                <span class="mono-xs font-black text-slate-500 uppercase tracking-widest">Active_Camouflage_Telemetry</span>
              </div>
              <div class="flex items-center gap-3">
                 <span class="mono-xs text-slate-700 font-bold">LATENCY: <span id="vpn-latency">42ms</span></span>
                 <div class="status-pill active px-6 py-2">LIVE_FEED</div>
              </div>
            </header>
            <div class="flex-grow p-10 relative overflow-hidden flex items-center justify-center min-h-[300px]">
               <div class="absolute inset-0 opacity-20 pointer-events-none">
                  <div class="w-full h-full bg-[radial-gradient(circle_at_center,var(--primary-glow)_0%,transparent_70%)]"></div>
                  <div class="absolute top-0 left-0 w-full h-full bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
               </div>

               <div class="text-center space-y-8 z-10">
                  <div class="relative inline-block">
                    <div class="text-7xl font-black text-primary italic tracking-[0.1em] opacity-10 blur-sm absolute inset-0">STEALTH</div>
                    <div class="text-7xl font-black text-white italic tracking-[0.1em] relative">STEALTH</div>
                  </div>
                  <div class="flex flex-col gap-4">
                    <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.8em] animate-pulse">Identity obfuscation engaged</p>
                    <div class="flex justify-center gap-2">
                      {[1,2,3,4,5].map(i => <div key={i} class="w-12 h-1 bg-primary/20 rounded-full overflow-hidden"><div class="h-full bg-primary animate-progress" style={`animation-delay: ${i*0.2}s`}></div></div>)}
                    </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* FIREWALL (ENFORCER) SECTION */}
    <section>
      <div class="flex items-center gap-6 mb-6 pb-4 border-b border-white/5">
         <div class="w-12 h-1.5 bg-danger rounded-full"></div>
         <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em]">02_FIREWALL_QUARANTINE_ENFORCEMENT</h2>
      </div>

      <div class="grid grid-cols-12 gap-6 mb-12">
        <div class="col-span-12 lg:col-span-4 space-y-6">
          <div class="t-panel glass-panel border-t-2 border-danger/30">
            <span class="metric-tag mb-6 block text-danger">Process_Identity</span>
            <div id="fw-pid" class="text-3xl font-black mb-2 font-mono text-white tabular-nums italic tracking-tighter">WAIT...</div>
            <p class="mono text-[9px] text-slate-500 font-bold uppercase">Active Blocker PID</p>
          </div>
          <div class="t-panel glass-panel border-t-2 border-danger/30">
            <span class="metric-tag mb-6 block text-danger">Blocked_Identities</span>
            <div id="fw-blocked-count" class="text-3xl font-black mb-2 font-mono text-white tabular-nums italic tracking-tighter">0</div>
            <p class="mono text-[9px] text-slate-500 font-bold uppercase">Total unique IP blocks</p>
          </div>
          {(props.userRole === "admin" || props.userRole === "operator") && (
          <div class="t-panel glass-panel border-t-2 border-slate-700">
            <span class="metric-tag mb-6 block">Perimeter_Controls</span>
            <div class="space-y-4">
               <input id="fw-block-input" type="text" placeholder="TARGET_IP_ADDR" class="w-full bg-black/60 border border-white/10 p-4 mono text-[11px] focus:border-danger outline-none text-white rounded-lg transition-colors" />
               <div class="grid grid-cols-2 gap-4">
                  <button type="button" onclick="const ip=document.getElementById('fw-block-input').value; fetch('/api/agents/firewall/block', { method: 'POST', headers: {'Content-Type': 'application/json', 'X-CT-Token': document.querySelector('meta[name=csrf-token]')?.content}, body: JSON.stringify({ip}) }).then(() => location.reload())" class="t-btn danger w-full py-4 text-[10px] uppercase font-black tracking-widest">Block_IP</button>
                  {props.userRole === "admin" && (
                  <button type="button" onclick="if(confirm('Flush all rules?')) fetch('/api/agents/firewall/flush', { method: 'POST', headers: {'X-CT-Token': document.querySelector('meta[name=csrf-token]')?.content} }).then(() => location.reload())" class="t-btn w-full py-4 text-[10px] uppercase font-black tracking-widest" style="background:transparent; border-color:var(--border-subtle);">Flush_All</button>
                  )}
               </div>
            </div>
          </div>
          )}
        </div>
        <div class="col-span-12 lg:col-span-8 t-panel glass-panel p-0 overflow-hidden border-t-2 border-danger/30">
          <header class="p-8 border-b border-white/5 bg-black/40 backdrop-blur-md flex justify-between items-center">
             <h3 class="tactical-title text-xl tracking-widest uppercase">Active Quarantine Ledger</h3>
             <span class="mono-xs text-slate-500 tracking-widest">REAL_TIME_SYNC</span>
          </header>
          <div id="fw-blocked-list" class="p-8 space-y-4 h-[440px] overflow-y-auto bg-black/40 custom-scrollbar">
             <div class="mono text-[10px] text-slate-600 uppercase p-8 text-center animate-pulse">Synchronizing_Ruleset...</div>
          </div>
        </div>
      </div>

      <div class="t-panel glass-panel p-0 overflow-hidden border-t-2 border-slate-700">
          <header class="p-8 border-b border-white/5 bg-black/40 flex justify-between items-center backdrop-blur-md">
             <h3 class="tactical-title text-xl tracking-widest uppercase">Real-Time Perimeter Traffic</h3>
             <div class="px-4 py-2 bg-primary/10 border border-primary/30 text-primary text-[10px] font-black tracking-widest uppercase rounded-full">PCAP_STREAM</div>
          </header>
          <div id="fw-traffic-list" class="p-8 space-y-2 h-[400px] overflow-y-auto bg-black/40 custom-scrollbar">
              <div class="mono text-[10px] text-slate-600 italic uppercase p-8 text-center animate-pulse">Awaiting packet signals...</div>
          </div>
      </div>
    </section>

    <firewall-agent></firewall-agent>
    <vpn-agent></vpn-agent>
  </Layout>
);

export const EbpfPage = (props: { csrfToken?: string, nonce?: string, userRole?: string }) => (
    <Layout title="Kernel Guardian" islandPaths={['/components/islands/EbpfAgent.js']} csrfToken={props.csrfToken} userRole={props.userRole}>
      <header class="flex justify-between items-end mb-12">
        <div class="flex items-center gap-6">
          <a href="/agents" class="w-16 h-16 flex items-center justify-center bg-white/5 border border-white/5 hover:border-primary/40 text-slate-500 hover:text-primary group">
             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="group-hover:-translate-x-1"><path d="m15 18-6-6 6-6"/></svg>
          </a>
          <div style="width:12px; height:60px; background:var(--primary); border-radius:4px; box-shadow:0 0 20px var(--primary-glow);"></div>
          <div class="flex flex-col gap-2">
            <h1 style="font-size:4rem; line-height:0.9; letter-spacing:-0.07em; font-weight:900; color:white; margin:0;">KERNEL GUARDIAN</h1>
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-2">
                <span class="dot active"></span>
                <span class="mono text-[10px] font-black text-primary tracking-[0.2em]">EBPF LSM ENFORCER</span>
              </div>
              <span class="text-slate-700">/</span>
              <div class="mono text-[10px] font-bold text-slate-500 tracking-[0.15em] uppercase">ZERO TRUST VERIFIED</div>
            </div>
          </div>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-4">
        <div class="col-span-12 lg:col-span-4 space-y-6">
          <div class="t-panel flex flex-col items-center p-8">
            <div id="ebpf-status-dot" class="w-16 h-16 bg-slate-800 mb-6 border-2 border-white/5"></div>
            <h3 id="ebpf-status-label" class="tactical-title" style="font-size:1.2rem;">OFFLINE</h3>
          </div>
          {(props.userRole === "admin" || props.userRole === "operator") && (
          <div class="t-panel">
            <span class="metric-tag mb-8 block">LSM_Directives</span>
            <button type="button" onclick="fetch('/api/agents/sentinel/command', {method:'POST', headers: {'X-CT-Token': document.querySelector('meta[name=csrf-token]')?.content}, body: JSON.stringify({type:'HIDE_PID'})})" class="t-btn w-full mb-4" style="background:transparent; border-color:var(--border-subtle);">Hide_Orchestrator_PID</button>
            <button type="button" onclick="fetch('/api/agents/sentinel/command', {method:'POST', headers: {'X-CT-Token': document.querySelector('meta[name=csrf-token]')?.content}, body: JSON.stringify({type:'RESTRICT_NETWORK'})})" class="t-btn w-full" style="background:transparent; border-color:var(--border-subtle);">Lockdown_Kernel_IO</button>
          </div>
          )}
        </div>
        <div class="col-span-12 lg:col-span-8 t-panel p-0 overflow-hidden">
          <header class="p-8 border-b border-white/5 bg-black/20">
             <h3 class="tactical-title" style="font-size:1rem;">KERNEL_EVENT_LEDGER</h3>
          </header>
          <div id="ebpf-event-log" class="p-8 space-y-3 h-[500px] overflow-y-auto bg-black/40 custom-scrollbar">
             <div class="mono text-[10px] text-slate-600 p-8 text-center uppercase">Awaiting_Kernel_Signals...</div>
          </div>
        </div>
      </div>
      <ebpf-agent></ebpf-agent>
    </Layout>
  );


  export const FimPage = (props: { csrfToken?: string, nonce?: string, userRole?: string }) => (
    <Layout title="File Integrity Monitor" islandPaths={['/components/islands/FimAgent.js']} csrfToken={props.csrfToken} userRole={props.userRole}>
        <div class="t-panel">FIM UI Placeholder</div>
    </Layout>
  );

  export const PcapPage = (props: { csrfToken?: string, nonce?: string, userRole?: string }) => (
    <Layout title="Packet Capture" islandPaths={['/components/islands/PcapAgent.js']} csrfToken={props.csrfToken} userRole={props.userRole}>
        <div class="t-panel">PCAP UI Placeholder</div>
    </Layout>
  );

  export const HoneypotPage = (props: { csrfToken?: string, nonce?: string, userRole?: string }) => (
    <Layout title="Honeypot Console" islandPaths={['/components/islands/HoneypotAgent.js']} csrfToken={props.csrfToken} userRole={props.userRole}>
        <div class="t-panel">Honeypot UI Placeholder</div>
    </Layout>
  );


/**
 * Mesh Agent Page
 * Peer discovery, mTLS gossip protocol, and distributed consensus.
 */
interface MeshStatus {
  mesh?: {
    nodes?: number;
  };
  [key: string]: unknown;
}

export const MeshPage = (props: { status: MeshStatus, csrfToken?: string, nonce?: string, userRole?: string }) => (
  <Layout title="Mesh Fabric" islandPaths={['/components/islands/VpnAgent.js', '/components/islands/MeshHeatmap.js']} csrfToken={props.csrfToken} userRole={props.userRole}>
    <header class="flex justify-between items-end mb-12">
      <div class="flex items-center gap-6">
        <a href="/agents" class="w-16 h-16 flex items-center justify-center bg-white/5 border border-white/5 hover:border-success/40 text-slate-500 hover:text-success group">
           <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="group-hover:-translate-x-1"><path d="m15 18-6-6 6-6"/></svg>
        </a>
        <div style="width:12px; height:60px; background:var(--success); border-radius:4px; box-shadow:0 0 20px var(--success-glow);"></div>
        <div class="flex flex-col gap-2">
          <h1 style="font-size:4rem; line-height:0.9; letter-spacing:-0.07em; font-weight:900; color:white; margin:0;">MESH FABRIC</h1>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="dot active" style="background:var(--success);"></span>
              <span class="mono text-[10px] font-black text-success tracking-[0.2em]">P2P GOSSIP NETWORK</span>
            </div>
            <span class="text-slate-700">/</span>
            <div class="mono text-[10px] font-bold text-slate-500 tracking-[0.15em] uppercase">QUORUM SYNCED</div>
          </div>
        </div>
      </div>
    </header>

    <div class="grid grid-cols-12 gap-8 mb-8">
       <div class="col-span-12 lg:col-span-8 t-panel p-0 overflow-hidden" style="height:500px;">
          <mesh-heatmap></mesh-heatmap>
       </div>
       <div class="col-span-12 lg:col-span-4 space-y-6">
          <div class="t-panel">
             <span class="metric-tag mb-8 block">Mesh_Health</span>
             <div class="text-4xl font-black text-white italic tracking-tighter mb-2">{props.status?.mesh?.nodes || 0} PEERS</div>
             <p class="mono text-[10px] text-slate-500 uppercase font-bold">Active in software quorum</p>
          </div>
          {(props.userRole === "admin" || props.userRole === "operator") && (
          <div class="t-panel">
             <span class="metric-tag mb-8 block">Control_Directives</span>
             <div class="space-y-4">
                <button type="button" onclick="fetch('/api/mesh/resync', {method:'POST', headers: {'X-CT-Token': document.querySelector('meta[name=csrf-token]')?.content}})" class="t-btn w-full">Broadcast Resync</button>
                {props.userRole === "admin" && (
                <button type="button" class="t-btn w-full danger" style="background:transparent; border-color:var(--danger); color:var(--danger);">Isolate Local Node</button>
                )}
             </div>
          </div>
          )}
       </div>
    </div>

    <div class="t-panel flex flex-col items-center justify-center p-20 text-center" style="background:radial-gradient(circle at center, hsla(var(--success-h), 100%, 50%, 0.05), transparent 70%);">
       <div class="w-24 h-24 border-2 border-success flex items-center justify-center mb-10 shadow-[0_0_40px_var(--success-glow)]">
          <div id="vpn-status-dot" class="w-12 h-12 bg-slate-800"></div>
       </div>
       <h3 id="vpn-status-label" class="text-4xl font-black uppercase tracking-tighter mb-4 italic text-white">SUBSYSTEM_OFFLINE</h3>
       <p id="vpn-status-details" class="mono text-xs font-bold text-slate-500 uppercase tracking-widest mb-12">Checking cryptographic handshakes...</p>
       
       <div class="grid grid-cols-2 gap-4 w-full max-w-2xl mb-12">
          <div class="t-panel" style="background:rgba(0,0,0,0.4);">
             <span class="metric-tag mb-4 block">Mesh_Peers</span>
             <p id="vpn-peer-count" class="text-3xl font-black mono text-white tabular-nums italic tracking-tighter">...</p>
          </div>
          <div class="t-panel" style="background:rgba(0,0,0,0.4);">
             <span class="metric-tag mb-4 block">Self_Node</span>
             <p id="vpn-self-node" class="text-lg font-black mono text-slate-400 uppercase truncate">ID_FETCHING...</p>
          </div>
       </div>

       <div class="flex gap-6">
          {(props.userRole === "admin" || props.userRole === "operator") && (
          <button type="button" id="vpn-connect-btn" class="t-btn" style="background:var(--success); color:black; padding: 1rem 3rem;">Link_Tunnel</button>
          )}
          {props.userRole === "admin" && (
          <button type="button" id="vpn-disconnect-btn" class="t-btn danger" style="padding: 1rem 3rem; background:transparent; border-color:var(--danger);">Sever_Link</button>
          )}
       </div>
    </div>

    <vpn-agent></vpn-agent>
  </Layout>
);
