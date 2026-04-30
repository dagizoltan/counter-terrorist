import { useState } from "preact/hooks";

export default function ChaosIsland() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const simulate = async (vector, target) => {
    setLoading(true);
    try {
      const res = await fetch("/api/chaos/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector, target })
      });
      const data = await res.json();
      setResult(data.message);
      setTimeout(() => setResult(null), 3000);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div class="bg-red-900/10 border border-red-500/20 rounded-2xl p-8 overflow-hidden relative">
      <div class="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
         <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>
      </div>

      <div class="flex items-center gap-3 mb-6">
         <div class="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
         <h3 class="text-[10px] font-black uppercase tracking-[0.4em] text-red-500">Chaos Engine // Red-Team Sim</h3>
      </div>

      <p class="text-xs text-slate-500 mb-8 max-w-md">
        Trigger synthetic threat vectors to verify mesh response times, autopilot playbooks, and forensic capture.
      </p>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
         <button 
           onClick={() => simulate("brute-force", "192.168.1.100")}
           disabled={loading}
           class="bg-white/5 border border-white/10 hover:border-red-500/50 hover:bg-red-500/10 p-4 text-left transition-all group"
         >
            <div class="text-[9px] font-black text-slate-500 uppercase mb-1 group-hover:text-red-400">Simulation_01</div>
            <div class="text-xs font-bold text-white">SSH_Brute_Force</div>
         </button>

         <button 
           onClick={() => simulate("canary", "./vault_credentials.xlsx")}
           disabled={loading}
           class="bg-white/5 border border-white/10 hover:border-red-500/50 hover:bg-red-500/10 p-4 text-left transition-all group"
         >
            <div class="text-[9px] font-black text-slate-500 uppercase mb-1 group-hover:text-red-400">Simulation_02</div>
            <div class="text-xs font-bold text-white">Canary_Exfiltration</div>
         </button>

         <button 
           onClick={() => simulate("malware", "xmrig")}
           disabled={loading}
           class="bg-white/5 border border-white/10 hover:border-red-500/50 hover:bg-red-500/10 p-4 text-left transition-all group"
         >
            <div class="text-[9px] font-black text-slate-500 uppercase mb-1 group-hover:text-red-400">Simulation_03</div>
            <div class="text-xs font-bold text-white">Kernel_Malware</div>
         </button>
      </div>

      {result && (
        <div class="mt-6 text-[10px] font-mono text-green-400 animate-pulse uppercase tracking-widest">
           {result}
        </div>
      )}
    </div>
  );
}
