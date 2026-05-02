import { h, render } from 'https://esm.sh/preact';
import { useState, useEffect } from 'https://esm.sh/preact/hooks';

function TacticalIntel() {
  const [intel, setIntel] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchIntel = async () => {
    try {
      const res = await fetch('/api/autopilot/intelligence');
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
    const interval = setInterval(fetchIntel, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading && intel.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500 animate-pulse font-black uppercase tracking-widest text-[10px]">
        Hydrating_Intel...
      </div>
    );
  }

  if (intel.length === 0) {
    return (
      <div className="p-12 text-center text-slate-600 border-2 border-dashed border-white/5 rounded-3xl">
        <div className="text-[10px] font-black uppercase tracking-widest mb-2 italic">No_Threats_Detected</div>
        <div className="text-[9px] text-slate-700">Autonomous Defense Mesh is currently in monitor mode.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {intel.map((item) => (
        <div key={item.source} className={`glass-panel p-6 rounded-2xl border-l-4 transition-all hover:scale-[1.01] ${item.score >= 10 ? 'border-danger' : item.score >= 3 ? 'border-warning' : 'border-cyber'}`}>
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Target_Source</div>
              <div className="text-xl font-mono font-black text-white">{item.source}</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Threat_Score</div>
              <div className={`text-2xl font-black ${item.score >= 10 ? 'text-danger' : item.score >= 3 ? 'text-warning' : 'text-cyber'}`}>
                {item.score.toFixed(1)}
              </div>
            </div>
          </div>

          {item.remediation && (
            <div className={`mb-6 p-4 rounded-xl border flex items-center gap-4 ${item.remediation.tier === 'EMERGENCY' ? 'bg-danger/10 border-danger/30 text-danger' : 'bg-warning/10 border-warning/30 text-warning'}`}>
               <div className="p-2 bg-current/10 rounded-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 00-2 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
               </div>
               <div className="flex-grow">
                  <div className="text-[10px] font-black uppercase tracking-widest">{item.remediation.tier}_REMEDIATION_ACTIVE</div>
                  <div className="text-[9px] opacity-70 uppercase font-bold">{item.remediation.reason}</div>
               </div>
               <div className="text-[8px] font-mono opacity-50 uppercase">{new Date(item.remediation.timestamp).toLocaleTimeString()}</div>
            </div>
          )}

          <div className="space-y-3">
             <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest border-b border-white/5 pb-2">Recent_Incursion_Events</div>
             {item.events.map((ev, i) => (
                <div key={i} className="flex justify-between items-center group">
                   <div className="flex items-center gap-3">
                      <span className={`w-1.5 h-1.5 rounded-full ${ev.severity >= 5 ? 'bg-danger' : ev.severity >= 3 ? 'bg-warning' : 'bg-cyber'}`}></span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-white transition-colors">{ev.type}</span>
                   </div>
                   <span className="text-[9px] font-mono text-slate-600 group-hover:text-slate-400 transition-colors">{ev.description}</span>
                </div>
             ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const container = document.getElementById('tactical-intel-root');
if (container) {
  render(h(TacticalIntel), container);
}
