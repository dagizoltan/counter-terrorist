import { h, render } from '/vendor/preact.js';
import { useState, useEffect } from '/vendor/preact-hooks.js';

function TacticalIntel() {
  const [intel, setIntel] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchIntel = async () => {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/autopilot/intelligence', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      const data = await res.json();
      setIntel(data);
    } catch (e) {
      console.error("Failed to fetch tactical intelligence", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntel();
    const interval = setInterval(fetchIntel, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && intel.length === 0) {
    return (
      <div class="flex flex-col gap-6">
        <div class="skeleton h-32 w-full"></div>
        <div class="skeleton h-32 w-full opacity-60"></div>
        <div class="skeleton h-32 w-full opacity-30"></div>
      </div>
    );
  }

  if (intel.length === 0) {
    return (
      <div class="p-24 text-center t-panel glass-panel border-dashed opacity-30">
        <div class="mono-xs font-black uppercase tracking-[0.3em] mb-4 italic text-slate-500">Intelligence_Buffer_Clear</div>
        <div class="mono-xs text-slate-600 font-bold uppercase tracking-widest">Autonomous Defense Mesh is currently in monitor mode. <br/> No active signals detected.</div>
      </div>
    );
  }

  return (
    <div class="space-y-6 ">
      {intel.map((item) => {
        const isCritical = item.score >= 10;
        const isWarning = item.score >= 3;
        const theme = isCritical ? 'danger' : isWarning ? 'warning' : 'primary';
        const color = `var(--${theme})`;

        return (
          <div key={item.source} class={`t-panel glass-panel border-l-4 hover:bg-white/[0.02] p-10 mb-8`} style={{ borderLeftColor: color }}>
            <div class="flex justify-between items-start mb-10">
              <div class="flex flex-col gap-2">
                <div class="mono-xs font-bold text-slate-500 uppercase tracking-widest">Incursion_Vector</div>
                <div class="mono-md font-black text-white uppercase tracking-tighter italic select-all">{item.source}</div>
              </div>
              <div class="text-right flex flex-col items-end gap-2">
                <div class="mono-xs font-bold text-slate-500 uppercase tracking-widest">Tactical_Threat_Score</div>
                <div class="mono-lg font-black tabular-nums tracking-widest" style={{ color, textShadow: `0 0 15px ${color}66` }}>
                  {item.score.toFixed(1)}
                </div>
              </div>
            </div>

            {item.remediation && (
              <div class={`mb-10 p-8 rounded-xl border flex items-center gap-8 bg-black/60 hover:bg-black/80`} style={{ borderColor: `${color}33` }}>
                 <div class="p-4 bg-black/40 rounded border border-white/5" style={{ color }}>
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 00-2 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                 </div>
                 <div class="flex-grow">
                    <div class="flex items-center gap-4 mb-2">
                       <span class="dot" style={{ background: color }}></span>
                       <div class="mono-xs font-black uppercase tracking-widest" style={{ color }}>{item.remediation.tier}_NEUTRALIZATION_PROTOCOL</div>
                    </div>
                    <div class="mono-xs text-slate-500 uppercase font-bold tracking-widest leading-none mt-2 italic">${item.remediation.reason}</div>
                 </div>
                 <div class="status-pill active primary">
                    T- ${new Date(item.remediation.timestamp).toLocaleTimeString([], {hour12:false, hour:'2-digit', minute:'2-digit'})}
                 </div>
              </div>
            )}

            <div class="space-y-4 pt-6 border-t border-white/5">
               <div class="flex items-center justify-between mb-4">
                 <div class="flex items-center gap-3">
                   <div class="w-1 h-3 bg-slate-800 rounded"></div>
                   <div class="mono-xs font-black text-slate-600 uppercase tracking-widest">Ingress_Signal_Dynamics</div>
                 </div>
                 <span class="mono-xs text-slate-800 font-black uppercase tracking-[0.3em]">SEC_AUDIT_VERIFIED</span>
               </div>
               
               <div class="grid grid-cols-2 gap-4">
                 {item.events.map((ev, i) => (
                    <div key={i} class="flex justify-between items-center group/ev p-4 bg-black/40 border border-white/5 rounded hover:border-primary/20">
                       <div class="flex items-center gap-4">
                          <div class={`w-2 h-2 rounded-full ${ev.severity >= 5 ? 'bg-danger' : ev.severity >= 3 ? 'bg-warning' : 'bg-primary'
                          <span class="mono-xs font-black text-slate-400 uppercase tracking-tight group-hover/ev:text-white">{ev.type}</span>
                       </div>
                       <span class="mono-xs text-slate-600 group-hover/ev:text-slate-300 font-bold uppercase tracking-tighter truncate max-w-[200px]">{ev.description}</span>
                    </div>
                 ))}
               </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const container = document.getElementById('tactical-intel-root');
if (container) {
  render(h(TacticalIntel), container);
}
