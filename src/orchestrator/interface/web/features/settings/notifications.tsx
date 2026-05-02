import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { ApplicationStatus } from "@core/ports.ts";

export const NotificationsPage = (props: { status: ApplicationStatus, csrfToken?: string }) => {
  const islandPaths = ['/pages/dashboard/islands/WebhookManager.js'];

  return (
    <Layout title="Alert Configuration" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      <div class="mb-12">
        <h1 class="text-4xl font-black tracking-tighter uppercase mb-2 flex items-center gap-4">
          <span class="w-2 h-10 bg-cyber rounded-full"></span>
          ALERT_PIPELINE
        </h1>
        <p class="text-slate-500 text-xs font-bold tracking-[0.4em] uppercase ml-6">Webhook Configuration // External Notification Targets // Incident_Relay</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* ADD WEBHOOK FORM */}
        <div class="glass-panel rounded-3xl border border-white/5 p-10 group hover:border-white/10 transition-all shadow-2xl">
           <div class="flex items-center gap-4 mb-10 pb-6 border-b border-white/10">
              <div class="p-3 bg-white/5 rounded-xl text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              </div>
              <h3 class="text-xs font-black uppercase tracking-[0.3em] text-white/80 italic">Register_New_Endpoint</h3>
           </div>
           <form id="webhook-form" class="space-y-8">
            <div>
              <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">Endpoint_Name</label>
              <input type="text" id="wh-name" placeholder="PRODUCTION_ALERTS" class="w-full bg-black/40 border border-white/10 rounded-2xl text-[11px] font-black uppercase p-5 focus:border-cyber outline-none transition-all text-white placeholder:text-slate-800" required />
            </div>
            <div>
              <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">Webhook_URL</label>
              <input type="url" id="wh-url" placeholder="https://hooks.slack.com/services/..." class="w-full bg-black/40 border border-white/10 rounded-2xl text-[11px] font-mono p-5 focus:border-cyber outline-none transition-all text-white placeholder:text-slate-800" required />
            </div>
            <div>
              <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">Platform_Type</label>
              <select id="wh-type" class="w-full bg-black/40 border border-white/10 rounded-2xl text-[11px] font-black uppercase p-5 focus:border-cyber outline-none transition-all text-white appearance-none cursor-pointer">
                <option value="slack">Slack</option>
                <option value="discord">Discord</option>
                <option value="generic">Generic (JSON POST)</option>
              </select>
            </div>
            <button type="submit" class="w-full bg-white text-black py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] transition-all hover:bg-cyber hover:text-white shadow-[0_10px_30px_-10px_rgba(255,255,255,0.3)] hover:scale-[1.02] active:scale-95">
              Initialize_Link
            </button>
            <p id="webhook-status" class="text-[10px] font-black uppercase text-slate-500 text-center italic opacity-60"></p>
          </form>
        </div>

        {/* REGISTERED WEBHOOKS */}
        <div class="lg:col-span-2 glass-panel rounded-3xl border border-white/5 p-10 group hover:border-white/10 transition-all shadow-2xl flex flex-col">
           <div class="flex justify-between items-center mb-10 pb-6 border-b border-white/10">
              <div class="flex items-center gap-4">
                 <div class="p-3 bg-white/5 rounded-xl text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                 </div>
                 <h3 class="text-xs font-black uppercase tracking-[0.3em] text-white/80 italic">Active_Relay_Endpoints</h3>
              </div>
              <button id="test-all-btn" class="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white rounded-xl transition-all active:scale-95">Test_All_Links</button>
           </div>
           <div id="webhook-list" class="flex-grow space-y-6">
              <div class="p-12 text-center text-slate-500 text-[11px] font-black uppercase tracking-widest italic opacity-50">
                 Syncing_Relay_Registry...
              </div>
           </div>
        </div>
      </div>
      <webhook-manager></webhook-manager>
    </Layout>
  );
};
