import { jsx } from "hono/jsx";

/**
 * Sovereign App Shell // v5.2-STABLE
 * Hardened tactical interface with 3-column operational grid.
 * Optimized for consistent high-fidelity rendering.
 * Refactored: Forensic tabs migrated to Global Header.
 */
export const Layout = (props: {
  title: string;
  children: any;
  csrfToken?: string;
  nonce?: string;
  hostname?: string;
  islandPaths?: string[];
}) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="csrf-token" content={props.csrfToken} />
        <title>{props.title} | {props.hostname || 'Sovereign Orchestrator'}</title>
        <link rel="stylesheet" href="/style.css" />
        <script nonce={props.nonce} dangerouslySetInnerHTML={{ __html: `
          window.escapeHTML = function(str) {
            if (!str) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
          };
        ` }} />
      </head>
      <body class="bg-[#050505] text-slate-100 font-sans selection:bg-primary/30 overflow-hidden">
        <div class="noise-overlay pointer-events-none opacity-[0.03]"></div>
        <div class="system-scan-overlay pointer-events-none opacity-[0.02]"></div>
        
        <div class="app-shell">
          
          {/* ── 01 Navigation Deck (Left) ─────────────────────────────── */}
          <aside class="shell-sidebar relative">
            <header class="h-[var(--header-height-sm)] px-8 flex items-center border-b border-white/5 bg-black/20 shrink-0">
               <h1 class="text-lg font-black tracking-[0.2em] uppercase italic leading-none text-white">COUNTER-TERRORIST</h1>
            </header>

            <nav class="flex-grow overflow-y-auto custom-scrollbar p-4 space-y-1">
              {/* 01 MONITOR (System Awareness) */}
              <div class="nav-group mb-6 mt-2">
                <div class="nav-heading !text-primary flex items-center gap-3">
                   <div class="w-1 h-3 bg-primary rounded-full"></div>
                   01 // MONITOR
                </div>
                <a href="/dashboard" class="nav-link flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
                   <svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                   System Overview
                </a>
                <a href="/network/neighbors" class="nav-link flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
                   <svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
                   Network Signals
                </a>
                <a href="/agents" class="nav-link flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
                   <svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><path d="M12 7v5l3 3"/></svg>
                   Agent Fleet Status
                </a>
              </div>

              {/* 02 INTELLIGENCE (Threat Intel) */}
              <div class="nav-group mb-6">
                <div class="nav-heading !text-warning flex items-center gap-3">
                   <div class="w-1 h-3 bg-warning rounded-full"></div>
                   02 // INTELLIGENCE
                </div>
                <a href="/intel/feed" class="nav-link flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
                   <svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                   Open Source Intel
                </a>
                <a href="/intel/public-ip-collections" class="nav-link flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
                   <svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
                   IP Threat Databases
                </a>
                <a href="/intel/map" class="nav-link flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
                   <svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
                   Global Threat Map
                </a>
              </div>

              {/* 03 DEFENSE (Active Protection) */}
              <div class="nav-group mb-6">
                <div class="nav-heading !text-danger flex items-center gap-3">
                   <div class="w-1 h-3 bg-danger rounded-full"></div>
                   03 // DEFENSE
                </div>
                <a href="/agents/sentinel" class="nav-link flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
                   <svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                   Firewall & Perimeter
                </a>
                <a href="/agents/deception" class="nav-link flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
                   <svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>
                   Deception Grid
                </a>
              </div>


              {/* 05 SYSTEM (Administration) */}
              <div class="nav-group pt-4 border-t border-white/5 mt-4 mb-8">
                <div class="nav-heading !text-slate-500 flex items-center gap-3 mb-2">
                   <div class="w-1 h-3 bg-slate-700 rounded-full"></div>
                   05 // SYSTEM
                </div>
                <a href="/system/info" class="nav-link flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
                   <svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                   Platform Status
                </a>
                <a href="/system/settings" class="nav-link flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
                   <svg class="group-hover:scale-110 transition-transform" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1-2 2 2 2 0 0 1 2-2v-.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                   Global Settings
                </a>
              </div>
            </nav>

            <footer class="p-4 border-t border-white/5 bg-black/20">
               <form method="POST" action="/logout">
                  <input type="hidden" name="csrfToken" value={props.csrfToken} />
                  <button type="submit" class="t-btn danger w-full justify-center group py-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="group-hover:translate-x-1"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Terminate Session
                  </button>
               </form>
            </footer>
          </aside>


          {/* ── 02 Operational Main (Center) ──────────────────────────── */}
          <main class="shell-main relative z-10">
             {/* Main Deck Header */}
             <header class="shell-header h-[var(--header-height)] !px-6 flex items-center justify-between border-b border-white/5 bg-black/20">
                <div class="flex items-center gap-8">
                   <div class="flex items-center gap-3">
                      <span class="dot active"></span>
                      <span class="mono-xs font-black text-primary tracking-[0.4em] uppercase">{props.hostname || 'Sovereign Active'}</span>
                   </div>
                   <div class="hidden lg:flex items-center gap-3">
                      <span class="text-slate-600 font-bold">/</span>
                      <a href="/system/ledger" class="mono-xs font-black text-slate-500 tracking-[0.2em] uppercase transition-colors hover:text-primary cursor-pointer">Ledger</a>
                      <span class="text-slate-600 font-bold">/</span>
                      <a href="/forensics" class="mono-xs font-black text-slate-500 tracking-[0.2em] uppercase transition-colors hover:text-primary cursor-pointer">Forensics</a>
                      <span class="text-slate-600 font-bold">/</span>
                      <a href="/compliance" class="mono-xs font-black text-slate-500 tracking-[0.2em] uppercase transition-colors hover:text-primary cursor-pointer">Compliance</a>
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

             {/* Content Stage */}
             <div class="shell-content">
                {/* Background Tactical Elements */}
                <div class="absolute inset-0 pointer-events-none opacity-10 z-0">
                   <div class="absolute top-40 right-10 w-40 h-40 bg-primary/5 blur-[120px] rounded-full"></div>
                </div>
                
                <div class="relative z-10 pt-12">
                   {props.children}
                </div>
             </div>
          </main>

          {/* ── 03 Forensic Telemetry (Right) ─────────────────────────── */}
          <aside class="shell-aside relative z-20 flex flex-col border-l border-white/5 bg-[#080808]">
             {/* Sidebar Header with Icon Tabs */}
             <header class="h-[var(--header-height)] px-8 flex justify-between items-center border-b border-white/5 bg-black/20 shrink-0">
                <div class="flex items-center gap-3 ml-2">
                   <span class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em]">Forensic Audit</span>
                   <div class="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></div>
                </div>

                <div id="module-nav-container" class="flex gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                   <button id="btn-integrity" data-tab="integrity" class="sidebar-nav-icon" title="System Integrity">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                   </button>
                   <button id="btn-logs" data-tab="logs" class="sidebar-nav-icon active" title="Live Telemetry">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12H3"/><path d="M21 6H3"/><path d="M21 18H3"/><path d="M10 6L10 18"/></svg>
                   </button>
                </div>
             </header>

             <div class="flex-grow overflow-y-auto custom-scrollbar px-4 pb-4">
                {/* Tab Content: Integrity */}
                <div id="sidebar-tab-integrity" class="sidebar-tab-content hidden pt-6 animate-in fade-in slide-in-from-right-4 duration-500">
                   <div class="mb-10">
                      <div class="flex items-center gap-2 mb-6 px-2">
                         <div class="w-1 h-3 bg-primary rounded-full"></div>
                         <span class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em]">System Health</span>
                      </div>
                      <system-health></system-health>
                   </div>
                </div>

                {/* Tab Content: Logs */}
                <div id="sidebar-tab-logs" class="sidebar-tab-content pt-6 animate-in fade-in slide-in-from-right-4 duration-500">
                   <div class="mb-10">
                      <div class="flex justify-between items-center mb-6 px-2">
                         <div class="flex items-center gap-2">
                            <div class="w-1 h-3 bg-primary rounded-full"></div>
                            <span class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em]">Live_Telemetry</span>
                         </div>
                         <div class="flex items-center gap-2 bg-success/5 border border-success/20 px-3 py-1 rounded-full">
                            <div class="w-1.5 h-1.5 bg-success rounded-full animate-pulse shadow-[0_0_8px_var(--success)]"></div>
                            <span class="mono text-[7px] text-success font-black uppercase tracking-widest">Live</span>
                         </div>
                      </div>
                      <mini-log id="sidebar-log"></mini-log>
                   </div>
                </div>
             </div>

             <footer class="p-6 border-t border-white/5 bg-black/40">
                <div class="flex justify-between items-center mb-3">
                   <span class="mono-xs font-black text-slate-500 uppercase tracking-widest">Operational Trust</span>
                   <span class="mono-xs font-black text-primary tracking-widest uppercase tabular-nums">99.9%</span>
                </div>
                <div class="h-1 bg-white/5 rounded-full overflow-hidden relative">
                   <div class="absolute inset-0 bg-primary/20 blur-sm"></div>
                   <div class="h-full bg-primary relative z-10 shadow-[0_0_10px_var(--primary)]" style="width: 99.9%"></div>
                </div>
             </footer>
          </aside>

        </div>

         {/* Global Orchestration Components */}
        <metrics-hydrator></metrics-hydrator>
        <alert-overlay></alert-overlay>
        <toast-manager></toast-manager>
        
        {/* Authoritative Script Injection */}
        <script type="module" src="/components/islands/SharedWebSocket.js" nonce={props.nonce}></script>
        <script type="module" src="/components/islands/MetricsHydrator.js" nonce={props.nonce}></script>
        <script type="module" src="/components/islands/AlertOverlay.js" nonce={props.nonce}></script>
        <script type="module" src="/components/islands/ToastManager.js" nonce={props.nonce}></script>
        <script type="module" src="/components/islands/SystemHealth.js" nonce={props.nonce}></script>
        <script type="module" src="/components/islands/MiniLog.js" nonce={props.nonce}></script>
        
        {props.islandPaths?.map(path => (
          !['SharedWebSocket.js', 'MetricsHydrator.js', 'AlertOverlay.js', 'ToastManager.js', 'SystemHealth.js', 'MiniLog.js'].some(f => path.includes(f)) && 
          <script type="module" src={path} nonce={props.nonce}></script>
        ))}

        <script nonce={props.nonce} dangerouslySetInnerHTML={{ __html: `
          // Unified UI State Manager
          // window.csrfToken is removed for security (SEC-02). 
          // Use document.querySelector('meta[name="csrf-token"]').content instead.
          
          function syncInterface() {
            const path = window.location.pathname;
            
            // Sidebar Navigation Active State
            document.querySelectorAll('.nav-link').forEach(link => {
              const href = link.getAttribute('href');
              const isActive = path === href || (href !== '/' && path.startsWith(href));
              link.classList.toggle('active', isActive);
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


          // Global Tab Switching (Forensics)
          window.switchSidebarTab = function(tab) {
            const contents = document.querySelectorAll('.sidebar-tab-content');
            contents.forEach(c => c.classList.add('hidden'));
            
            const activeContent = document.getElementById('sidebar-tab-' + tab);
            if (activeContent) activeContent.classList.remove('hidden');

            // Update icon states
            const btnIntegrity = document.getElementById('btn-integrity');
            const btnLogs = document.getElementById('btn-logs');
            if (btnIntegrity && btnLogs) {
               btnIntegrity.classList.toggle('active', tab === 'integrity');
               btnLogs.classList.toggle('active', tab === 'logs');
            }
          };

          // Secure Event Delegation for Sidebar
          document.getElementById('module-nav-container')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-tab]');
            if (btn) {
              window.switchSidebarTab(btn.getAttribute('data-tab'));
            }
          });
          
          // Default tab
          window.switchSidebarTab('logs');
        ` }} />
      </body>
    </html>
  );
};
