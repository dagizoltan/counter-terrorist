import { jsx } from "hono/jsx";

/**
 * Sovereign App Shell // v5.1-STABLE
 * Hardened tactical interface with 3-column operational grid.
 * Optimized for consistent high-fidelity rendering.
 */
export const Layout = (props: {
  title: string;
  children: any;
  csrfToken?: string;
  islandPaths?: string[];
}) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="csrf-token" content={props.csrfToken} />
        <title>{props.title} | SOVEREIGN_ORCHESTRATOR</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body class="bg-[#050505] text-slate-100 font-sans selection:bg-primary/30 overflow-hidden">
        <div class="noise-overlay pointer-events-none opacity-[0.03]"></div>
        <div class="system-scan-overlay pointer-events-none opacity-[0.02]"></div>
        
        <div class="app-shell">
          
          {/* ── 01_NAVIGATION_DECK (Left) ─────────────────────────────── */}
          <aside class="shell-sidebar relative shadow-[10px_0_40px_rgba(0,0,0,0.4)]">
            <header class="p-8 border-b border-white/5 relative group cursor-default">
              <div class="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-all duration-700"></div>
              <div class="flex items-center gap-4 relative z-10">
                <div class="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)] group-hover:scale-110 transition-transform duration-500">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                </div>
                <div>
                  <h1 class="text-lg font-black tracking-tighter uppercase italic leading-none">Sovereign</h1>
                  <span class="mono-xs text-primary font-black uppercase tracking-[0.4em] mt-1 block opacity-80">Orchestrator</span>
                </div>
              </div>
            </header>

            <nav class="flex-grow overflow-y-auto custom-scrollbar p-6 space-y-1">
              {/* MONITOR */}
              <div class="nav-group mb-8">
                <div class="nav-heading !text-primary flex items-center gap-3">
                   <div class="w-1 h-3 bg-primary rounded-full"></div>
                   MONITOR
                </div>
                <a href="/dashboard" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                   Mission Dashboard
                </a>
                <a href="/infrastructure" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/></svg>
                   Infrastructure Hub
                </a>
              </div>

              {/* ANALYZE */}
              <div class="nav-group mb-8">
                <div class="nav-heading !text-danger flex items-center gap-3">
                   <div class="w-1 h-3 bg-danger rounded-full"></div>
                   ANALYZE
                </div>
                <a href="/intelligence" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                   Intelligence Deck
                </a>
                <a href="/forensics" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                   Forensics Lab
                </a>
              </div>

              {/* ENFORCE */}
              <div class="nav-group mb-8">
                <div class="nav-heading !text-success flex items-center gap-3">
                   <div class="w-1 h-3 bg-success rounded-full"></div>
                   ENFORCE
                </div>
                <a href="/network" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                   Network Shield
                </a>
                <a href="/deception" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>
                   Deception Array
                </a>
                <a href="/agents" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                   Agent Registry
                </a>
              </div>

              {/* ADMINISTRATION */}
              <div class="nav-group pt-4">
                <div class="nav-heading !text-slate-400 flex items-center gap-3">
                   <div class="w-1 h-3 bg-slate-400 rounded-full"></div>
                   ADMINISTRATION
                </div>
                <a href="/governance" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
                   Governance Ledger
                </a>
                <a href="/settings" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                   System Settings
                </a>
              </div>
            </nav>

            <footer class="p-6 border-t border-white/5 bg-black/20">
               <form method="POST" action="/logout">
                  <input type="hidden" name="csrfToken" value={props.csrfToken} />
                  <button type="submit" class="t-btn danger w-full justify-center group py-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="group-hover:translate-x-1 transition-transform"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Terminate_Session
                  </button>
               </form>
            </footer>
          </aside>

          {/* ── 02_OPERATIONAL_MAIN (Center) ──────────────────────────── */}
          <main class="shell-main relative z-10 shadow-[0_0_50px_rgba(0,0,0,0.8)]">
             {/* Main Deck Header */}
             <header class="shell-header">
                <div class="flex items-center gap-6">
                   <div class="flex items-center gap-3">
                      <span class="dot active pulse shadow-primary"></span>
                      <span class="mono-xs font-black text-slate-400 uppercase tracking-[0.4em]">{props.title?.split('//')[0] || 'STAGING_AREA'}</span>
                   </div>
                   <div class="w-px h-4 bg-white/10"></div>
                   <span class="mono-xs text-slate-700 font-bold uppercase tracking-widest italic opacity-60">{props.title?.split('//')[1] || 'SVRGN_ROOT'}</span>
                </div>
                
                <div class="flex items-center gap-8">
                   <div class="flex items-center gap-3">
                      <span class="mono-xs text-slate-700 font-black tracking-widest uppercase">Encryption:</span>
                      <span class="mono-xs text-success font-black tracking-widest uppercase bg-success/10 px-3 py-1 rounded border border-success/20">AES-256-GCM</span>
                   </div>
                   <div class="w-px h-4 bg-white/10"></div>
                   <div id="system-clock" class="mono-xs text-slate-500 font-black tracking-[0.2em]">00:00:00</div>
                </div>
             </header>

             {/* Content Stage */}
             <div class="shell-content">
                {/* Background Tactical Elements */}
                <div class="absolute inset-0 pointer-events-none opacity-20 z-0">
                   <div class="absolute top-0 left-10 w-px h-full bg-gradient-to-b from-primary/10 via-transparent to-transparent"></div>
                   <div class="absolute top-40 right-10 w-40 h-40 bg-primary/5 blur-[100px] rounded-full"></div>
                </div>
                
                <div class="relative z-10 animate-fade-in pt-12">
                   {props.children}
                </div>
             </div>
          </main>

          {/* ── 03_FORENSIC_TELEMETRY (Right) ─────────────────────────── */}
          <aside class="shell-aside relative z-20 shadow-[-10px_0_40px_rgba(0,0,0,0.4)]">
             <header class="shell-header">
                <div class="flex items-center gap-4">
                   <div class="p-2 bg-danger/10 border border-danger/20 rounded text-danger">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                   </div>
                   <span class="font-black text-[10px] tracking-[0.4em] text-white uppercase">Live_Signals</span>
                </div>
                <div class="status-pill error pulse !px-4 !py-1 text-[8px]">CAPTURING</div>
             </header>

             <div class="flex-grow overflow-y-auto custom-scrollbar p-6 space-y-10">
                <div class="mb-10">
                   <h4 class="mono-xs font-black text-slate-600 mb-6 tracking-[0.3em] uppercase">Node_Integrity</h4>
                   <system-health></system-health>
                </div>
                
                <div class="pt-8 border-t border-white/5">
                   <h4 class="mono-xs font-black text-slate-600 mb-6 tracking-[0.3em] uppercase">Temporal_Buffer</h4>
                   <mini-log></mini-log>
                </div>
             </div>

             <footer class="p-6 border-t border-white/5 bg-black/40">
                <div class="flex justify-between items-center mb-4">
                   <span class="mono-xs font-black text-slate-500 uppercase">Operational_Trust</span>
                   <span class="mono-xs font-black text-primary tracking-widest uppercase">99.9%</span>
                </div>
                <div class="h-1 bg-white/5 rounded-full overflow-hidden">
                   <div class="h-full bg-primary shadow-[0_0_10px_var(--primary)]" style="width: 99.9%"></div>
                </div>
             </footer>
          </aside>

        </div>

        {/* Global Orchestration Components */}
        <metrics-hydrator></metrics-hydrator>
        <alert-overlay></alert-overlay>
        
        {/* Authoritative Script Injection */}
        <script type="module" src="/components/islands/MetricsHydrator.js"></script>
        <script type="module" src="/components/islands/AlertOverlay.js"></script>
        <script type="module" src="/components/islands/SystemHealth.js"></script>
        <script type="module" src="/components/islands/MiniLog.js"></script>
        
        {props.islandPaths?.map(path => (
          !['MetricsHydrator.js', 'AlertOverlay.js', 'SystemHealth.js', 'MiniLog.js'].some(f => path.includes(f)) && 
          <script type="module" src={path}></script>
        ))}

        <script dangerouslySetInnerHTML={{ __html: `
          // Unified UI State Manager
          window.csrfToken = "${props.csrfToken || ''}";
          
          function syncInterface() {
            const path = window.location.pathname;
            document.querySelectorAll('.nav-link').forEach(link => {
              link.classList.toggle('active', link.getAttribute('href') === path);
            });
            
            // Dynamic Clock
            const clock = document.getElementById('system-clock');
            if (clock) {
              const now = new Date();
              clock.innerText = now.toLocaleTimeString('en-GB', { hour12: false });
            }
          }

          setInterval(syncInterface, 1000);
          syncInterface();
          window.addEventListener('popstate', syncInterface);
        ` }} />
      </body>
    </html>
  );
};
