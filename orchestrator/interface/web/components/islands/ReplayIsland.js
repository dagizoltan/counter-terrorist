import { useEffect, useState, useRef } from "preact/hooks";

export default function ReplayIsland() {
  const [events, setEvents] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const playRef = useRef(null);

  useEffect(() => {
    fetch("/api/audit?limit=200")
      .then(r => r.json())
      .then(data => {
        // Reverse to get chronological order
        setEvents(data.reverse());
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (playing) {
      playRef.current = setInterval(() => {
        setCurrentIndex(prev => {
          if (prev >= events.length - 1) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      clearInterval(playRef.current);
    }
    return () => clearInterval(playRef.current);
  }, [playing, events.length]);

  if (loading) return <div class="text-white animate-pulse">Initializing Forensic Buffer...</div>;
  if (events.length === 0) return <div class="text-slate-500">No events captured in current forensic window.</div>;

  const currentEvent = events[currentIndex];

  return (
    <div class="space-y-8">
      {/* Visual Timeline Scrub */}
      <div class="bg-black/60 border border-white/5 rounded-2xl p-6 backdrop-blur-xl">
        <div class="flex items-center justify-between mb-8">
           <div class="flex items-center gap-4">
              <button 
                onClick={() => setPlaying(!playing)}
                class={`w-12 h-12 flex items-center justify-center rounded-full transition-all ${playing ? 'bg-red-500/20 text-red-500 border border-red-500/50' : 'bg-blue-500/20 text-blue-500 border border-blue-500/50'}`}
              >
                {playing ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect width="4" height="16" x="6" y="4" rx="1"/><rect width="4" height="16" x="14" y="4" rx="1"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="m7 4 12 8-12 8V4z"/></svg>
                )}
              </button>
              <div>
                <div class="text-[10px] text-slate-500 uppercase tracking-widest">Forensic Playback</div>
                <div class="text-white font-bold tracking-tight">{playing ? "SYSTEM_REPLAY_ACTIVE" : "REPLAY_PAUSED"}</div>
              </div>
           </div>
           <div class="text-right">
              <div class="text-[10px] text-slate-500 uppercase tracking-widest">Event Position</div>
              <div class="text-white font-mono text-xs">{currentIndex + 1} / {events.length}</div>
           </div>
        </div>

        <input 
          type="range" 
          min="0" 
          max={events.length - 1} 
          value={currentIndex} 
          onInput={(e) => { setCurrentIndex(parseInt(e.target.value)); setPlaying(false); }}
          class="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500 mb-2"
        />
        <div class="flex justify-between text-[8px] text-slate-600 font-bold uppercase tracking-widest">
           <span>T-Minus Start</span>
           <span>Live Edge</span>
        </div>
      </div>

      {/* Forensic Detail View */}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
         <div class="space-y-6">
            <div class="bg-white/5 border border-white/10 rounded-xl p-8 relative overflow-hidden group">
               <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
               </div>
               
               <div class={`inline-block px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest mb-6 ${currentEvent.type === 'CRITICAL' || currentEvent.type === 'THREAT' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>
                  {currentEvent.type}
               </div>

               <h4 class="text-2xl font-bold text-white mb-2 leading-tight">
                  {currentEvent.message}
               </h4>
               <div class="text-slate-500 font-mono text-xs mb-8">
                  Timestamp: {new Date(currentEvent.timestamp).toLocaleString()}
               </div>

               <div class="p-4 bg-black/40 rounded-lg border border-white/5 font-mono text-[10px] text-slate-400 overflow-x-auto">
                  <pre>{JSON.stringify(currentEvent.data || {}, null, 2)}</pre>
               </div>
            </div>

            <div class="bg-blue-600/10 border border-blue-500/20 rounded-xl p-6">
               <div class="flex items-center gap-3 text-blue-400 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                  <span class="text-[10px] font-black uppercase tracking-widest">Integrity Check</span>
               </div>
               <div class="text-[9px] text-slate-500 uppercase tracking-[0.2em]">Hash Chain Link</div>
               <div class="text-[10px] font-mono text-slate-400 truncate mt-1">
                  PREV: {currentEvent.prevHash?.slice(0, 32)}...
               </div>
               <div class="text-[10px] font-mono text-green-400 truncate">
                  CURR: {currentEvent.hash?.slice(0, 32)}...
               </div>
            </div>
         </div>

         {/* Mini Heatmap / Node Status */}
         <div class="bg-slate-900/50 border border-white/10 rounded-xl p-8">
            <h5 class="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-8">Mesh Cluster Snapshot</h5>
            
            <div class="space-y-4">
               {['node-alpha', 'node-beta', 'node-gamma'].map(node => (
                 <div class="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5 hover:border-white/20 transition-all cursor-default">
                    <div class="flex items-center gap-4">
                       <div class={`w-2 h-2 rounded-full ${currentEvent.data?.node === node ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]'}`} />
                       <span class="text-xs font-bold text-white uppercase tracking-widest">{node}</span>
                    </div>
                    <span class="text-[9px] text-slate-600 font-bold uppercase tracking-widest">
                       {currentEvent.data?.node === node ? 'Active Alert' : 'Standby'}
                    </span>
                 </div>
               ))}
            </div>

            <div class="mt-12 p-6 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
               <div class="flex items-center gap-3 text-yellow-500 mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>
                  <span class="text-[10px] font-black uppercase tracking-widest">Forensic Advisory</span>
               </div>
               <p class="text-[11px] text-slate-400 leading-relaxed italic">
                  "At this point in the timeline, Node-Alpha detected a suspicious shell execution by PID 1422. The mesh successfully gossiped the threat signature to all peers."
               </p>
            </div>
         </div>
      </div>
    </div>
  );
}
