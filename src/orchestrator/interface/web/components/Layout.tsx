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
          <aside class="shell-sidebar relative">
            <header class="p-4 border-b border-white/5 relative group cursor-default">
              <div class="absolute inset-0 bg-primary/5 opacity-0"></div>
              <div class="flex items-center gap-4 relative z-10">
                <div class="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                </div>
                <div>
                  <h1 class="text-base font-black tracking-tighter uppercase italic leading-none">Sovereign</h1>
                  <span class="text-[7px] text-primary font-black uppercase tracking-[0.4em] mt-1 block opacity-80">Orchestrator</span>
                </div>
              </div>
            </header>

            <nav class="flex-grow overflow-y-auto custom-scrollbar p-4 space-y-1">
              {/* DASHBOARD */}
              <div class="nav-group mb-8">
                <div class="nav-heading !text-primary flex items-center gap-3">
                   <div class="w-1 h-3 bg-primary rounded-full"></div>
                   DASHBOARD
                </div>
                <a href="/dashboard" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                   Node
                </a>
                <a href="/infrastructure/mesh" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5"/><path d="M17 12V17a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-5"/><circle cx="12" cy="12" r="3"/></svg>
                   Mesh
                </a>
                <a href="/news" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>
                   News
                </a>
              </div>

              {/* AGENT FLEET */}
              <div class="nav-group mb-8">
                <div class="nav-heading !text-success flex items-center gap-3">
                   <div class="w-1 h-3 bg-success rounded-full"></div>
                   AGENT_FLEET
                </div>
                <a href="/agents/firewall" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                   Firewall
                </a>
                <a href="/agents/deception" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>
                   Deception
                </a>
                <a href="/agents/scanner" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                   Scanner
                </a>
                <a href="/agents/fim" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M10 9H8"/></svg>
                   FIM
                </a>
                <a href="/agents/ebpf" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-7-7 7"/><path d="M12 14V3"/><path d="m5 3 7 7 7-7"/></svg>
                   eBPF
                </a>
                <a href="/agents/pcap" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12H3"/><path d="M21 6H3"/><path d="M21 18H3"/></svg>
                   Packet_Capture
                </a>
              </div>

              {/* NETWORK */}
              <div class="nav-group mb-8">
                <div class="nav-heading !text-warning flex items-center gap-3">
                   <div class="w-1 h-3 bg-warning rounded-full"></div>
                   NETWORK
                </div>
                <a href="/agents/network" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/></svg>
                   Topology
                </a>
              </div>

              {/* SYSTEM */}
              <div class="nav-group pt-4">
                <div class="nav-heading !text-slate-400 flex items-center gap-3">
                   <div class="w-1 h-3 bg-slate-400 rounded-full"></div>
                   SYSTEM
                </div>
                <a href="/governance" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
                   Ledger
                </a>
                <a href="/settings" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                   Settings
                </a>
                <a href="/system/info" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                   Info
                </a>
              </div>
            </nav>

            <footer class="p-4 border-t border-white/5 bg-black/20">
               <form method="POST" action="/logout">
                  <input type="hidden" name="csrfToken" value={props.csrfToken} />
                  <button type="submit" class="t-btn danger w-full justify-center group py-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="group-hover:translate-x-1"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Terminate_Session
                  </button>
               </form>
            </footer>
          </aside>


          {/* ── 02_OPERATIONAL_MAIN (Center) ──────────────────────────── */}
          <main class="shell-main relative z-10">
             {/* Main Deck Header */}
             <header class="shell-header">
                <div class="flex items-center gap-6">
                   <div class="flex items-center gap-3">
                      <span class="dot active"></span>
                      <span class="mono-xs font-black text-primary tracking-[0.4em] uppercase">Sovereign_Active</span>
                   </div>
                </div>
                
                <div class="flex items-center gap-6">
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

          {/* ── 03_FORENSIC_TELEMETRY (Right) ─────────────────────────── */}
          <aside class="shell-aside relative z-20 flex flex-col border-l border-white/5 bg-[#080808]">
             {/* Dynamic Forensic Tabs - Tactical Segmented Control */}
             <header class="p-4 shrink-0">
                <div class="flex bg-black/40 p-1 rounded-lg border border-white/5 relative overflow-hidden group">
                   <div id="tab-indicator" class="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] bg-primary/20 border border-primary/30 rounded-md transition-all duration-300 ease-out z-0 shadow-[0_0_15px_var(--primary-glow)]" style="transform: translateX(100%)"></div>
                   
                   <button id="tab-btn-integrity" 
                           onclick="window.switchSidebarTab('integrity')" 
                           class="flex-1 relative z-10 py-2 flex justify-center items-center transition-all text-slate-500 hover:text-slate-300 outline-none"
                           title="System Integrity">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                   </button>
                   <button id="tab-btn-logs" 
                           onclick="window.switchSidebarTab('logs')" 
                           class="flex-1 relative z-10 py-2 flex justify-center items-center transition-all text-primary outline-none"
                           title="Real-time Logs">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                   </button>
                </div>
             </header>

             <div class="flex-grow overflow-y-auto custom-scrollbar px-4 pb-4">
                {/* Tab Content: Integrity */}
                <div id="sidebar-tab-integrity" class="sidebar-tab-content hidden pt-2 animate-in fade-in slide-in-from-right-4 duration-500">
                   <div class="mb-10">
                      <div class="flex items-center gap-2 mb-6 px-2">
                         <div class="w-1 h-3 bg-primary rounded-full"></div>
                         <span class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em]">System_Health</span>
                      </div>
                      <system-health></system-health>
                   </div>
                </div>

                {/* Tab Content: Logs */}
                <div id="sidebar-tab-logs" class="sidebar-tab-content pt-2 animate-in fade-in slide-in-from-right-4 duration-500">
                   <div class="mb-10">
                      <div class="flex items-center gap-2 mb-6 px-2">
                         <div class="w-1 h-3 bg-primary rounded-full"></div>
                         <span class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em]">Live_Telemetry</span>
                      </div>
                      <mini-log></mini-log>
                   </div>
                </div>
             </div>

             <footer class="p-6 border-t border-white/5 bg-black/40">
                <div class="flex justify-between items-center mb-3">
                   <span class="mono-xs font-black text-slate-500 uppercase tracking-widest">Operational_Trust</span>
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

          // Global Utility: escapeHTML (Required by agent islands)
          window.escapeHTML = function(str) {
            if (!str) return '';
            return String(str)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
          };

          // Sidebar Tab Switching
          window.switchSidebarTab = function(tab) {
            console.log("[SIDEBAR] Switching to:", tab);
            const contents = document.querySelectorAll('.sidebar-tab-content');
            const buttons = document.querySelectorAll('[id^="tab-btn-"]');
            const indicator = document.getElementById('tab-indicator');
            
            contents.forEach(c => c.classList.add('hidden'));
            buttons.forEach(b => {
              b.classList.remove('text-primary');
              b.classList.add('text-slate-500');
            });
            
            const activeContent = document.getElementById('sidebar-tab-' + tab);
            const activeBtn = document.getElementById('tab-btn-' + tab);
            
            if (activeContent) activeContent.classList.remove('hidden');
            if (activeBtn) {
              activeBtn.classList.add('text-primary');
              activeBtn.classList.remove('text-slate-500');
            }

            if (indicator) {
              if (tab === 'integrity') {
                indicator.style.transform = 'translateX(0)';
              } else {
                indicator.style.transform = 'translateX(100%)';
              }
            }
          };
          
          // Initialize active tab: DEFAULT TO LOGS
          switchSidebarTab('logs');
        ` }} />
      </body>
    </html>
  );
};
