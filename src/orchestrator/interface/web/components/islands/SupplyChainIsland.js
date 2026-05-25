import { h, render } from '../../vendor/preact.js';
import { useEffect, useState } from '../../vendor/preact-hooks.js';
import htm from '../../vendor/htm.js';

const html = htm.bind(h);

function SupplyChainIsland() {
  const [sbom, setSbom] = useState([]);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const headers = csrfToken ? { 'X-CT-Token': csrfToken } : {};
    fetch("/api/supply-chain/sbom", { headers }).then(r => r.json()).then(setSbom);
    fetch("/api/supply-chain/status", { headers }).then(r => r.json()).then(setStatus);
  }, []);

  if (!status) return html`
    <div class="flex items-center justify-center p-12 text-slate-500  mono font-black uppercase tracking-widest text-xs">
       Scanning_Supply_Chain...
    </div>
  `;

  return html`
    <div class="p-8">
      <div class="flex justify-between items-center mb-12">
         <div>
            <div class="metric-tag mb-2">Integrity_Assurance</div>
            <h3 class="tactical-title" style="font-size:1.5rem;">SUPPLY_CHAIN_HEALTH</h3>
         </div>
         <div class="text-right">
            <div class="text-5xl font-black text-white tabular-nums">${status.score}%</div>
            <div class="metric-tag mt-2" style="color:var(--success);">Health_Score</div>
         </div>
      </div>

      <div class="space-y-6">
         <div class="grid grid-cols-4 gap-6 pb-4 border-b border-white/5">
            <span class="metric-tag">Component</span>
            <span class="metric-tag">Version</span>
            <span class="metric-tag">License</span>
            <span class="metric-tag text-right">Status</span>
         </div>
         <div class="max-h-[300px] overflow-y-auto space-y-3 pr-4 custom-scrollbar">
            ${sbom.map(item => html`
              <div key=${item.name} class="grid grid-cols-4 gap-6 py-4 border-b border-white/[0.03] group hover:bg-white/[0.02]">
                 <span class="mono text-[11px] text-white font-black uppercase">${item.name}</span>
                 <span class="mono text-[11px] text-slate-500">${item.version}</span>
                 <span class="mono text-[11px] text-slate-500">${item.license}</span>
                 <span class="text-right">
                    <span class="mono text-[10px] font-black tracking-widest uppercase ${item.status === 'SECURE' ? 'text-success' : 'text-danger'}">
                       ${item.status}
                    </span>
                 </span>
              </div>
            `)}
         </div>
      </div>

      ${status.vulnerableCount > 0 && html`
        <div class="mt-12 p-6 bg-danger/5 border border-danger/20 flex items-center gap-6">
           <div class="dot danger"></div>
           <p class="mono text-[10px] font-black text-danger uppercase tracking-widest leading-relaxed">
              VULNERABILITY DETECTED: ${status.vulnerableCount} compromised components identified in manifest.
           </p>
        </div>
      `}
    </div>
  `;
}

const container = document.getElementById('supply-chain-container');
if (container) {
  render(html`<${SupplyChainIsland} />`, container);
}
