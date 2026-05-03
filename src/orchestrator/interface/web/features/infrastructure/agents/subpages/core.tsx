import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const FirewallPage = () => (
  <Layout title="Firewall Agent" islandPaths={['/components/islands/FirewallAgent.js']}>
    <header class="flex justify-between items-end mb-12">
      <div class="flex items-center gap-6">
        <div style="width:12px; height:60px; background:var(--danger); border-radius:4px; box-shadow:0 0 20px var(--danger-glow);"></div>
        <div class="flex flex-col gap-2">
          <h1 style="font-size:4rem; line-height:0.9; letter-spacing:-0.07em; font-weight:900; color:white; margin:0;">FIREWALL_ENFORCER</h1>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="dot active" style="background:var(--danger);"></span>
              <span class="mono text-[10px] font-black text-danger tracking-[0.2em]">KERNEL_BLOCKER_ACTIVE</span>
            </div>
            <span class="text-slate-700">/</span>
            <div class="mono text-[10px] font-bold text-slate-500 tracking-[0.15em] uppercase">QUARANTINE_READY</div>
          </div>
        </div>
      </div>
    </header>
    
    <div class="grid grid-cols-12 gap-8 mb-12">
      <div class="col-span-12 lg:col-span-4 space-y-8">
        <div class="t-panel">
          <span class="metric-tag mb-6 block">Process_Identity</span>
          <div id="fw-pid" class="text-3xl font-black mb-2 font-mono text-white tabular-nums italic tracking-tighter">WAIT...</div>
          <p class="mono text-[9px] text-slate-500 font-bold uppercase">Active Blocker PID</p>
        </div>
        <div class="t-panel">
          <span class="metric-tag mb-6 block">Blocked_Identities</span>
          <div id="fw-blocked-count" class="text-3xl font-black mb-2 font-mono text-white tabular-nums italic tracking-tighter">0</div>
          <p class="mono text-[9px] text-slate-500 font-bold uppercase">Total unique IP blocks</p>
        </div>
        <div class="t-panel">
          <span class="metric-tag mb-6 block">Perimeter_Controls</span>
          <div class="space-y-4">
             <input id="fw-block-input" type="text" placeholder="TARGET_IP_ADDR" class="w-full bg-black/60 border border-white/10 p-4 mono text-[11px] focus:border-danger outline-none transition-all text-white" />
             <div class="grid grid-cols-2 gap-4">
                <button onclick="const ip=document.getElementById('fw-block-input').value; fetch('/api/agents/firewall/block', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ip}) }).then(() => location.reload())" class="t-btn danger" style="padding:1rem;">Block_IP</button>
                <button onclick="if(confirm('Flush all rules?')) fetch('/api/agents/firewall/flush', { method: 'POST' }).then(() => location.reload())" class="t-btn" style="padding:1rem; background:transparent; border-color:var(--border-subtle);">Flush_All</button>
             </div>
          </div>
        </div>
      </div>
      <div class="col-span-12 lg:col-span-8 t-panel p-0 overflow-hidden">
        <header class="p-8 border-b border-white/5 bg-black/20">
           <h3 class="tactical-title" style="font-size:1rem;">ACTIVE_QUARANTINE_LEDGER</h3>
        </header>
        <div id="fw-blocked-list" class="p-8 space-y-4 h-[400px] overflow-y-auto bg-black/40">
           <div class="mono text-[10px] text-slate-600 animate-pulse uppercase p-12 text-center">Synchronizing_Ruleset...</div>
        </div>
      </div>
    </div>

    <div class="t-panel p-0 overflow-hidden">
        <header class="p-8 border-b border-white/5 bg-black/20 flex justify-between items-center">
           <h3 class="tactical-title" style="font-size:1rem;">REAL-TIME_PERIMETER_TRAFFIC</h3>
           <div class="px-3 py-1 bg-primary/10 border border-primary/30 text-primary text-[9px] font-black tracking-widest uppercase">PCAP_STREAM</div>
        </header>
        <div id="fw-traffic-list" class="p-8 space-y-2 h-[400px] overflow-y-auto bg-black/40">
            <div class="mono text-[10px] text-slate-600 italic uppercase p-12 text-center">Awaiting packet signals...</div>
        </div>
    </div>
    <firewall-agent></firewall-agent>
  </Layout>
);

