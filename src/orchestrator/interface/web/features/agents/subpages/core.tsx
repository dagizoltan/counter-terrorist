import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const FirewallPage = () => (
  <Layout title="Firewall Agent" islandPaths={['/components/islands/FirewallAgent.js']}>
    <div class="mb-12">
      <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Firewall Enforcer</h2>
      <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Kernel-level packet filtering // Active quarantine</p>
    </div>
    
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
      <div class="lg:col-span-1 space-y-8">
        <div class="bg-white/5 border border-white/5 p-8">
          <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6">Process Identity</h3>
          <div id="fw-pid" class="text-3xl font-black mb-2 font-mono text-cyber">...</div>
          <p class="text-[9px] text-slate-500 font-bold uppercase">Active Blocker PID</p>
        </div>
        <div class="bg-white/5 border border-white/5 p-8">
          <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6">Blocked Identities</h3>
          <div id="fw-blocked-count" class="text-3xl font-black mb-2">...</div>
          <p class="text-[9px] text-slate-500 font-bold uppercase">Total unique IP blocks</p>
        </div>
        <div class="bg-white/5 border border-white/5 p-8">
          <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6">Perimeter Controls</h3>
          <div class="space-y-4">
             <input id="fw-block-input" type="text" placeholder="TARGET_IP" class="w-full bg-black/60 border border-white/10 rounded p-2 text-[10px] font-mono focus:border-red-500 outline-none transition-all text-white" />
             <div class="grid grid-cols-2 gap-2">
                <button onclick="const ip=document.getElementById('fw-block-input').value; fetch('/api/agents/firewall/block', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ip}) }).then(() => location.reload())" class="py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 text-[8px] font-black uppercase tracking-widest transition-all">Block_IP</button>
                <button onclick="if(confirm('Flush all rules?')) fetch('/api/agents/firewall/flush', { method: 'POST' }).then(() => location.reload())" class="py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-[8px] font-black uppercase tracking-widest transition-all">Flush_All</button>
             </div>
          </div>
        </div>
      </div>
      <div class="lg:col-span-2 bg-white/5 border border-white/5 p-8">
        <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 pb-2 border-b border-white/5">Active Quarantined IPs</h3>
        <div id="fw-blocked-list" class="space-y-2 font-mono text-xs max-h-[300px] overflow-y-auto">
          <p class="text-slate-500 text-[9px]">Loading firewall state...</p>
        </div>
      </div>
    </div>

    <div class="bg-white/5 border border-white/5 p-8 mb-12">
        <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6 pb-2 border-b border-white/5">Real-time Perimeter Traffic (PCAP_STREAM)</h3>
        <div id="fw-traffic-list" class="space-y-1">
            <p class="text-slate-500 text-[9px] italic">Awaiting packet stream...</p>
        </div>
    </div>
    <firewall-agent></firewall-agent>
  </Layout>
);

export const VpnPage = () => (
  <Layout title="VPN Tunnels" islandPaths={['/components/islands/VpnAgent.js']}>
    <div class="mb-12">
      <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Cryptographic Tunnels</h2>
      <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">WireGuard encryption // Secure mesh backhaul</p>
    </div>
    <div class="bg-white/5 border border-white/5 p-12 text-center">
       <div class="w-16 h-16 border-2 border-green-500 flex items-center justify-center mx-auto mb-6">
          <div id="vpn-status-dot" class="w-8 h-8 bg-slate-600 rounded-full"></div>
       </div>
       <h3 id="vpn-status-label" class="text-2xl font-black uppercase tracking-tight mb-2">Checking...</h3>
       <p id="vpn-status-details" class="text-slate-500 text-xs font-bold uppercase mb-8">Querying VPN subsystem...</p>
       <div class="max-w-md mx-auto grid grid-cols-2 gap-4 mb-8">
          <div class="p-4 bg-black/40 border border-white/5">
             <p class="text-[9px] text-slate-500 font-black uppercase mb-1">Mesh Peers</p>
             <p id="vpn-peer-count" class="text-lg font-bold">...</p>
          </div>
          <div class="p-4 bg-black/40 border border-white/5">
             <p class="text-[9px] text-slate-500 font-black uppercase mb-1">Self Node</p>
             <p id="vpn-self-node" class="text-lg font-bold">...</p>
          </div>
       </div>
       <div class="flex justify-center gap-4">
          <button onclick="const t=document.querySelector('meta[name=\'csrf-token\']').content; fetch('/api/agents/vpn/connect', {method:'POST', headers: {'X-CT-Token': t}, body: JSON.stringify({})}).then(r => r.json()).then(d => alert(d.message || 'Connected'))" class="px-8 py-3 bg-green-500/10 border border-green-500/20 text-green-500 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-green-500/20 transition-all">Link_Tunnel</button>
          <button onclick="const t=document.querySelector('meta[name=\'csrf-token\']').content; fetch('/api/agents/vpn/disconnect', {method:'POST', headers: {'X-CT-Token': t}}).then(r => r.json()).then(d => alert(d.message || 'Disconnected'))" class="px-8 py-3 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-500/20 transition-all">Sever_Link</button>
       </div>
    </div>
    <vpn-agent></vpn-agent>
  </Layout>
);

