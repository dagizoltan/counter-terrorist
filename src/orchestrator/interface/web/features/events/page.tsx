/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const EventsPage = (props: { csrfToken?: string }) => {
  const islandPaths = ['/pages/dashboard/islands/BlockingLog.js'];

  return (
    <Layout title="Security Events" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      <div class="mb-12">
        <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Live Threat Stream</h2>
        <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Real-time forensic telemetry // Unified event pipeline</p>
      </div>

      <div class="bg-white/5 border border-white/5">
        <div class="p-8 pb-4 border-b border-white/5 flex justify-between items-center">
          <h2 class="text-xs font-black uppercase tracking-[0.3em]">Full forensic log</h2>
          <div class="flex gap-4 items-center">
            <span class="text-[9px] text-slate-500 tracking-widest uppercase">Stream Active</span>
            <div class="w-1.5 h-1.5 bg-red-600 animate-pulse"></div>
          </div>
        </div>
        <div class="min-h-[700px]">
          <blocking-log id="main-log-full"></blocking-log>
        </div>
      </div>
    </Layout>
  );
};