export const FimPage = () => (
  <Layout title="Sentinel Monitor" islandPaths={['/components/islands/FimAgent.js']}>
    <header class="flex justify-between items-end mb-12">
      <div class="flex items-center gap-6">
        <div style="width:12px; height:60px; background:var(--primary); border-radius:4px; box-shadow:0 0 20px var(--primary-glow);"></div>
        <div class="flex flex-col gap-2">
          <h1 style="font-size:4rem; line-height:0.9; letter-spacing:-0.07em; font-weight:900; color:white; margin:0;">SENTINEL_MONITOR</h1>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="dot active"></span>
              <span class="mono text-[10px] font-black text-primary tracking-[0.2em]">FILE_INTEGRITY_WATCH</span>
            </div>
            <span class="text-slate-700">/</span>
            <div class="mono text-[10px] font-bold text-slate-500 tracking-[0.15em] uppercase">INODE_LOCK_SYNCED</div>
          </div>
        </div>
      </div>
    </header>

    <div class="t-panel p-0 overflow-hidden">
      <header class="p-8 border-b border-white/5 bg-black/20">
         <h3 class="tactical-title" style="font-size:1rem;">INTEGRITY_VIOLATION_LEDGER</h3>
      </header>
      <div id="fim-alerts" class="p-8 space-y-4 h-[500px] overflow-y-auto bg-black/40">
        <div class="mono text-[10px] text-slate-600 animate-pulse p-12 text-center uppercase">Awaiting_Integrity_Signals...</div>
      </div>
    </div>
    <fim-agent></fim-agent>
  </Layout>
);

export const PcapPage = () => (
  <Layout title="Interceptor DPI" islandPaths={['/components/islands/PcapAgent.js']}>
    <header class="flex justify-between items-end mb-12">
      <div class="flex items-center gap-6">
        <div style="width:12px; height:60px; background:var(--primary); border-radius:4px; box-shadow:0 0 20px var(--primary-glow);"></div>
        <div class="flex flex-col gap-2">
          <h1 style="font-size:4rem; line-height:0.9; letter-spacing:-0.07em; font-weight:900; color:white; margin:0;">INTERCEPTOR_DPI</h1>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="dot active"></span>
              <span class="mono text-[10px] font-black text-primary tracking-[0.2em]">DEEP_PACKET_INSPECTION</span>
            </div>
            <span class="text-slate-700">/</span>
            <div class="mono text-[10px] font-bold text-slate-500 tracking-[0.15em] uppercase">MESH_TRAFFIC_MONITOR</div>
          </div>
        </div>
      </div>
    </header>

    <div class="grid grid-cols-12 gap-8">
       <div class="col-span-12 lg:col-span-4 space-y-6">
          <div class="t-panel">
             <span class="metric-tag mb-8 block">Capture_Controls</span>
             <div class="space-y-4">
                <input id="pcap-iface" type="text" placeholder="INTERFACE (any)" class="w-full bg-black/60 border border-white/10 p-4 mono text-[11px] text-white" />
                <input id="pcap-filter" type="text" placeholder="BPF_FILTER_EXPR" class="w-full bg-black/60 border border-white/10 p-4 mono text-[11px] text-white" />
                <button onclick="document.querySelector('pcap-agent').startCapture()" class="t-btn w-full" style="background:var(--primary); color:black; padding:1.2rem;">Execute_Capture</button>
             </div>
          </div>
       </div>
       <div class="col-span-12 lg:col-span-8 t-panel p-0 overflow-hidden">
          <header class="p-8 border-b border-white/5 bg-black/20">
             <h3 class="tactical-title" style="font-size:1rem;">LIVE_INSPECTION_STREAM</h3>
          </header>
          <div id="pcap-stream" class="p-8 h-[600px] overflow-y-auto space-y-2 bg-black/40">
             <div class="mono text-[10px] text-slate-600 animate-pulse p-12 text-center uppercase">Awaiting_Packet_Intercepts...</div>
          </div>
       </div>
    </div>
    <pcap-agent></pcap-agent>
  </Layout>
);