export const ScannerPage = () => (
  <Layout title="Vulnerability Scanner" islandPaths={['/components/islands/ScannerAgent.js']}>
    <div class="mb-12">
      <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Vulnerability Scanner</h2>
      <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Automated process auditing // Anomaly detection</p>
    </div>
    <div class="bg-white/5 border border-white/5 p-8 mb-8">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500">System Scan</h3>
        <button id="btn-run-scan" class="bg-white text-black px-4 py-2 text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Execute_Full_System_Scan</button>
      </div>
      <div id="scanner-results" class="font-mono text-xs text-slate-400 bg-black/40 p-6 border border-white/5 max-h-[500px] overflow-y-auto whitespace-pre-wrap">
        Click 'Execute_Full_System_Scan' to trigger the scanner sidecar. Results show top processes by CPU with SHA-256 integrity hashes.
      </div>
    </div>
    <scanner-agent></scanner-agent>
  </Layout>
);
export const EbpfPage = () => (
  <Layout title="Kernel Guardian" islandPaths={['/components/islands/EbpfAgent.js']}>
    <div class="mb-12">
      <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Kernel Guardian</h2>
      <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">eBPF instrumentation // Syscall filtering</p>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <div class="lg:col-span-1 space-y-6">
        <div class="bg-white/5 border border-white/5 p-6 text-center">
          <div id="ebpf-status-dot" class="w-12 h-12 bg-slate-600 rounded-full mx-auto mb-4"></div>
          <h3 id="ebpf-status-label" class="text-lg font-black uppercase">Offline</h3>
        </div>
        <div class="bg-white/5 border border-white/5 p-6">
          <h4 class="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-4">LSM Directives</h4>
          <button onclick="fetch('/api/agents/ebpf/command', {method:'POST', body: JSON.stringify({type:'HIDE_PID'})})" class="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-widest mb-2 transition-all">Hide_Orchestrator_PID</button>
        </div>
      </div>
      <div class="lg:col-span-3 bg-white/5 border border-white/5 p-8">
        <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6 pb-2 border-b border-white/5">Kernel Event Stream</h3>
        <div id="ebpf-event-log" class="space-y-2 h-[500px] overflow-y-auto">
          <p class="text-slate-500 text-[9px] italic">Awaiting kernel signals...</p>
        </div>
      </div>
    </div>
    <ebpf-agent></ebpf-agent>
  </Layout>
);

export const FimPage = () => (
  <Layout title="Sentinel Monitor" islandPaths={['/components/islands/FimAgent.js']}>
    <div class="mb-12">
      <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Sentinel Monitor</h2>
      <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">File Integrity // Audit Chain</p>
    </div>
    <div class="bg-white/5 border border-white/5 p-8">
      <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6 pb-2 border-b border-white/5">Integrity Violations</h3>
      <div id="fim-alerts" class="space-y-4 h-[500px] overflow-y-auto">
        <p class="text-slate-500 text-[9px] italic">Awaiting integrity signals...</p>
      </div>
    </div>
    <fim-agent></fim-agent>
  </Layout>
);

export const PcapPage = () => (
  <Layout title="Interceptor DPI" islandPaths={['/components/islands/PcapAgent.js']}>
    <div class="mb-12">
      <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Interceptor DPI</h2>
      <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Deep Packet Inspection // Traffic Analysis</p>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
       <div class="lg:col-span-1 space-y-6">
          <div class="bg-white/5 border border-white/5 p-6">
             <h4 class="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-4">Capture Controls</h4>
             <input id="pcap-iface" type="text" placeholder="INTERFACE (any)" class="w-full bg-black/40 border border-white/10 p-2 text-[10px] mb-2 text-white" />
             <input id="pcap-filter" type="text" placeholder="BPF FILTER" class="w-full bg-black/40 border border-white/10 p-2 text-[10px] mb-4 text-white" />
             <button onclick="document.querySelector('pcap-agent').startCapture()" class="w-full py-3 bg-cyber/10 hover:bg-cyber/20 border border-cyber/20 text-cyber text-[9px] font-black uppercase tracking-widest transition-all">Execute_Capture</button>
          </div>
       </div>
       <div class="lg:col-span-3 bg-white/5 border border-white/5 p-8">
          <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6 pb-2 border-b border-white/5">Live Inspection Stream</h3>
          <div id="pcap-stream" class="h-[600px] overflow-y-auto space-y-1">
             <p class="text-slate-500 text-[9px] italic text-center py-8">Awaiting packet inspection...</p>
          </div>
       </div>
    </div>
    <pcap-agent></pcap-agent>
  </Layout>
);

export const HoneypotPage = () => (
  <Layout title="Deception Grid" islandPaths={['/components/islands/HoneypotChart.js']}>
    <div class="mb-12">
      <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Deception Grid</h2>
      <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Multi-vector traps // Adversary profiling</p>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
       <div class="bg-white/5 border border-white/5 p-8">
          <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6 pb-2 border-b border-white/5">Interaction Volume</h3>
          <div class="h-[300px]">
             <honeypot-chart></honeypot-chart>
          </div>
       </div>
       <div class="bg-white/5 border border-white/5 p-8">
          <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6 pb-2 border-b border-white/5">Tactical Controls</h3>
          <div class="space-y-4">
             <button onclick="fetch('/api/agents/honeypot/command', {method:'POST', body: JSON.stringify({type:'Sabotage', source_ip: 'GLOBAL', level: 'HIGH'})})" class="w-full py-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest transition-all italic">Engage_Active_Sabotage</button>
             <button class="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-widest transition-all">Morph_Trap_Architecture</button>
          </div>
       </div>
    </div>
  </Layout>
);
