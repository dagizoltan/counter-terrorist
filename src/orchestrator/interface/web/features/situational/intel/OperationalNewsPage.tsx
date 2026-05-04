import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * News Feed Page
 * Detailed tactical signals and global intelligence archive.
 * Refined for high-readability and zero-underscore policy.
 */
export const NewsPage = (props: { status: any, csrfToken?: string }) => {
  return (
    <Layout title="Tactical News // Intelligence Feed" islandPaths={[
      '/components/islands/NewsFeed.js'
    ]} csrfToken={props.csrfToken}>
      
      <header class="page-header animate-in fade-in slide-in-from-top-4 duration-700">
        <div class="title-group">
          <h1 class="tactical-title text-4xl">Tactical News</h1>
          <span class="subtitle">Global Signal Intelligence & Operational Feed // OSINT Desynchronized</span>
        </div>
        <div class="flex items-center gap-6">
           <div class="flex items-center gap-4 bg-success/10 border border-success/30 px-8 py-4 rounded-full backdrop-blur-xl">
              <span class="dot active"></span>
              <span class="mono-xs font-black text-success tracking-[0.4em] uppercase">Signals Live</span>
           </div>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-6 mb-8">
        <div class="col-span-12 t-panel glass-panel p-0 border-t-2 border-slate-700 group transition-all hover:bg-white/[0.01]">
          <header class="p-8 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
            <div class="flex flex-col gap-2">
               <h3 class="tactical-title text-2xl tracking-widest uppercase">Intelligence Archive</h3>
               <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em]">Historical and real-time signal intercepts</p>
            </div>
            <div class="flex gap-4">
               <button class="t-btn px-6 py-3 text-[10px] font-black uppercase tracking-widest" onclick="location.reload()">Refresh Feed</button>
            </div>
          </header>
          <div class="bg-black/60 p-12 min-h-[800px] relative">
            <news-feed detailed="true" limit="100"></news-feed>
          </div>
        </div>
      </div>
    </Layout>
  );
};
