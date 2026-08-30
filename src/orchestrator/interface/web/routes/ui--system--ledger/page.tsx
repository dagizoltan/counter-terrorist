import { Layout } from "@interface/components/Layout.tsx";

export const AuditPage = (props: { csrfToken?: string, nonce?: string, userRole?: string }) => {
  return (
    <Layout title="Governance Ledger // Sovereign Overwatch" islandPaths={['/components/islands/BlockingLog.js', '/components/islands/LedgerSummary.js']} csrfToken={props.csrfToken} nonce={props.nonce} userRole={props.userRole}>
      
      {/* 01_Unified_Page_Header */}
      <header class="page-header animate-in fade-in slide-in-from-top-4 duration-700">
        <div class="title-group">
          <h1 class="tactical-title text-4xl">Governance_Ledger</h1>
          <span class="subtitle">Authoritative Compliance & Enforcement History // Root_Node_Authority</span>
        </div>

      </header>

      {/* 02_Audit_Integrity_Summary
          Four tiles used to sit here as literals: "Verified / 0.00% Tamper_Prob",
          "1.4K Enforcement_Blocks", "STRICT / PASS GDPR/SOV" and "12 Live_Rules".
          Nothing wrote to any of them — a forensic page asserting a tamper
          probability it never computed. <ledger-summary> reads the audit chain,
          its verification result, the compliance mapping and the live firewall
          rule count. */}
      <ledger-summary></ledger-summary>


      {/* 03_Primary_Log_Table */}
      <section>
         <div class="t-panel glass-panel p-0 border-t-2 border-primary group overflow-hidden">
            <header class="p-4 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
               <div class="flex items-center gap-4">
                  <div class="p-4 bg-primary/10 border border-primary/30 text-primary rounded-lg">
                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
                  </div>
                  <div>
                     <h3 class="tactical-title text-2xl tracking-widest">SYSTEM_ENFORCEMENT_CHRONOLOGY</h3>
                     <p class="eyebrow mt-2">Authoritative record of policy decisions and node interactions</p>
                  </div>
               </div>
               <div class="flex gap-4">
                  <button class="t-btn px-4 py-3 text-[10px] font-black uppercase tracking-widest" data-action="reload">Re-verify_Integrity</button>
                  {(props.userRole === "admin" || props.userRole === "operator") && (
                  <button class="t-btn primary px-4 py-3 text-[10px] font-black uppercase tracking-widest">Export_Evidence</button>
                  )}
               </div>
            </header>
            
            <div class="p-4 bg-black/20 min-h-[600px] overflow-x-auto custom-scrollbar">
               <blocking-log id="audit-log-full"></blocking-log>
            </div>

            <footer class="p-4 border-t border-white/5 bg-black/10 flex justify-between items-center">
               <div class="flex gap-4">
                  <span class="eyebrow">Ledger_ID: <span class="text-slate-400">AUDIT-v1-{Date.now().toString(16).toUpperCase()}</span></span>
               </div>
               <div class="px-4 py-2 bg-white/[0.03] border border-white/5 rounded-full">
                  <span class="eyebrow">Encryption: <span class="text-success">CHACHA20-POLY1305</span></span>
               </div>
            </footer>
         </div>
      </section>

    </Layout>
  );
};
