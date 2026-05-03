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
      
      {/* 01_Unified_Page_Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>Alert Relay</h1>
          <span class="subtitle">External Pipeline Active // Sync Status: Secure</span>
        </div>
        <div class="flex items-center gap-6">
           <div class="flex items-center gap-4 bg-primary/10 border border-primary/30 px-8 py-4 rounded-full shadow-primary/20">
              <span class="dot active shadow-primary animate-pulse"></span>
              <span class="mono-xs font-black text-primary tracking-[0.4em] uppercase">Pipeline_Active</span>
           </div>
        </div>
      </header>

      {/* 02_Relay_Grid */}
      <div class="grid grid-cols-12 gap-10 animate-fade-in" style="animation-delay: 100ms;">
        {/* Register Endpoint Form */}
        <div class="col-span-12 lg:col-span-4 t-panel glass-panel group p-0 border-t-2 border-slate-800">
           <header class="p-10 border-b border-white/10 flex items-center gap-8 bg-black/40 backdrop-blur-md">
              <div class="p-4 bg-white/5 border border-white/10 text-slate-400 rounded-xl shadow-inner group-hover:text-primary transition-colors duration-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              </div>
              <div>
                 <h3 class="tactical-title text-xl tracking-widest">REGISTER_ENDPOINT</h3>
                 <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em] mt-2">Provision new relay target</p>
              </div>
           </header>
           
           <div class="p-12 bg-black/20">
              <form id="webhook-form" class="space-y-10">
                <div class="group/field">
                  <label class="mono-xs text-slate-500 font-black uppercase tracking-widest mb-4 block group-hover/field:text-primary transition-colors">Endpoint_Manifest_Name</label>
                  <input type="text" id="wh-name" placeholder="PRODUCTION_SIEM_ALERTS" class="t-input w-full pl-8 py-5" required />
                </div>
                <div class="group/field">
                  <label class="mono-xs text-slate-500 font-black uppercase tracking-widest mb-4 block group-hover/field:text-primary transition-colors">Target_Webhook_URI</label>
                  <input type="url" id="wh-url" placeholder="https://hooks.relay.io/..." class="t-input w-full pl-8 py-5 font-mono text-[12px] tracking-tight" required />
                </div>
                <div class="group/field">
                  <label class="mono-xs text-slate-500 font-black uppercase tracking-widest mb-4 block group-hover/field:text-primary transition-colors">Relay_Protocol_Type</label>
                  <div class="relative">
                    <select id="wh-type" class="t-input w-full pl-8 pr-16 py-5 cursor-pointer appearance-none font-black uppercase tracking-widest text-[11px]">
                      <option value="slack">Slack_App_Relay</option>
                      <option value="discord">Discord_Webhook</option>
                      <option value="generic">Generic_JSON_POST</option>
                    </select>
                    <div class="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600">
                       <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m6 9 6 6 6-6"/></svg>
                    </div>
                  </div>
                </div>
                <button type="submit" class="t-btn w-full py-6 mt-6 font-black uppercase tracking-[0.4em] shadow-primary/10 transition-all hover:translate-y-[-4px] group/btn">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="mr-3 group-hover/btn:scale-110 transition-transform"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                  Initialize_Relay_Link
                </button>
                <p id="webhook-status" class="mono-xs font-black uppercase text-slate-700 text-center italic opacity-60 mt-6 tracking-widest"></p>
              </form>
           </div>
        </div>

        {/* Active Relays List */}
        <div class="col-span-12 lg:col-span-8 t-panel glass-panel overflow-hidden border-t-2 border-slate-800 group">
           <header class="p-12 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
              <div class="flex items-center gap-8">
                 <div class="p-4 bg-primary/10 border border-primary/20 text-primary rounded-xl shadow-primary/20 group-hover:scale-110 transition-transform duration-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                 </div>
                 <div class="flex flex-col gap-2">
                    <h2 class="tactical-title text-2xl tracking-widest">ACTIVE_RELAY_REGISTRY</h2>
                    <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em] mt-1">Authorized Ingress/Egress Points</p>
                 </div>
              </div>
              <button id="test-all-btn" class="t-btn px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] shadow-inner group/btn">
                 <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="mr-2 group-hover/btn:animate-spin"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                 Test_All_Relays
              </button>
           </header>
           
           <div id="webhook-list" class="p-12 space-y-8 bg-black/20 min-h-[600px] shadow-inner">
              <div class="p-40 text-center border border-dashed border-white/5 rounded-2xl opacity-20 flex flex-col items-center gap-10">
                 <div class="w-16 h-16 border-2 border-primary border-t-transparent rounded-full animate-spin shadow-primary"></div>
                 <span class="mono-xs font-black text-primary tracking-[0.5em] uppercase animate-pulse">Syncing_Relay_Registry...</span>
              </div>
           </div>
        </div>
      </div>
      
      <div class="mt-16 animate-fade-in" style="animation-delay: 300ms;">
         <div class="t-panel glass-panel p-10 border border-dashed border-white/5 rounded-2xl opacity-40">
            <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.3em] leading-loose text-center italic">
              All alert payloads are signed via <span class="text-primary">Ed25519</span> before relay. Remote endpoints must support HMAC-SHA256 signature verification. <br/>
              <span class="text-slate-700">Protocol_Security: Maximum_Enforced</span>
            </p>
         </div>
      </div>

      <webhook-manager></webhook-manager>
    </Layout>
  );
};
