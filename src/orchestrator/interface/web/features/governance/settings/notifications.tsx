import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { ApplicationStatus } from "@core/ports.ts";

/**
 * Notifications Page
 * External alert relay and webhook management.
 */
export const NotificationsPage = (props: { status: ApplicationStatus, csrfToken?: string }) => {
  const islandPaths = ['/components/islands/WebhookManager.js'];

  return (
    <Layout title="Alert Relay // Governance" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      
      {/* 01_Header_Section */}
      <header class="flex justify-between items-end mb-16 animate-fade-in">
        <div class="flex items-center gap-8">
          <div class="w-3 h-16 bg-primary rounded shadow-primary"></div>
          <div class="flex flex-col gap-2">
            <h1 class="text-6xl font-black text-white tracking-tighter leading-none m-0 uppercase italic">Alert_Relay</h1>
            <div class="flex items-center gap-6">
              <div class="flex items-center gap-2">
                <span class="dot active shadow-primary animate-pulse"></span>
                <span class="mono-xs font-black text-primary tracking-widest uppercase">External_Pipeline_Active</span>
              </div>
              <span class="text-slate-700">/</span>
              <div class="mono-xs font-bold text-slate-500 tracking-widest uppercase">Sync_Status: SECURE</div>
            </div>
          </div>
        </div>
      </header>

      {/* 02_Relay_Grid */}
      <div class="grid grid-cols-12 gap-8 animate-fade-in" style="animation-delay: 100ms;">
        {/* Register Endpoint Form */}
        <div class="col-span-12 lg:col-span-4 t-panel glass-panel group p-10 border-t-2 border-slate-800">
           <header class="flex items-center gap-6 mb-12 pb-6 border-b border-white/5">
              <div class="p-4 bg-white/5 border border-white/10 text-slate-400 rounded-lg shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              </div>
              <h3 class="tactical-title text-sm uppercase tracking-widest">REGISTER_ENDPOINT</h3>
           </header>
           
           <form id="webhook-form" class="space-y-8">
            <div>
              <label class="metric-tag block mb-3">Endpoint_Manifest_Name</label>
              <input type="text" id="wh-name" placeholder="PRODUCTION_SIEM_ALERTS" class="t-input w-full pl-6" required />
            </div>
            <div>
              <label class="metric-tag block mb-3">Target_Webhook_URI</label>
              <input type="url" id="wh-url" placeholder="https://hooks.relay.io/..." class="t-input w-full pl-6 font-mono text-[11px]" required />
            </div>
            <div>
              <label class="metric-tag block mb-3">Relay_Protocol_Type</label>
              <div class="relative">
                <select id="wh-type" class="t-input w-full pl-6 pr-12 cursor-pointer appearance-none">
                  <option value="slack">Slack_App_Relay</option>
                  <option value="discord">Discord_Webhook</option>
                  <option value="generic">Generic_JSON_POST</option>
                </select>
                <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-700">
                   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>
            </div>
            <button type="submit" class="t-btn w-full py-5 mt-6 font-black uppercase tracking-[0.2em] shadow-primary/10 transition-all hover:translate-y-[-2px]">
              Initialize_Relay_Link
            </button>
            <p id="webhook-status" class="mono-xs font-black uppercase text-slate-700 text-center italic opacity-60 mt-4"></p>
          </form>
        </div>

        {/* Active Relays List */}
        <div class="col-span-12 lg:col-span-8 t-panel glass-panel p-10 border-t-2 border-slate-800">
           <header class="flex justify-between items-center mb-12 pb-6 border-b border-white/5">
              <div class="flex items-center gap-6">
                 <div class="p-4 bg-primary/10 border border-primary/20 text-primary rounded-lg shadow-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                 </div>
                 <div class="flex flex-col gap-1">
                    <h3 class="tactical-title text-sm uppercase tracking-widest">ACTIVE_RELAY_REGISTRY</h3>
                    <p class="mono-xs text-slate-500 font-bold uppercase">Authorized Ingress/Egress Points</p>
                 </div>
              </div>
              <button id="test-all-btn" class="t-btn px-6 py-2 text-[9px] font-black uppercase tracking-widest shadow-inner">Test_All_Relays</button>
           </header>
           
           <div id="webhook-list" class="space-y-6">
              <div class="p-24 text-center border border-dashed border-white/5 rounded-xl opacity-30 flex flex-col items-center gap-6">
                 <div class="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin shadow-primary"></div>
                 <span class="mono-xs font-black text-primary tracking-[0.4em] uppercase animate-pulse">Syncing_Relay_Registry...</span>
              </div>
           </div>
        </div>
      </div>
      
      <div class="mt-12 animate-fade-in" style="animation-delay: 300ms;">
         <div class="t-panel glass-panel p-8 opacity-40">
            <p class="mono-xs text-slate-500 font-bold uppercase leading-relaxed text-center italic">
              All alert payloads are signed via <span class="text-primary">Ed25519</span> before relay. Remote endpoints must support HMAC-SHA256 signature verification.
            </p>
         </div>
      </div>

      <webhook-manager></webhook-manager>
    </Layout>
  );
};
