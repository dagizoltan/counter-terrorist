import { unwrap } from "./api.js";
import { h, render } from '../../vendor/preact.js';
import { useEffect, useState } from '../../vendor/preact-hooks.js';
import htm from '../../vendor/htm.js';

const html = htm.bind(h);

export default function IntegrityIsland() {
  const [status, setStatus] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    fetch("/api/audit/status", {
      headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
    })
      .then(unwrap)
      .then(setStatus);
  }, []);

  const runVerification = async () => {
    setVerifying(true);
    try {
      const res = await fetch("/api/audit/verify", { method: "GET" });
      const data = await unwrap(res);
      setResult(data);
    } catch (e) {
      console.error(e);
    }
    setVerifying(false);
  };

  if (!status) return html`<div>Loading Mesh Integrity...</div>`;

  return html`
    <div class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-white/5 p-4 border border-white/10 rounded-lg">
          <div class="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Local Chain Head</div>
          <div class="font-mono text-xs text-blue-400 truncate">${status.localHash}</div>
        </div>
        <div class="bg-white/5 p-4 border border-white/10 rounded-lg">
          <div class="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Event Count</div>
          <div class="text-xl font-bold text-white">${status.count}</div>
        </div>
        <div class="bg-white/5 p-4 border border-white/10 rounded-lg">
          <div class="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Mesh Sync Status</div>
          <div class="text-xs text-green-500 font-bold uppercase tracking-widest">In Sync</div>
        </div>
      </div>

      <div class="bg-slate-900/50 border border-white/10 rounded-lg p-4">
        <h3 class="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
          Audit Chain Verification
        </h3>
        <p class="text-sm text-slate-400 mb-4">
          Perform a deep scan of the local audit ledger to ensure the SHA-256 hash chain is unbroken and hasn't' been tampered with.
        </p>

        <button 
          onClick=${runVerification}
          disabled=${verifying}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded font-bold text-xs uppercase tracking-widest"
        >
          ${verifying ? "Verifying Chain..." : "Run Full Integrity Scan"}
        </button>

        ${result && html`
          <div class=${`mt-6 p-4 rounded border ${result.valid ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
             <div class="flex items-center gap-3">
               <div class=${`w-2 h-2 rounded-full ${result.valid ? 'bg-green-500' : 'bg-red-500'} `} />
               <span class=${`font-bold text-sm uppercase tracking-widest ${result.valid ? 'text-green-400' : 'text-red-400'}`}>
                 ${result.valid ? "Integrity Verified" : "INTEGRITY BREACH DETECTED"}
               </span>
             </div>
             <div class="mt-2 text-xs text-slate-500">
               Checked ${result.eventsChecked} events in the local ledger.
             </div>
             ${!result.valid && html`
               <div class="mt-4 p-3 bg-black/40 rounded font-mono text-[10px] text-red-400">
                  BROKEN AT EVENT: ${result.brokenAt.eventId}<br/>
                  EXPECTED: ${result.brokenAt.expected}<br/>
                  ACTUAL: ${result.brokenAt.actual}
               </div>
             `}
          </div>
        `}
      </div>
    </div>
  `;
}
