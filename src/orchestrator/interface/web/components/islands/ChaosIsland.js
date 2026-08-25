import { unwrap } from "./api.js";
import { h } from '../../vendor/preact.js';
import { useState } from '../../vendor/preact-hooks.js';
import htm from '../../vendor/htm.js';

const html = htm.bind(h);

/**
 * ChaosIsland // Red-Team Simulator
 * Trigger synthetic threat vectors to verify mesh resilience.
 */
export default function ChaosIsland() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const simulate = async (vector, target) => {
    setLoading(true);
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch("/api/chaos/simulate", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "X-CT-Token": csrfToken || ""
        },
        body: JSON.stringify({ vector, target })
      });
      const data = await unwrap(res);
      setResult(data.message);
      setTimeout(() => setResult(null), 5000);
    } catch (e) {
      console.error("[CHAOS_ENGINE] Simulation failed:", e);
    }
    setLoading(false);
  };

  return html`
    <div class="t-panel glass-panel border-t-2 border-danger/40 p-5 overflow-hidden relative group">
      <div class="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
         <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>
      </div>

      <header class="flex items-center gap-4 mb-5 pb-4 border-b border-white/5">
         <div class="p-4 bg-danger/10 border border-danger/20 text-danger rounded-lg">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
         </div>
         <div class="flex flex-col gap-1">
            <h3 class="tactical-title text-sm uppercase tracking-[0.3em]">CHAOS_ENGINE_V4</h3>
            <p class="eyebrow">Synthetic_Threat_Vector_Array</p>
         </div>
      </header>

      <p class="text-sm text-slate-400 mb-5 max-w-2xl leading-relaxed font-bold uppercase tracking-tight opacity-60">
        Trigger synthetic threat vectors to verify **Mesh Propagation** response times, autopilot security playbooks, and forensic capture fidelity. All simulations are container-isolated.
      </p>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
         <button 
           onClick=${() => simulate("brute-force", "192.168.1.100")}
           disabled=${loading}
           class="t-panel bg-black/40 border border-white/5 hover:border-danger/40 hover:bg-danger/5 p-4 text-left group/btn"
         >
            <div class="flex justify-between items-center mb-4">
               <span class="eyebrow group-hover/btn:text-danger">SIM_01</span>
               <div class="w-1.5 h-1.5 rounded-full bg-slate-800 group-hover/btn:bg-danger group-hover/btn:shadow-danger"></div>
            </div>
            <div class="mono-md font-black text-white uppercase tracking-tighter">SSH_Brute_Force</div>
            <div class="eyebrow mt-2">TARGET: SECURE_NODE_01</div>
         </button>

         <button 
           onClick=${() => simulate("canary", "./vault_credentials.xlsx")}
           disabled=${loading}
           class="t-panel bg-black/40 border border-white/5 hover:border-danger/40 hover:bg-danger/5 p-4 text-left group/btn"
         >
            <div class="flex justify-between items-center mb-4">
               <span class="eyebrow group-hover/btn:text-danger">SIM_02</span>
               <div class="w-1.5 h-1.5 rounded-full bg-slate-800 group-hover/btn:bg-danger group-hover/btn:shadow-danger"></div>
            </div>
            <div class="mono-md font-black text-white uppercase tracking-tighter">Canary_Exfiltration</div>
            <div class="eyebrow mt-2">TARGET: FS_VAULT_ROOT</div>
         </button>

         <button 
           onClick=${() => simulate("malware", "xmrig")}
           disabled=${loading}
           class="t-panel bg-black/40 border border-white/5 hover:border-danger/40 hover:bg-danger/5 p-4 text-left group/btn"
         >
            <div class="flex justify-between items-center mb-4">
               <span class="eyebrow group-hover/btn:text-danger">SIM_03</span>
               <div class="w-1.5 h-1.5 rounded-full bg-slate-800 group-hover/btn:bg-danger group-hover/btn:shadow-danger"></div>
            </div>
            <div class="mono-md font-black text-white uppercase tracking-tighter">Kernel_Malware</div>
            <div class="eyebrow mt-2">TARGET: EBPF_RUNTIME</div>
         </button>
      </div>

      ${result && html`
        <div class="mt-5 p-4 bg-success/5 border border-success/20 rounded-lg flex items-center gap-4">
           <div class="dot active"></div>
           <div class="eyebrow italic" data-tone="success">
              VECTOR_EXECUTED: ${result}
           </div>
        </div>
      `}

      ${loading && html`
        <div class="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center gap-4 z-20">
           <div class="skeleton h-24 w-64"></div>
           <span class="eyebrow" data-tone="danger">Initializing_Synthetic_Payload...</span>
        </div>
      `}
    </div>
  `;
}