export const HoneypotPage = () => (
  <Layout title="Deception Grid" islandPaths={['/components/islands/HoneypotChart.js']}>
    <header class="flex justify-between items-end mb-12">
      <div class="flex items-center gap-6">
        <div style="width:12px; height:60px; background:var(--warning); border-radius:4px; box-shadow:0 0 20px var(--warning-glow);"></div>
        <div class="flex flex-col gap-2">
          <h1 style="font-size:4rem; line-height:0.9; letter-spacing:-0.07em; font-weight:900; color:white; margin:0;">DECEPTION_GRID</h1>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="dot active" style="background:var(--warning);"></span>
              <span class="mono text-[10px] font-black text-warning tracking-[0.2em]">ACTIVE_DECOY_ARRAY</span>
            </div>
            <span class="text-slate-700">/</span>
            <div class="mono text-[10px] font-bold text-slate-500 tracking-[0.15em] uppercase">ADVERSARY_PROFILING</div>
          </div>
        </div>
      </div>
    </header>

    <div class="grid grid-cols-12 gap-8 mb-12">
       <div class="col-span-12 lg:col-span-8 t-panel p-0 overflow-hidden">
          <header class="p-8 border-b border-white/5 bg-black/20">
             <h3 class="tactical-title" style="font-size:1rem;">INTERACTION_VOLUME_TELEMETRY</h3>
          </header>
          <div class="p-8 bg-black/40 min-h-[400px]">
             <honeypot-chart></honeypot-chart>
          </div>
       </div>
       <div class="col-span-12 lg:col-span-4 space-y-8">
          <div class="t-panel">
             <span class="metric-tag mb-8 block">Tactical_Controls</span>
             <div class="space-y-4">
                <button onclick="fetch('/api/agents/honeypot/command', {method:'POST', body: JSON.stringify({type:'Sabotage', source_ip: 'GLOBAL', level: 'HIGH'})})" class="t-btn danger w-full" style="padding:1.5rem; background:transparent; border-color:var(--danger); color:var(--danger); font-style:italic;">Engage_Active_Sabotage</button>
                <button class="t-btn w-full" style="background:transparent; border-color:var(--border-subtle); padding:1.2rem;">Morph_Trap_Architecture</button>
             </div>
          </div>
          <div class="t-panel">
             <span class="metric-tag mb-4 block">Active_Decoys</span>
             <div class="space-y-2">
                <div class="flex justify-between items-center py-2 border-b border-white/5">
                   <span class="mono text-[10px] text-slate-500 uppercase">SSH_Shadow</span>
                   <span class="dot active"></span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-white/5">
                   <span class="mono text-[10px] text-slate-500 uppercase">Telnet_Void</span>
                   <span class="dot active"></span>
                </div>
                <div class="flex justify-between items-center py-2">
                   <span class="mono text-[10px] text-slate-500 uppercase">HTTP_Labyrinth</span>
                   <span class="dot active"></span>
                </div>
             </div>
          </div>
       </div>
    </div>
  </Layout>
);

export const VpnPage = () => (
  <Layout title="VPN Tunnels" islandPaths={['/components/islands/VpnAgent.js']}>
    <header class="flex justify-between items-end mb-12">
      <div class="flex items-center gap-6">
        <div style="width:12px; height:60px; background:var(--success); border-radius:4px; box-shadow:0 0 20px var(--success-glow);"></div>
        <div class="flex flex-col gap-2">
          <h1 style="font-size:4rem; line-height:0.9; letter-spacing:-0.07em; font-weight:900; color:white; margin:0;">SECURE_TUNNELS</h1>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="dot active" style="background:var(--success);"></span>
              <span class="mono text-[10px] font-black text-success tracking-[0.2em]">WIREGUARD_MESH_ACTIVE</span>
            </div>
            <span class="text-slate-700">/</span>
            <div class="mono text-[10px] font-bold text-slate-500 tracking-[0.15em] uppercase">BACKHAUL: SYNCED</div>
          </div>
        </div>
      </div>
    </header>

    <div class="t-panel flex flex-col items-center justify-center p-20 text-center" style="background:radial-gradient(circle at center, hsla(var(--success-h), 100%, 50%, 0.05), transparent 70%);">
       <div class="w-24 h-24 border-2 border-success flex items-center justify-center mb-10 shadow-[0_0_40px_var(--success-glow)]">
          <div id="vpn-status-dot" class="w-12 h-12 bg-slate-800 animate-pulse"></div>
       </div>
       <h3 id="vpn-status-label" class="text-4xl font-black uppercase tracking-tighter mb-4 italic text-white">SUBSYSTEM_OFFLINE</h3>
       <p id="vpn-status-details" class="mono text-xs font-bold text-slate-500 uppercase tracking-widest mb-12">Checking cryptographic handshakes...</p>
       
       <div class="grid grid-cols-2 gap-8 w-full max-w-2xl mb-12">
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
          <button id="vpn-connect-btn" class="t-btn" style="background:var(--success); color:black; padding: 1rem 3rem;">Link_Tunnel</button>
          <button id="vpn-disconnect-btn" class="t-btn danger" style="padding: 1rem 3rem; background:transparent; border-color:var(--danger);">Sever_Link</button>
       </div>
    </div>
    <vpn-agent></vpn-agent>
  </Layout>
);

