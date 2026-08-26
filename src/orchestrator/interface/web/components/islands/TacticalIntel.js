import { unwrap } from "./api.js";
import { h, render } from '../../vendor/preact.js';
import { useState, useEffect } from '../../vendor/preact-hooks.js';
import htm from '../../vendor/htm.js';

const html = htm.bind(h);

function TacticalIntel() {
  const [intel, setIntel] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchIntel = async () => {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/autopilot/intelligence', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      const data = await unwrap(res);
      setIntel(Array.isArray(data) ? data : []);
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
    return html`
      <div class="flex flex-col gap-4">
        <div class="skeleton h-32 w-full"></div>
        <div class="skeleton h-32 w-full opacity-60"></div>
        <div class="skeleton h-32 w-full opacity-30"></div>
      </div>
    `;
  }

  if (intel.length === 0) {
    return html`
      <div class="p-6 text-center t-panel glass-panel border-dashed opacity-30">
        <div class="eyebrow mb-4 italic">Intelligence_Buffer_Clear</div>
        <div class="eyebrow">Autonomous Defense Mesh is currently in monitor mode. <br/> No active signals detected.</div>
      </div>
    `;
  }

  return html`
    <div class="space-y-4">
      ${intel.map((item) => {
        const isCritical = item.score >= 10;
        const isWarning = item.score >= 3;
        const state = isCritical ? 'crit' : isWarning ? 'warn' : 'info';

        return html`
          <div key=${item.source} class="t-panel glass-panel border-l-4 tone-edge hover:bg-white/[0.02] p-5 mb-4" data-state="${state}">
            <div class="flex justify-between items-start mb-5">
              <div class="flex flex-col gap-2">
                <div class="eyebrow">Incursion_Vector</div>
                <div class="mono-md font-black text-white uppercase tracking-tighter select-all">${item.source}</div>
              </div>
              <div class="text-right flex flex-col items-end gap-2">
                <div class="eyebrow">Tactical_Threat_Score</div>
                <div class="mono-lg font-black tabular-nums tracking-widest tone-text" data-state="${state}">
                  ${item.score.toFixed(1)}
                </div>
              </div>
            </div>

            ${item.remediation && html`
              <div class="mb-5 p-4 rounded-lg border tone-border flex items-center gap-4 bg-black/60 hover:bg-black/80" data-state="${state}">
                 <div class="p-4 bg-black/40 rounded border border-white/5 tone-text" data-state="${state}">
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 00-2 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                 </div>
                 <div class="flex-grow">
                    <div class="flex items-center gap-4 mb-2">
                       <span class="indicator" data-state="${state}"></span>
                       <div class="eyebrow tone-text" data-state="${state}">${item.remediation.tier}_NEUTRALIZATION_PROTOCOL</div>
                    </div>
                    <div class="eyebrow leading-none mt-2 italic">${item.remediation.reason}</div>
                 </div>
                 <div class="status-pill active primary">
                    T- ${new Date(item.remediation.timestamp).toLocaleTimeString([], {hour12:false, hour:'2-digit', minute:'2-digit'})}
                 </div>
              </div>
            `}

            <div class="space-y-4 pt-4 border-t border-white/5">
               <div class="flex items-center justify-between mb-4">
                 <div class="flex items-center gap-3">
                   <div class="w-1 h-3 bg-slate-800 rounded"></div>
                   <div class="eyebrow">Ingress_Signal_Dynamics</div>
                 </div>
                 <span class="eyebrow text-slate-800">SEC_AUDIT_VERIFIED</span>
               </div>
               
               <div class="grid grid-cols-2 gap-4">
                 ${item.events.map((ev, i) => html`
                    <div key=${i} class="flex justify-between items-center group/ev p-4 bg-black/40 border border-white/5 rounded hover:border-primary/20">
                       <div class="flex items-center gap-4">
                          <div class="w-2 h-2 rounded-full ${ev.severity >= 5 ? 'bg-danger' : ev.severity >= 3 ? 'bg-warning' : 'bg-primary'}"></div>
                          <span class="mono-xs font-black text-slate-400 uppercase tracking-tight group-hover/ev:text-white">${ev.type}</span>
                       </div>
                       <span class="mono-xs text-slate-600 group-hover/ev:text-slate-300 font-bold uppercase tracking-tighter truncate max-w-[200px]">${ev.description}</span>
                    </div>
                 `)}
               </div>
            </div>
          </div>
        `;
      })}
    </div>
  `;
}

const container = document.getElementById('tactical-intel-root');
if (container) {
  render(html`<${TacticalIntel} />`, container);
}
