/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "../Layout.tsx";

export const TimelinePage = () => {
  return (
    <Layout title="Forensic Timeline // Rewind">
      <div class="mb-12">
        <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Forensic Timeline</h2>
        <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Multi-node event reconstruction // Incident rewind</p>
      </div>

      <div class="bg-white/5 border border-white/5 p-8 mb-12">
         <div class="flex justify-between items-center mb-8">
            <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500">Timeline Controller</h3>
            <span class="text-[10px] font-black uppercase tracking-widest text-white px-2 py-1 bg-red-600">Replay_Mode</span>
         </div>
         
         <div class="relative h-12 flex items-center mb-8">
            <div class="absolute w-full h-1 bg-white/10"></div>
            <div class="absolute h-1 bg-white" style="width: 65%"></div>
            <div class="absolute w-4 h-4 bg-white left-[65%] cursor-pointer shadow-[0_0_15px_#fff]"></div>
            
            {/* Markers */}
            <div class="absolute w-1 h-3 bg-red-500 left-[20%]" title="SSH Brute Force"></div>
            <div class="absolute w-1 h-3 bg-yellow-500 left-[45%]" title="Lateral Movement"></div>
            <div class="absolute w-1 h-3 bg-red-500 left-[62%]" title="Canary Triggered"></div>
         </div>
         
         <div class="flex justify-between text-[9px] font-black uppercase text-slate-500 tracking-widest">
            <span>T-24h</span>
            <span>T-12h</span>
            <span>Now</span>
         </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
         <div class="lg:col-span-2 space-y-4">
            <div class="bg-white/5 border border-white/5 p-6 border-l-4 border-red-600">
               <div class="flex justify-between mb-2">
                  <span class="text-[10px] font-black text-slate-500">12:44:01 // NODE-ALPHA</span>
                  <span class="text-[10px] font-black text-red-500 uppercase">THREAT_IDENTIFIED</span>
               </div>
               <p class="text-sm font-bold uppercase tracking-tight">CANARY TRIGGERED: python3 accessed ./vault_credentials.xlsx</p>
               <div class="mt-4 flex gap-2">
                  <span class="text-[8px] bg-white/5 px-2 py-0.5 text-slate-500 font-bold uppercase">PID: 9942</span>
                  <span class="text-[8px] bg-white/5 px-2 py-0.5 text-slate-500 font-bold uppercase">USER: dagizoltan</span>
               </div>
            </div>
            
            <div class="bg-white/5 border border-white/5 p-6 border-l-4 border-yellow-500 opacity-60">
               <div class="flex justify-between mb-2">
                  <span class="text-[10px] font-black text-slate-500">12:38:12 // NODE-ALPHA</span>
                  <span class="text-[10px] font-black text-yellow-500 uppercase">ANOMALY_DETECTED</span>
               </div>
               <p class="text-sm font-bold uppercase tracking-tight">LATERAL MOVEMENT: SSH connection to 192.168.1.105 via non-standard port</p>
            </div>
         </div>
         
         <div class="lg:col-span-1 space-y-8">
            <div class="bg-white/5 border border-white/5 p-8">
               <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6 pb-2 border-b border-white/5">Correlated Nodes</h3>
               <div class="space-y-4">
                  <div class="flex items-center gap-3">
                     <div class="w-2 h-2 bg-green-500"></div>
                     <span class="text-[10px] font-black uppercase">node-alpha</span>
                  </div>
                  <div class="flex items-center gap-3 opacity-30">
                     <div class="w-2 h-2 bg-white/20"></div>
                     <span class="text-[10px] font-black uppercase">node-bravo</span>
                  </div>
               </div>
            </div>
            
            <button class="w-full bg-white text-black py-4 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-200 transition-all">Download_Forensic_Bundle</button>
         </div>
      </div>
    </Layout>
  );
};
