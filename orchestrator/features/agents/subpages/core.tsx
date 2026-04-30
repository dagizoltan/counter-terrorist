/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "../../../components/Layout.tsx";

export const FirewallPage = () => (
  <Layout title="Firewall Agent" islandPaths={['/pages/dashboard/islands/FirewallAgent.js']}>
    <div class="mb-12">
      <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Firewall Enforcer</h2>
      <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Kernel-level packet filtering // Active quarantine</p>
    </div>
    
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div class="lg:col-span-1 bg-white/5 border border-white/5 p-8">
        <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6">Blocked Identities</h3>
        <div id="fw-blocked-count" class="text-3xl font-black mb-2">...</div>
        <p class="text-[9px] text-slate-500 font-bold uppercase">Total unique IP blocks</p>
      </div>
      <div class="lg:col-span-2 bg-white/5 border border-white/5 p-8">
        <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 pb-2 border-b border-white/5">Active Quarantined IPs</h3>
        <div id="fw-blocked-list" class="space-y-2 font-mono text-xs">
          <p class="text-slate-500 text-[9px]">Loading firewall state...</p>
        </div>
      </div>
    </div>
    <firewall-agent></firewall-agent>
  </Layout>
);

export const VpnPage = () => (
  <Layout title="VPN Tunnels" islandPaths={['/pages/dashboard/islands/VpnAgent.js']}>
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
       <div class="max-w-md mx-auto grid grid-cols-2 gap-4">
          <div class="p-4 bg-black/40 border border-white/5">
             <p class="text-[9px] text-slate-500 font-black uppercase mb-1">Mesh Peers</p>
             <p id="vpn-peer-count" class="text-lg font-bold">...</p>
          </div>
          <div class="p-4 bg-black/40 border border-white/5">
             <p class="text-[9px] text-slate-500 font-black uppercase mb-1">Self Node</p>
             <p id="vpn-self-node" class="text-lg font-bold">...</p>
          </div>
       </div>
    </div>
    <vpn-agent></vpn-agent>
  </Layout>
);

export const ScannerPage = () => (
  <Layout title="Vulnerability Scanner" islandPaths={['/pages/dashboard/islands/ScannerAgent.js']}>
    <div class="mb-12">
      <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Vulnerability Scanner</h2>
      <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Automated process auditing // Anomaly detection</p>
    </div>
    <div class="bg-white/5 border border-white/5 p-8 mb-8">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500">System Scan</h3>
        <button onclick="const btn=this;btn.disabled=true;btn.textContent='SCANNING...';const csrf=document.querySelector('meta[name=\'csrf-token\']')?.content;fetch('/api/scanner/run',{method:'POST',headers:{'X-CT-Token':csrf}}).then(r=>r.json()).then(d=>{const out=document.getElementById('scanner-output');if(d.result&&d.result.processes){out.innerHTML=d.result.processes.map(p=>`<div class='flex gap-4 py-1 border-b border-white/5'><span class='text-slate-600 w-16'>[${p.pid}]</span><span class='text-white w-48'>${p.name}</span><span class='text-slate-500 flex-1 truncate'>${p.exe_path||'N/A'}</span><span class='text-yellow-500 w-20 text-right'>${(p.cpu_usage||0).toFixed(1)}% CPU</span></div>`).join('')}else{out.textContent=JSON.stringify(d,null,2)}}).catch(e=>document.getElementById('scanner-output').textContent='Error: '+e).finally(()=>{btn.disabled=false;btn.textContent='RUN SCAN'})" class="bg-white text-black px-4 py-2 text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Run Scan</button>
      </div>
      <div id="scanner-output" class="font-mono text-xs text-slate-400 bg-black/40 p-6 border border-white/5 max-h-[500px] overflow-y-auto whitespace-pre-wrap">
        Click 'Run Scan' to trigger the scanner sidecar. Results show top processes by CPU with SHA-256 integrity hashes.
      </div>
    </div>
    <scanner-agent></scanner-agent>
  </Layout>
);
