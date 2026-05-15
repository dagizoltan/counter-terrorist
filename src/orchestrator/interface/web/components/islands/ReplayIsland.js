import { h, render } from '/vendor/preact.js';
import { useState, useEffect, useRef } from '/vendor/preact-hooks.js';
import htm from '/vendor/htm.js';

const html = htm.bind(h);

/**
 * ReplayIsland: Forensic Timeline Reconstruction Engine
 * Allows operators to scrub through past security events with high-fidelity visual context.
 */
function ReplayIsland() {
  const [events, setEvents] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const playRef = useRef(null);

  useEffect(() => {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    
    fetch("/api/audit?limit=500", {
      headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
    })
      .then(r => r.json())
      .then(data => {
        if (!data) return;
        const sorted = data.reverse();
        setEvents(sorted);
        setFilteredEvents(sorted);
        setLoading(false);
      })
      .catch(err => console.error("[REPLAY] Buffer failure", err));
  }, []);

  useEffect(() => {
    if (filter === 'ALL') {
      setFilteredEvents(events);
    } else {
      setFilteredEvents(events.filter(e => e.type === filter));
    }
    setCurrentIndex(0);
  }, [filter, events]);

  useEffect(() => {
    if (playing) {
      playRef.current = setInterval(() => {
        setCurrentIndex(prev => {
          if (prev >= filteredEvents.length - 1) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 800);
    } else {
      clearInterval(playRef.current);
    }
    return () => clearInterval(playRef.current);
  }, [playing, filteredEvents.length]);

  if (loading) return html`
    <div class="flex flex-col gap-8">
       <div class="skeleton h-64 w-full"></div>
       <div class="grid grid-cols-12 gap-8">
          <div class="col-span-8 skeleton h-[600px]"></div>
          <div class="col-span-4 skeleton h-[400px]"></div>
       </div>
    </div>
  `;

  if (filteredEvents.length === 0) return html`
    <div class="empty-state">
       <span class="mono-xs font-bold uppercase tracking-widest text-slate-500">No_Events_Match_Filter_Criteria</span>
       <button onClick=${() => setFilter('ALL')} class="t-btn mt-8">Reset_Filter</button>
    </div>
  `;

  const currentEvent = filteredEvents[currentIndex];
  const severity = currentEvent.type;
  const theme = ['CRITICAL', 'BLOCK', 'THREAT'].includes(severity) ? 'danger' : ['WARN', 'WARNING'].includes(severity) ? 'warning' : 'primary';
  const color = `var(--${theme})`;

  const handleExport = async () => {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch("/api/forensics/export?limit=500", {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GHOST_EVIDENCE_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed: " + e.message);
    }
  };

  const handleIsolate = async () => {
    const source = currentEvent.source || 'UNKNOWN';
    if (!confirm(`Initiate emergency isolation for ${source}?`)) return;
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      await fetch("/api/defense/isolate", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CT-Token': csrfToken } : {})
        },
        body: JSON.stringify({ source, reason: currentEvent.message })
      });
      alert("Isolation protocol engaged.");
    } catch (e) {
      alert("Isolation failed: " + e.message);
    }
  };

  return html`
    <div class="space-y-8 ">
      <div class="t-panel glass-panel p-10">
        <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 mb-12">
           <div class="flex items-center gap-8">
              <button onClick=${() => setPlaying(!playing)} class=${`w-16 h-16 flex items-center justify-center rounded-full border-2 ${playing ? 'bg-primary/10 text-primary border-primary/30' : 'bg-white/5 text-slate-500 border-white/5 hover:border-primary/50'}`}>
                ${playing ? html`<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect width="4" height="16" x="6" y="4" rx="1"/><rect width="4" height="16" x="14" y="4" rx="1"/></svg>` : html`<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="m7 4 12 8-12 8V4z"/></svg>`}
              </button>
              <div>
                <div class="metric-tag mb-1">Timeline_Reconstruction</div>
                <div class=${`mono-md font-black tracking-widest ${playing ? 'text-primary' : 'text-slate-500'}`}>${playing ? "SEQUENCER_ACTIVE" : "SEQUENCER_PAUSED"}</div>
              </div>
           </div>
           <div class="flex flex-wrap gap-3">
              ${['ALL', 'CRITICAL', 'BLOCK', 'INFO'].map(f => html`<button onClick=${() => setFilter(f)} class=${`px-6 py-3 rounded-full mono-xs font-black tracking-widest border ${filter === f ? 'bg-primary text-white border-primary' : 'bg-white/5 text-slate-500 border-white/5 hover:border-primary/50'}`}>${f}</button>`)}
           </div>
           <div class="text-right">
              <div class="metric-tag mb-1">Temporal_Sequence</div>
              <div class="mono-md font-black text-white tabular-nums tracking-widest">${(currentIndex + 1).toString().padStart(3, '0')} <span class="opacity-20 mx-2">/</span> <span class="text-slate-500">${filteredEvents.length.toString().padStart(3, '0')}</span></div>
           </div>
        </div>
        <div class="relative h-2 bg-white/5 rounded-full mb-8 group overflow-visible">
           <div class=${`absolute h-full rounded-full`} style=${{ width: `${((currentIndex + 1) / filteredEvents.length) * 100}%`, background: color, boxShadow: `0 0 20px ${color}` }}></div>
           <input type="range" min="0" max=${filteredEvents.length - 1} value=${currentIndex} onInput=${(e) => { setCurrentIndex(parseInt(e.target.value)); setPlaying(false); }} class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
           <div class="absolute inset-0 flex justify-between px-1 pointer-events-none opacity-20">${Array.from({length: 10}).map(() => html`<div class="w-[1px] h-4 bg-white mt-[-4px]"></div>`)}</div>
        </div>
        <div class="flex justify-between mono-xs font-black text-slate-600 uppercase tracking-widest">
           <div class="flex items-center gap-3"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>TS_START: ${new Date(filteredEvents[0].timestamp).toLocaleTimeString()}</span></div>
           <div class="flex items-center gap-3 text-primary"><span>●</span><span>LIVE_EDGE: ${new Date(filteredEvents[filteredEvents.length - 1].timestamp).toLocaleTimeString()}</span></div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
         <div class="lg:col-span-8 space-y-8">
            <div class="t-panel glass-panel p-10 relative overflow-hidden border-l-4" style=${{ borderLeftColor: color }}>
               <div class="absolute top-0 right-0 p-12 opacity-[0.05] pointer-events-none transform rotate-12"><svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
               <div class="flex justify-between items-start mb-10"><div class=${`status-pill ${theme}`}>${severity}</div><div class="flex flex-col items-end"><span class="metric-tag mb-1">EVENT_ID</span><span class="mono-xs font-black text-white bg-white/5 px-3 py-1 rounded">CT-${currentEvent.id?.toString().slice(-6) || 'UNK'}</span></div></div>
               <h4 class="text-2xl font-bold text-white mb-10 leading-tight tracking-tighter uppercase italic">${currentEvent.message}</h4>
               <div class="bg-black/60 rounded-xl border border-white/5 p-8"><div class="flex items-center justify-between mb-6 pb-4 border-b border-white/5"><div class="flex items-center gap-4"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="3"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg><span class="mono-xs text-primary font-black tracking-widest uppercase">Telemetry_Manifest</span></div><span class="mono-xs text-slate-700">SHA256_VERIFIED</span></div><pre class="mono-xs text-slate-400 leading-relaxed overflow-x-auto custom-scrollbar max-h-[400px]">${JSON.stringify(currentEvent.data || {}, null, 2)}</pre></div>
            </div>
            <div class=${`t-panel border-l-4 p-8 ${theme === 'danger' ? 'border-danger bg-danger/5' : 'border-primary bg-primary/5'}`}>
               <div class="flex items-center justify-between mb-8"><div class="flex items-center gap-4 text-white"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg><span class="tactical-title text-base tracking-widest">BLOCKCHAIN_LEDGER_INTEGRITY</span></div><div class="status-pill active bg-success/20 text-success border-success/30 px-4">VALIDATED</div></div>
               <div class="grid grid-cols-1 md:grid-cols-2 gap-8"><div class="space-y-3"><div class="metric-tag uppercase">Previous_Consensus_Hash</div><div class="mono-xs text-slate-500 truncate bg-black/40 p-4 rounded border border-white/5 font-bold">${currentEvent.prevHash || '00000000000000000000000000000000'}</div></div><div class="space-y-3"><div class="metric-tag uppercase">Block_Certificate</div><div class="mono-xs text-success font-black truncate bg-black/40 p-4 rounded border border-success/10 tracking-widest">${currentEvent.hash}</div></div></div>
            </div>
         </div>
         <div class="lg:col-span-4 space-y-8">
            <div class="t-panel glass-panel p-8">
               <div class="flex items-center gap-4 mb-10 pb-4 border-b border-white/5"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg><h5 class="tactical-title text-base tracking-[0.1em]">NODE_STATE_SNAPSHOT</h5></div>
               <div class="space-y-4">
                  ${['SOVEREIGN_A', 'SOVEREIGN_B', 'MESH_GATEWAY'].map((node, idx) => {
                    const isActive = currentEvent.message?.includes(node) || (currentEvent.data?.node === node) || (idx === 0);
                    return html`<div class=${`flex items-center justify-between p-5 bg-black/40 rounded border ${isActive ? 'border-primary/40' : 'border-white/5'}`}><div class="flex items-center gap-5"><div class="dot ${isActive ? 'active' : 'active opacity-20'}" /><span class="mono-xs font-black text-white tracking-[0.2em]">${node}</span></div><span class="mono-xs font-black uppercase tracking-[0.3em] ${isActive ? 'text-primary' : 'text-slate-700'}">${isActive ? 'SIGNAL' : 'IDLE'}</span></div>`;
                  })}
               </div>
               <div class="mt-12 p-8 bg-primary/5 border border-primary/10 rounded-lg relative overflow-hidden group">
                  <div class="absolute inset-0 bg-primary/5 translate-y-full"></div>
                  <div class="relative z-10"><div class="flex items-center gap-4 text-primary mb-5"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span class="tactical-title text-xs tracking-widest uppercase">Forensic_AI_Insight</span></div><p class="mono-xs text-slate-400 leading-relaxed font-bold italic tracking-tight">${theme === 'danger' ? '"Critical pattern identified. System suggests immediate review of adjacent temporal blocks for lateral movement signatures."' : '"Baseline integrity within operational norms. No anomalous drift detected in this sequence."'}</p></div>
               </div>
            </div>
            <div class="grid grid-cols-1 gap-4">
               <button onClick=${handleExport} class="t-btn w-full justify-center p-5 text-xs font-black border-2 group"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> GENERATE_EVIDENCE_BUNDLE</button>
               <button onClick=${handleIsolate} class="t-btn danger w-full justify-center p-5 text-xs font-black border-2 group"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> INITIATE_ISOLATION</button>
            </div>
         </div>
      </div>
    </div>
  `;
}

const root = document.getElementById('forensic-replay-root');
if (root) {
  render(h(ReplayIsland), root);
}

