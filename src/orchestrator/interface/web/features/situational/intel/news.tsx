import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const NewsPage = (props: { status: any; csrfToken: string }) => {
  const { platform } = props.status;

  const islandPaths = [
    '/components/islands/TacticalIntel.js',
    '/components/islands/MetricsHydrator.js',
    '/components/islands/NewsFeed.js'
  ];

  return (
    <Layout title="Tactical Intelligence" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      <header class="page-header">
        <div class="title-group">
          <h1>Intelligence Stream</h1>
          <span class="subtitle">Sovereign Signals // Global Threat Feed // v4.2.0</span>
        </div>
        <div class="flex gap-4">
          <button class="t-btn px-6 py-3 group" onclick="window.location.reload()">
            <svg class="transition-transform group-hover:rotate-180" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            REFRESH_SIGNALS
          </button>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-10 mb-16">
        {/* Intelligence Sources Summary */}
        <div class="col-span-12 lg:col-span-4 t-panel glass-panel border-t-2 border-primary">
            <h3 class="tactical-title text-xl tracking-[0.3em] mb-10 pb-6 border-b border-white/5">ACTIVE_SOURCES</h3>
            <div class="space-y-6">
                {[
                    "Krebs on Security", "The Hacker News", "Bleeping Computer", 
                    "Dark Reading", "Schneier on Security", "SANS ISC", 
                    "SecurityWeek", "CyberScoop", "CERT-UA"
                ].map(source => (
                    <div class="flex justify-between items-center p-4 bg-black/20 rounded-lg border border-white/5">
                        <span class="mono-sm text-slate-300">{source}</span>
                        <div class="flex items-center gap-3">
                            <span class="dot active shadow-primary pulse"></span>
                            <span class="mono-xs text-primary opacity-60">SYNCED</span>
                        </div>
                    </div>
                ))}
            </div>
            <div class="mt-10 p-6 bg-primary/5 rounded-xl border border-primary/20">
                <p class="mono-xs text-slate-500 leading-relaxed uppercase">
                    Signals are synchronized every 30 minutes. 
                    Local cache expires in 48 hours for data integrity.
                </p>
            </div>
        </div>

        {/* Detailed Feed */}
        <div class="col-span-12 lg:col-span-8 t-panel glass-panel">
            <div class="flex justify-between items-center mb-10 pb-6 border-b border-white/5">
                <div class="flex items-center gap-6">
                    <div class="w-2.5 h-10 bg-primary rounded-full shadow-primary"></div>
                    <h3 class="tactical-title text-2xl tracking-[0.3em]">INTELLIGENCE_ARCHIVE</h3>
                </div>
                <div class="status-pill primary">LIVE_FEED</div>
            </div>
            
            <div class="min-h-[800px]">
                <news-feed detailed="true"></news-feed>
            </div>
        </div>
      </div>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
