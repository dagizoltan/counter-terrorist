/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "../Layout.tsx";

export const NotificationsPage = (props: { csrfToken?: string }) => {
  const islandPaths = ['/pages/dashboard/islands/WebhookManager.js'];

  return (
    <Layout title="Alert Configuration" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      <div class="mb-12">
        <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Alert Pipeline</h2>
        <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Webhook configuration // External notification targets</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ADD WEBHOOK FORM */}
        <div class="bg-white/5 border border-white/5 p-8">
          <h3 class="text-xs font-black uppercase tracking-[0.3em] mb-8 pb-4 border-b border-white/5">Add Webhook</h3>
          <form id="webhook-form" class="space-y-6">
            <div>
              <label class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Name</label>
              <input type="text" id="wh-name" placeholder="PRODUCTION_ALERTS" class="w-full bg-black border border-white/10 text-xs font-bold p-3 outline-none focus:border-white/30" required />
            </div>
            <div>
              <label class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Webhook URL</label>
              <input type="url" id="wh-url" placeholder="https://hooks.slack.com/services/..." class="w-full bg-black border border-white/10 text-xs font-bold p-3 outline-none focus:border-white/30" required />
            </div>
            <div>
              <label class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Type</label>
              <select id="wh-type" class="w-full bg-black border border-white/10 text-xs font-black uppercase p-3 outline-none">
                <option value="slack">Slack</option>
                <option value="discord">Discord</option>
                <option value="generic">Generic (JSON POST)</option>
              </select>
            </div>
            <button type="submit" class="w-full bg-white text-black py-3 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-200 transition-all">
              Register_Webhook
            </button>
            <p id="webhook-status" class="text-[9px] font-bold uppercase text-slate-500 text-center"></p>
          </form>
        </div>

        {/* REGISTERED WEBHOOKS */}
        <div class="lg:col-span-2 bg-white/5 border border-white/5 p-8">
          <div class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
            <h3 class="text-xs font-black uppercase tracking-[0.3em]">Active Webhooks</h3>
            <button id="test-all-btn" class="text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all">Test_All</button>
          </div>
          <div id="webhook-list" class="space-y-4">
            <p class="text-slate-500 text-[10px] font-bold uppercase text-center py-8">Loading webhooks...</p>
          </div>
        </div>
      </div>
      <webhook-manager></webhook-manager>
    </Layout>
  );
};
