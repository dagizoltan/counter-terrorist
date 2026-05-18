import { jsx } from "hono/jsx";

export const GlobalHeader = ({ hostname, title }: { hostname?: string, title: string }) => (
  <header class="shell-header h-[var(--header-height)] !px-6 flex items-center justify-between border-b border-white/5 bg-black/20">
    <div class="flex items-center gap-8">
       <div class="flex items-center gap-3">
          <span class="dot active"></span>
          <span class="mono-xs font-black text-primary tracking-[0.4em] uppercase">{hostname || 'Sovereign Active'}</span>
       </div>
       <div class="hidden lg:flex items-center gap-3">
          <span class="text-slate-600 font-bold">/</span>
          <span class="mono-xs font-black text-slate-500 tracking-[0.2em] uppercase transition-colors hover:text-primary cursor-pointer">Sovereign OS</span>
          <span class="text-slate-600 font-bold">/</span>
          <span class="mono-xs font-black text-white tracking-[0.2em] uppercase">{title.split('//')[0].trim()}</span>
       </div>
    </div>

    <div class="flex items-center gap-6">
        <div class="flex items-center gap-2 bg-danger/5 border border-danger/20 px-4 py-2 rounded-lg">
           <div class="w-1.5 h-1.5 bg-danger rounded-full animate-pulse shadow-[0_0_8px_var(--danger)]"></div>
           <span id="stat-fw-grid" class="mono text-[8px] text-danger font-black uppercase tracking-widest">Grid Armed</span>
        </div>
        <div id="system-clock" class="mono-xs text-slate-400 font-black tracking-[0.2em] bg-black/40 px-4 py-2 rounded border border-white/5">00:00:00</div>
     </div>
  </header>
);
