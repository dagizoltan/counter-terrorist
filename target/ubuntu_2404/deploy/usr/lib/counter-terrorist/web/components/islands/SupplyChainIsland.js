import { useEffect, useState } from "preact/hooks";

export default function SupplyChainIsland() {
  const [sbom, setSbom] = useState([]);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch("/api/supply-chain/sbom").then(r => r.json()).then(setSbom);
    fetch("/api/supply-chain/status").then(r => r.json()).then(setStatus);
  }, []);

  if (!status) return <div class="text-slate-500 animate-pulse">Scanning Supply Chain...</div>;

  return (
    <div class="bg-white/5 border border-white/10 rounded-2xl p-8">
      <div class="flex justify-between items-center mb-8">
         <div>
            <div class="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500 mb-1">Integrity Assurance</div>
            <h3 class="text-2xl font-black italic text-white tracking-tighter uppercase">Supply_Chain_Health</h3>
         </div>
         <div class="text-right">
            <div class="text-4xl font-black text-white">{status.score}%</div>
            <div class="text-[9px] font-bold text-green-500 uppercase tracking-widest">Health_Score</div>
         </div>
      </div>

      <div class="space-y-4">
         <div class="grid grid-cols-4 gap-4 pb-2 border-b border-white/5 text-[9px] font-black text-slate-500 uppercase tracking-widest">
            <span>Component</span>
            <span>Version</span>
            <span>License</span>
            <span class="text-right">Status</span>
         </div>
         <div class="max-h-[200px] overflow-y-auto space-y-2 pr-2">
            {sbom.map(item => (
              <div class="grid grid-cols-4 gap-4 text-[10px] font-mono py-2 border-b border-white/[0.02]">
                 <span class="text-white font-bold">{item.name}</span>
                 <span class="text-slate-500">{item.version}</span>
                 <span class="text-slate-500">{item.license}</span>
                 <span class={`text-right font-bold ${item.status === 'SECURE' ? 'text-green-500' : 'text-red-500'}`}>
                    {item.status}
                 </span>
              </div>
            ))}
         </div>
      </div>

      {status.vulnerableCount > 0 && (
        <div class="mt-8 p-4 bg-red-500/10 border border-red-500/20 rounded flex items-center gap-4">
           <div class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
           <p class="text-[10px] font-bold text-red-400 uppercase tracking-widest">
              VULNERABILITY DETECTED: {status.vulnerableCount} compromised components found in current manifest.
           </p>
        </div>
      )}
    </div>
  );
}
