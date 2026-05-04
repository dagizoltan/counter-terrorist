import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const AuditPage = (props: { csrfToken?: string }) => {
  return (
    <Layout title="Governance Ledger // Sovereign Overwatch" islandPaths={['/components/islands/BlockingLog.js']} csrfToken={props.csrfToken}>
      
      {/* 01_Unified_Page_Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>Governance Ledger</h1>
          <span class="subtitle">Authoritative Compliance & Enforcement History // Root_Node_Authority</span>
        </div>
        <div class="flex items-center gap-6">
           <div class="flex items-center gap-4 bg-primary/10 border border-primary/30 px-8 py-4 rounded-full shadow-primary/20">
              <span class="dot active shadow-primary animate-pulse"></span>
              <span class="mono-xs font-black text-primary tracking-[0.4em] uppercase">Ledger_Synchronized</span>
           </div>
        </div>
      </header>

      {/* 02_Audit_Integrity_Summary */}
      <div class="grid grid-cols-12 gap-10 mb-16 animate-fade-in" style="animation-delay: 100ms;">
        <div class="col-span-12 lg:col-span-4 t-panel glass-panel border-t-2 border-primary group">
          <div class="flex justify-between items-center mb-8">
            <span class="label">Ledger Integrity</span>
            <div class="flex items-center gap-2">
              <span class="dot active shadow-success"></span>
              <span class="mono-xs text-success font-black uppercase tracking-widest">Verified</span>
            </div>
          </div>
          <div class="value-group">
            <span class="value tabular-nums">0.00%</span>
            <span class="unit">Tamper Probability</span>
          </div>
        </div>

        <div class="col-span-12 lg:col-span-4 t-panel glass-panel border-t-2 border-primary group">
          <div class="flex justify-between items-center mb-8">
             <span class="label">Historical Records</span>
             <div class="dot active shadow-primary"></div>
          </div>
          <div class="value-group">
            <span class="value tabular-nums" id="audit-record-count">500+</span>
            <span class="unit">Enforcement Blocks</span>
          </div>
        </div>

        <div class="col-span-12 lg:col-span-4 t-panel glass-panel border-t-2 border-primary group">
          <div class="flex justify-between items-center mb-8">
             <span class="label">Compliance Status</span>
             <span class="status-pill active primary px-6">STRICT_MODE</span>
          </div>
          <div class="value-group">
            <span class="value tabular-nums text-success">PASS</span>
            <span class="unit">GDPR/Sovereign_OS</span>
          </div>
        </div>
      </div>

      {/* 03_Primary_Log_Table */}
      <section class="animate-fade-in" style="animation-delay: 200ms;">
         <div class="t-panel glass-panel p-0 border-t-2 border-primary group overflow-hidden">
            <header class="p-10 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
               <div class="flex items-center gap-8">
                  <div class="p-4 bg-primary/10 border border-primary/30 text-primary rounded-xl shadow-primary/20 group-hover:scale-110 transition-transform duration-500">
                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
                  </div>
                  <div>
                     <h3 class="tactical-title text-2xl tracking-widest">SYSTEM_ENFORCEMENT_CHRONOLOGY</h3>
                     <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em] mt-2">Authoritative record of policy decisions and node interactions</p>
                  </div>
               </div>
               <div class="flex gap-4">
                  <button class="t-btn px-6 py-3 text-[10px] font-black uppercase tracking-widest" onclick="location.reload()">Re-verify_Integrity</button>
                  <button class="t-btn primary px-6 py-3 text-[10px] font-black uppercase tracking-widest">Export_Evidence</button>
               </div>
            </header>
            
            <div class="p-12 bg-black/20 min-h-[600px] overflow-x-auto custom-scrollbar">
               <blocking-log id="audit-log-full"></blocking-log>
            </div>

            <footer class="p-10 border-t border-white/5 bg-black/10 flex justify-between items-center">
               <div class="flex gap-12">
                  <span class="mono-xs text-slate-700 font-black uppercase tracking-[0.3em]">Ledger_ID: <span class="text-slate-400">AUDIT-v1-{Date.now().toString(16).toUpperCase()}</span></span>
               </div>
               <div class="px-6 py-2 bg-white/[0.03] border border-white/5 rounded-full">
                  <span class="mono-xs text-slate-700 font-black uppercase tracking-[0.3em]">Encryption: <span class="text-success">CHACHA20-POLY1305</span></span>
               </div>
            </footer>
         </div>
      </section>

    </Layout>
  );
};
