/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "../../Layout.tsx";

export const FirewallPage = () => (
  <Layout title="Firewall Agent">
    <div class="mb-12">
      <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Firewall Enforcer</h2>
      <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Kernel-level packet filtering // Active quarantine</p>
    </div>
    
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div class="lg:col-span-1 bg-white/5 border border-white/5 p-8">
        <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6">Blocked Identities</h3>
        <div class="text-3xl font-black mb-2">1,242</div>
        <p class="text-[9px] text-slate-500 font-bold uppercase">Total unique IP blocks</p>
      </div>
      <div class="lg:col-span-2 bg-white/5 border border-white/5 p-8">
        <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 pb-2 border-b border-white/5">Active Quarantined IPs</h3>
        <div class="space-y-2 font-mono text-xs">
          <div class="flex justify-between p-2 bg-black/40 border border-white/5 text-red-500">
            <span>185.220.101.44</span>
            <span class="text-[9px] font-black">TOR_EXIT_NODE</span>
          </div>
          <div class="flex justify-between p-2 bg-black/40 border border-white/5 text-red-500">
            <span>45.143.203.14</span>
            <span class="text-[9px] font-black">SSH_BRUTE_FORCE</span>
          </div>
          <div class="flex justify-between p-2 bg-black/40 border border-white/5 text-red-500">
            <span>91.240.118.221</span>
            <span class="text-[9px] font-black">SCANNER_IDENTIFIED</span>
          </div>
        </div>
      </div>
    </div>
  </Layout>
);

export const VpnPage = () => (
  <Layout title="VPN Tunnels">
    <div class="mb-12">
      <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Cryptographic Tunnels</h2>
      <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">WireGuard encryption // Secure mesh backhaul</p>
    </div>
    <div class="bg-white/5 border border-white/5 p-12 text-center">
       <div class="w-16 h-16 border-2 border-green-500 flex items-center justify-center mx-auto mb-6">
          <div class="w-8 h-8 bg-green-500 animate-pulse rounded-full"></div>
       </div>
       <h3 class="text-2xl font-black uppercase tracking-tight mb-2">Mesh Tunnel Active</h3>
       <p class="text-slate-500 text-xs font-bold uppercase mb-8">Interface: wg0 // Protocol: WireGuard // Encryption: ChaCha20-Poly1305</p>
       <div class="max-w-md mx-auto grid grid-cols-2 gap-4">
          <div class="p-4 bg-black/40 border border-white/5">
             <p class="text-[9px] text-slate-500 font-black uppercase mb-1">Tx Data</p>
             <p class="text-lg font-bold">1.2 GB</p>
          </div>
          <div class="p-4 bg-black/40 border border-white/5">
             <p class="text-[9px] text-slate-500 font-black uppercase mb-1">Rx Data</p>
             <p class="text-lg font-bold">842 MB</p>
          </div>
       </div>
    </div>
  </Layout>
);

export const ScannerPage = () => (
  <Layout title="Vulnerability Scanner">
    <div class="mb-12">
      <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Vulnerability Scanner</h2>
      <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Automated patch auditing // CVE discovery</p>
    </div>
    <div class="space-y-4">
       {[
         { id: 'CVE-2024-1234', title: 'OpenSSL Out-of-bounds Read', severity: 'HIGH', status: 'PATCHED' },
         { id: 'CVE-2023-4567', title: 'Kernel Privilege Escalation', severity: 'CRITICAL', status: 'PENDING' },
         { id: 'CVE-2024-9988', title: 'LibSSH Authentication Bypass', severity: 'HIGH', status: 'QUARANTINED' },
       ].map(vuln => (
         <div class="bg-white/5 border border-white/5 p-6 flex justify-between items-center">
            <div>
               <span class="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">{vuln.id}</span>
               <h3 class="text-lg font-black uppercase">{vuln.title}</h3>
            </div>
            <div class="flex gap-4 items-center">
               <span class={`px-3 py-1 text-[9px] font-black uppercase ${vuln.severity === 'CRITICAL' ? 'bg-red-600' : 'bg-orange-500'}`}>{vuln.severity}</span>
               <span class="text-[9px] font-black uppercase text-slate-400">{vuln.status}</span>
            </div>
         </div>
       ))}
    </div>
  </Layout>
);