export const EbpfPage = () => (
  <Layout title="Kernel Guardian" islandPaths={['/components/islands/EbpfAgent.js']}>
    <header class="flex justify-between items-end mb-12">
      <div class="flex items-center gap-6">
        <div style="width:12px; height:60px; background:var(--primary); border-radius:4px; box-shadow:0 0 20px var(--primary-glow);"></div>
        <div class="flex flex-col gap-2">
          <h1 style="font-size:4rem; line-height:0.9; letter-spacing:-0.07em; font-weight:900; color:white; margin:0;">KERNEL_GUARDIAN</h1>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="dot active"></span>
              <span class="mono text-[10px] font-black text-primary tracking-[0.2em]">EBPF_LSM_ENFORCER</span>
            </div>
            <span class="text-slate-700">/</span>
            <div class="mono text-[10px] font-bold text-slate-500 tracking-[0.15em] uppercase">ZERO_TRUST_VERIFIED</div>
          </div>
        </div>
      </div>
    </header>

    <div class="grid grid-cols-12 gap-8">
      <div class="col-span-12 lg:col-span-4 space-y-6">
        <div class="t-panel flex flex-col items-center p-12">
          <div id="ebpf-status-dot" class="w-16 h-16 bg-slate-800 mb-6 border-2 border-white/5"></div>
          <h3 id="ebpf-status-label" class="tactical-title" style="font-size:1.2rem;">OFFLINE</h3>
        </div>
        <div class="t-panel">
          <span class="metric-tag mb-8 block">LSM_Directives</span>
          <button onclick="fetch('/api/agents/ebpf/command', {method:'POST', body: JSON.stringify({type:'HIDE_PID'})})" class="t-btn w-full mb-4" style="background:transparent; border-color:var(--border-subtle);">Hide_Orchestrator_PID</button>
          <button onclick="fetch('/api/agents/ebpf/command', {method:'POST', body: JSON.stringify({type:'RESTRICT_NETWORK'})})" class="t-btn w-full" style="background:transparent; border-color:var(--border-subtle);">Lockdown_Kernel_IO</button>
        </div>
      </div>
      <div class="col-span-12 lg:col-span-8 t-panel p-0 overflow-hidden">
        <header class="p-8 border-b border-white/5 bg-black/20">
           <h3 class="tactical-title" style="font-size:1rem;">KERNEL_EVENT_LEDGER</h3>
        </header>
        <div id="ebpf-event-log" class="p-8 space-y-3 h-[500px] overflow-y-auto bg-black/40 custom-scrollbar">
           <div class="mono text-[10px] text-slate-600 animate-pulse p-12 text-center uppercase">Awaiting_Kernel_Signals...</div>
        </div>
      </div>
    </div>
    <ebpf-agent></ebpf-agent>
  </Layout>
);

export const ScannerPage = () => (
  <Layout title="Vulnerability Scanner" islandPaths={['/components/islands/ScannerAgent.js']}>
    <header class="flex justify-between items-end mb-12">
      <div class="flex items-center gap-6">
        <div style="width:12px; height:60px; background:var(--primary); border-radius:4px; box-shadow:0 0 20px var(--primary-glow);"></div>
        <div class="flex flex-col gap-2">
          <h1 style="font-size:4rem; line-height:0.9; letter-spacing:-0.07em; font-weight:900; color:white; margin:0;">SEC_VULN_SCANNER</h1>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="dot active"></span>
              <span class="mono text-[10px] font-black text-primary tracking-[0.2em]">AUTONOMOUS_AUDIT</span>
            </div>
            <span class="text-slate-700">/</span>
            <div class="mono text-[10px] font-bold text-slate-500 tracking-[0.15em] uppercase">INTEGRITY_VERIFIED</div>
          </div>
        </div>
      </div>
      <button id="btn-run-scan" class="t-btn" style="background:var(--primary); color:black; font-size:11px; padding: 1.2rem 3rem;">Execute_Full_Audit</button>
    </header>

    <div class="t-panel p-0 overflow-hidden">
      <header class="p-8 border-b border-white/5 bg-black/20">
        <h3 class="tactical-title" style="font-size:1rem;">AUDIT_RESULT_MANIFEST</h3>
      </header>
      <div id="scanner-results" class="p-12 mono text-xs text-slate-400 bg-black/40 min-h-[500px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
        <span class="text-slate-600 opacity-50 uppercase italic font-black">Awaiting initialization of Scanner sidecar...</span>
      </div>
    </div>
    <scanner-agent></scanner-agent>
  </Layout>
);
