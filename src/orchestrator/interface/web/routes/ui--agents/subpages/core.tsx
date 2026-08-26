import { jsx as _jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const FirewallPage = (props: { csrfToken?: string, nonce?: string, userRole?: string }) => (
  <Layout title="Perimeter Defense // Firewall & Tunnel" islandPaths={['/components/islands/FirewallAgent.js', '/components/islands/AnonymizerController.js', '/components/islands/VpnAgent.js', '/components/islands/Blocklist.js']} csrfToken={props.csrfToken} nonce={props.nonce} userRole={props.userRole}>
    <header class="flex justify-between items-end mb-5">
      <div class="flex items-center gap-4">
        <a href="/agents" class="w-16 h-16 flex items-center justify-center bg-white/5 border border-white/5 hover:border-danger/40 text-slate-500 hover:text-danger group transition-all">
           <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="group-hover:-translate-x-1"><path d="m15 18-6-6 6-6"/></svg>
        </a>
        <div class="hero-rule" data-state="crit"></div>
        <div class="flex flex-col gap-2">
          <h1 class="hero-title">PERIMETER & TUNNEL</h1>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="dot active" data-state="crit"></span>
              <span class="eyebrow" data-tone="danger">Firewall Enforcer Active</span>
            </div>
            <span class="text-slate-700">/</span>
            <div class="flex items-center gap-2">
              <span class="dot active" data-state="info"></span>
              <span class="eyebrow" data-tone="primary">Identity Anonymizer Online</span>
            </div>
          </div>
        </div>
      </div>
    </header>
    
    {/* ANONYMIZER (VPN) SECTION */}
    <section class="mb-5">
      <div class="flex items-center gap-4 mb-4 pb-4 border-b border-white/5">
         <div class="w-12 h-1.5 bg-primary rounded-full"></div>
         <h2 class="eyebrow">01_IDENTITY_CAMOUFLAGE_ROUTING</h2>
      </div>
      
      {/* Four cards reading WIREGUARD / EU-CENTRAL / MAXIMUM / 24m 12s used to
          sit here. They were literals, and they duplicated the ids the
          anonymizer island renders — the island scopes its updates with
          this.querySelector, so these never changed while the real readouts
          sat below them. <anonymizer-controller> now carries the only copy,
          fed by the vpn telemetry in the metrics payload. */}

      <div class="grid grid-cols-12 gap-4">
        <div class="col-span-12 lg:col-span-4">
          <div class="t-panel glass-panel p-4 bg-black/40 h-full border-t-2 border-primary/30">
            <header class="mb-5 flex items-center gap-4">
              <div class="w-2 h-8 bg-primary rounded-full"></div>
              <h3 class="eyebrow">Protocol_Steering</h3>
            </header>
            <anonymizer-controller></anonymizer-controller>
          </div>
        </div>

        <div class="col-span-12 lg:col-span-8">
          <div class="t-panel glass-panel p-0 bg-black/40 overflow-hidden h-full flex flex-col border-t-2 border-primary/30">
            <header class="p-4 border-b border-white/5 bg-black/40 flex justify-between items-center">
              <div class="flex items-center gap-4">
                <span class="dot active"></span>
                <span class="eyebrow">Active_Camouflage_Telemetry</span>
              </div>
              {/* A hardcoded "LATENCY: 42ms" sat here that nothing ever
                  updated. Real egress latency is the current node's ping,
                  which <anonymizer-controller> reports from telemetry. */}
              <div class="flex items-center gap-3">
                 <div class="pill" data-state="ok" data-dot="live">Live feed</div>
              </div>
            </header>
            <div class="flex-grow p-5 relative overflow-hidden flex items-center justify-center min-h-[300px]">
               <div class="absolute inset-0 opacity-20 pointer-events-none">
                  <div class="w-full h-full bg-[radial-gradient(circle_at_center,var(--primary-glow)_0%,transparent_70%)]"></div>
                  <div class="absolute top-0 left-0 w-full h-full bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
               </div>

               <div class="text-center space-y-4 z-10">
                  <div class="relative inline-block">
                    <div class="text-7xl font-black text-primary italic tracking-[0.1em] opacity-10 blur-sm absolute inset-0">STEALTH</div>
                    <div class="text-7xl font-black text-white italic tracking-[0.1em] relative">STEALTH</div>
                  </div>
                  <div class="flex flex-col gap-4">
                    <p class="eyebrow animate-pulse">Identity obfuscation engaged</p>
                    <div class="flex justify-center gap-2">
                      {["stagger-1", "stagger-2", "stagger-3", "stagger-4", "stagger-5"].map((delay) => <div key={delay} class="w-12 h-1 bg-primary/20 rounded-full overflow-hidden"><div class={"h-full bg-primary animate-progress " + delay}></div></div>)}
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
      <div class="flex items-center gap-4 mb-4 pb-4 border-b border-white/5">
         <div class="w-12 h-1.5 bg-danger rounded-full"></div>
         <h2 class="eyebrow">02_FIREWALL_QUARANTINE_ENFORCEMENT</h2>
      </div>

      <div class="grid grid-cols-12 gap-4 mb-5">
        <div class="col-span-12 lg:col-span-4 space-y-4">
          <div class="t-panel glass-panel border-t-2 border-danger/30">
            <span class="metric-tag mb-4 block text-danger">Process_Identity</span>
            <div id="fw-pid" class="text-3xl font-black mb-2 font-mono text-white tabular-nums tracking-tighter">WAIT...</div>
            <p class="eyebrow">Active Blocker PID</p>
          </div>
          <div class="t-panel glass-panel border-t-2 border-danger/30">
            <span class="metric-tag mb-4 block text-danger">Blocked_Identities</span>
            <div id="fw-blocked-count" class="text-3xl font-black mb-2 font-mono text-white tabular-nums tracking-tighter">0</div>
            <p class="eyebrow">Total unique IP blocks</p>
          </div>
          {(props.userRole === "admin" || props.userRole === "operator") && (
          <div class="t-panel glass-panel border-t-2 border-slate-700">
            <span class="metric-tag mb-4 block">Perimeter_Controls</span>
            <div class="space-y-4">
               <input id="fw-block-input" type="text" placeholder="TARGET_IP_ADDR" class="input" />
               <div class="grid grid-cols-2 gap-4">
                  <button type="button" data-action="post" data-url="/api/agents/firewall/block" data-input="fw-block-input" data-field="ip" data-reload class="t-btn danger w-full py-4 text-[10px] uppercase font-black tracking-widest">Block_IP</button>
                  {props.userRole === "admin" && (
                  <button type="button" data-action="post" data-url="/api/agents/firewall/flush" data-confirm="Flush all firewall rules?" data-reload class="t-btn w-full py-4 text-[10px] uppercase font-black tracking-widest ghost">Flush_All</button>
                  )}
               </div>
            </div>
          </div>
          )}
        </div>

        {/* The ledger was a div that FirewallAgent.js filled from
            metrics.firewall.blockedIps — capped at 20 by emitMetrics — or, when
            that was empty, from a regex over raw iptables stdout. It showed bare
            addresses and nothing else. <block-list> reads the enforcement
            records themselves: reason, age, and TTL. */}
        <div class="col-span-12 lg:col-span-8 t-panel glass-panel border-t-2 border-danger/30">
          <block-list role-name={props.userRole}></block-list>
        </div>
      </div>

      <div class="t-panel glass-panel p-0 overflow-hidden border-t-2 border-slate-700">
          <header class="p-4 border-b border-white/5 bg-black/40 flex justify-between items-center backdrop-blur-md">
             <h3 class="tactical-title text-xl tracking-widest uppercase">Real-Time Perimeter Traffic</h3>
             <div class="px-4 py-2 bg-primary/10 border border-primary/30 text-primary text-[10px] font-black tracking-widest uppercase rounded-full">PCAP_STREAM</div>
          </header>
          <div id="fw-traffic-list" class="p-4 space-y-2 h-[400px] overflow-y-auto bg-black/40 custom-scrollbar">
              <div class="eyebrow italic p-4 text-center animate-pulse">Awaiting packet signals...</div>
          </div>
      </div>
    </section>

    <firewall-agent></firewall-agent>
    <vpn-agent></vpn-agent>
  </Layout>
);

export const EbpfPage = (props: { csrfToken?: string, nonce?: string, userRole?: string }) => (
    <Layout title="Kernel Guardian" islandPaths={['/components/islands/EbpfAgent.js']} csrfToken={props.csrfToken} nonce={props.nonce} userRole={props.userRole}>
      <header class="flex justify-between items-end mb-5">
        <div class="flex items-center gap-4">
          <a href="/agents" class="w-16 h-16 flex items-center justify-center bg-white/5 border border-white/5 hover:border-primary/40 text-slate-500 hover:text-primary group">
             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="group-hover:-translate-x-1"><path d="m15 18-6-6 6-6"/></svg>
          </a>
          <div class="hero-rule" data-state="info"></div>
          <div class="flex flex-col gap-2">
            <h1 class="hero-title">KERNEL GUARDIAN</h1>
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-2">
                <span class="dot active"></span>
                <span class="mono text-[10px] font-black text-primary tracking-[0.2em]">EBPF LSM ENFORCER</span>
              </div>
              <span class="text-slate-700">/</span>
              <div class="eyebrow">ZERO TRUST VERIFIED</div>
            </div>
          </div>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-4">
        <div class="col-span-12 lg:col-span-4 space-y-4">
          <div class="t-panel flex flex-col items-center p-4">
            <div id="ebpf-status-dot" class="w-16 h-16 bg-slate-800 mb-4 border-2 border-white/5"></div>
            <h3 id="ebpf-status-label" class="tactical-title" >OFFLINE</h3>
          </div>
          {(props.userRole === "admin" || props.userRole === "operator") && (
          <div class="t-panel">
            <span class="metric-tag mb-4 block">LSM_Directives</span>
            <button type="button" data-action="post" data-url="/api/agents/sentinel/command" data-body='{"type":"HIDE_PID"}' class="t-btn w-full mb-4 ghost">Hide_Orchestrator_PID</button>
            <button type="button" data-action="post" data-url="/api/agents/sentinel/command" data-body='{"type":"RESTRICT_NETWORK"}' class="t-btn w-full ghost">Lockdown_Kernel_IO</button>
          </div>
          )}
        </div>
        <div class="col-span-12 lg:col-span-8 t-panel p-0 overflow-hidden">
          <header class="p-4 border-b border-white/5 bg-black/20">
             <h3 class="tactical-title" >KERNEL_EVENT_LEDGER</h3>
          </header>
          <div id="ebpf-event-log" class="p-4 space-y-3 h-[500px] overflow-y-auto bg-black/40 custom-scrollbar">
             <div class="eyebrow p-4 text-center">Awaiting_Kernel_Signals...</div>
          </div>
        </div>
      </div>
      <ebpf-agent></ebpf-agent>
    </Layout>
  );


  export const FimPage = (props: { csrfToken?: string, nonce?: string, userRole?: string }) => (
    <Layout title="File Integrity Monitor" islandPaths={['/components/islands/FimAgent.js']} csrfToken={props.csrfToken} nonce={props.nonce} userRole={props.userRole}>
        <div class="t-panel">FIM UI Placeholder</div>
    </Layout>
  );

  export const PcapPage = (props: { csrfToken?: string, nonce?: string, userRole?: string }) => (
    <Layout title="Packet Capture" islandPaths={['/components/islands/PcapAgent.js']} csrfToken={props.csrfToken} nonce={props.nonce} userRole={props.userRole}>
        <div class="t-panel">PCAP UI Placeholder</div>
    </Layout>
  );

  export const HoneypotPage = (props: { csrfToken?: string, nonce?: string, userRole?: string }) => (
    <Layout title="Honeypot Console" islandPaths={['/components/islands/HoneypotAgent.js']} csrfToken={props.csrfToken} nonce={props.nonce} userRole={props.userRole}>
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
  <Layout title="Mesh Fabric" islandPaths={['/components/islands/VpnAgent.js', '/components/islands/MeshHeatmap.js']} csrfToken={props.csrfToken} nonce={props.nonce} userRole={props.userRole}>
    <header class="flex justify-between items-end mb-5">
      <div class="flex items-center gap-4">
        <a href="/agents" class="w-16 h-16 flex items-center justify-center bg-white/5 border border-white/5 hover:border-success/40 text-slate-500 hover:text-success group">
           <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="group-hover:-translate-x-1"><path d="m15 18-6-6 6-6"/></svg>
        </a>
        <div class="hero-rule" data-state="ok"></div>
        <div class="flex flex-col gap-2">
          <h1 class="hero-title">MESH FABRIC</h1>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="dot active" data-state="ok"></span>
              <span class="mono text-[10px] font-black text-success tracking-[0.2em]">P2P GOSSIP NETWORK</span>
            </div>
            <span class="text-slate-700">/</span>
            <div class="eyebrow">QUORUM SYNCED</div>
          </div>
        </div>
      </div>
    </header>

    <div class="grid grid-cols-12 gap-4 mb-4">
       <div class="col-span-12 lg:col-span-8 t-panel p-0 overflow-hidden stage-500" >
          <mesh-heatmap></mesh-heatmap>
       </div>
       <div class="col-span-12 lg:col-span-4 space-y-4">
          <div class="t-panel">
             <span class="metric-tag mb-4 block">Mesh_Health</span>
             <div class="text-4xl font-black text-white tracking-tighter mb-2">{props.status?.mesh?.nodes || 0} PEERS</div>
             <p class="eyebrow">Active in software quorum</p>
          </div>
          {(props.userRole === "admin" || props.userRole === "operator") && (
          <div class="t-panel">
             <span class="metric-tag mb-4 block">Control_Directives</span>
             <div class="space-y-4">
                <button type="button" data-action="post" data-url="/api/mesh/resync" class="t-btn w-full">Broadcast Resync</button>
                {props.userRole === "admin" && (
                <button type="button" class="t-btn w-full danger ghost">Isolate Local Node</button>
                )}
             </div>
          </div>
          )}
       </div>
    </div>

    <div class="t-panel flex flex-col items-center justify-center p-6 text-center wash-radial"  data-state="ok">
       <div class="w-24 h-24 border-2 border-success flex items-center justify-center mb-5 shadow-[0_0_40px_var(--success-glow)]">
          <div id="vpn-status-dot" class="w-12 h-12 bg-slate-800"></div>
       </div>
       <h3 id="vpn-status-label" class="text-4xl font-black uppercase tracking-tighter mb-4 text-white">SUBSYSTEM_OFFLINE</h3>
       <p id="vpn-status-details" class="eyebrow mb-5">Checking cryptographic handshakes...</p>
       
       <div class="grid grid-cols-2 gap-4 w-full max-w-2xl mb-5">
          <div class="t-panel wash-sunken" >
             <span class="metric-tag mb-4 block">Mesh_Peers</span>
             <p id="vpn-peer-count" class="text-3xl font-black mono text-white tabular-nums tracking-tighter">...</p>
          </div>
          <div class="t-panel wash-sunken" >
             <span class="metric-tag mb-4 block">Self_Node</span>
             <p id="vpn-self-node" class="eyebrow text-lg truncate">ID_FETCHING...</p>
          </div>
       </div>

       <div class="flex gap-4">
          {(props.userRole === "admin" || props.userRole === "operator") && (
          <button type="button" id="vpn-connect-btn" class="t-btn solid success btn--roomy">Link_Tunnel</button>
          )}
          {props.userRole === "admin" && (
          <button type="button" id="vpn-disconnect-btn" class="t-btn danger ghost btn--roomy">Sever_Link</button>
          )}
       </div>
    </div>

    <vpn-agent></vpn-agent>
  </Layout>
);
