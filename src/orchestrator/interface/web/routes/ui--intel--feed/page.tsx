import { jsx as _jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * News Feed Page
 * Detailed tactical signals and global intelligence archive.
 * Refined for high-readability and zero-underscore policy.
 */
export const NewsPage = (props: { status: Record<string, unknown>, csrfToken?: string, nonce?: string, userRole?: string }) => {
  return (
    <Layout title="Tactical News // Intelligence Feed" islandPaths={[
      '/components/islands/NewsFeed.js'
    ]} csrfToken={props.csrfToken} nonce={props.nonce} userRole={props.userRole}>
      
      <header class="page-header animate-in fade-in slide-in-from-top-4 duration-700">
        <div class="title-group">
          <h1 class="tactical-title text-4xl">Tactical News</h1>
          <span class="subtitle">Global Signal Intelligence & Operational Feed // OSINT Desynchronized</span>
        </div>
        <div class="flex items-center gap-4">
           <div class="flex items-center gap-4 bg-success/10 border border-success/30 px-4 py-4 rounded-full backdrop-blur-xl">
              <span class="dot active"></span>
              <span class="eyebrow" data-tone="success">Signals Live</span>
           </div>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-4 mb-4">
        <div class="col-span-12 t-panel glass-panel p-0 border-t-2 border-slate-700 group transition-all hover:bg-white/[0.01]">
          <header class="p-4 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
            <div class="flex flex-col gap-2">
               <h3 class="tactical-title text-2xl tracking-widest uppercase">Intelligence Archive</h3>
               <p class="eyebrow">Historical and real-time signal intercepts</p>
            </div>
            <div class="flex gap-4">
               <button type="button" class="t-btn px-4 py-3 text-[10px] font-black uppercase tracking-widest" data-action="reload">Refresh Feed</button>
            </div>
          </header>
          <div class="bg-black/60 p-5 min-h-[800px] relative">
            <news-feed detailed="true" limit="100"></news-feed>
          </div>
        </div>
      </div>
    </Layout>
  );
};
