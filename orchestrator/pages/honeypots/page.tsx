/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "../Layout.tsx";
import { HoneypotModule } from "../../services/honeypot_service.ts";

export const HoneypotsPage = (props: { modules: HoneypotModule[] }) => {
  return (
    <Layout title="Honeypot Infrastructure">
      <div class="mb-12">
        <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Deception Layer</h2>
        <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Multi-vector active decoys // Distributed trap network</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {props.modules.map(module => (
          <div class="bg-white/5 border border-white/5 p-8 flex flex-col justify-between">
            <div>
              <div class="flex justify-between items-start mb-6">
                <div class={`w-2 h-2 ${module.active ? "bg-green-500" : "bg-white/10"}`}></div>
                <span class="text-[10px] font-black uppercase tracking-widest text-slate-500">Port {module.port}</span>
              </div>
              <h3 class="text-xl font-black uppercase mb-4 tracking-tight">{module.name}</h3>
              <p class="text-xs text-slate-400 mb-8 leading-relaxed font-medium">{module.description}</p>
            </div>
            
            <div class="flex gap-4">
              <a href={`/honeypots/${module.id}`} class="flex-1 bg-white text-black py-3 text-[9px] font-black uppercase tracking-widest text-center hover:bg-slate-200 transition-all">Inspect_Telemetry</a>
              <button 
                onclick={`fetch('/api/honeypots/${module.id}/toggle', { method: 'POST', body: JSON.stringify({ active: ${!module.active} }), headers: { 'Content-Type': 'application/json' } }).then(() => location.reload())`}
                class={`flex-1 border ${module.active ? "border-red-600/30 text-red-500" : "border-white/20 text-white"} py-3 text-[9px] font-black uppercase tracking-widest hover:bg-white/5 transition-all`}
              >
                {module.active ? "Deactivate" : "Deploy"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
};
