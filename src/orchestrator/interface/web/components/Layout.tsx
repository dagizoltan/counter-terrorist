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
  islandPaths?: string[];
}) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="csrf-token" content={props.csrfToken} />
        <title>{props.title} | Sovereign Orchestrator</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body class="bg-[#050505] text-slate-100 font-sans selection:bg-primary/30 overflow-hidden">
        <div class="noise-overlay pointer-events-none opacity-[0.03]"></div>
        <div class="system-scan-overlay pointer-events-none opacity-[0.02]"></div>
        
        <div class="app-shell">
          
          {/* ── 01 Navigation Deck (Left) ─────────────────────────────── */}
          <aside class="shell-sidebar relative">
            <header class="px-6 py-8 border-b border-white/5 relative group cursor-default mb-4">
              <div class="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div class="flex items-center gap-4 relative z-10">
                <div class="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shadow-[0_0_20px_var(--primary-glow)]">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                </div>
                <div class="flex flex-col">
                  <h1 class="text-xl font-black tracking-[-0.05em] uppercase italic leading-none text-white">CT ORCH</h1>
                  <div class="flex items-center gap-2 mt-1">
                    <div class="w-1 h-1 rounded-full bg-primary animate-pulse"></div>
                    <span class="text-[8px] text-primary/60 font-black uppercase tracking-[0.3em]">SOVEREIGN_NODE</span>
                  </div>
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
                <a href="/news" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>
                   News
                </a>
              </div>

              {/* AGENT FLEET */}
              <div class="nav-group mb-8">
                <div class="nav-heading !text-success flex items-center gap-3">
                   <div class="w-1 h-3 bg-success rounded-full"></div>
                   Agent Fleet
                </div>
                <a href="/agents/registry" class="nav-link !text-success/80 !font-black !mb-4 border-b border-white/5 pb-2">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21 11-8-8-8 8"/><path d="M21 15H3"/><path d="M21 19H3"/><circle cx="12" cy="12" r="3"/></svg>
                   Fleet Registry
                </a>
                <a href="/agents/vpn" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                   Anonymizer
                </a>
                <a href="/agents/firewall" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                   Firewall
                </a>
                <a href="/agents/mesh" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5"/><path d="M17 12V17a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-5"/><circle cx="12" cy="12" r="3"/></svg>
                   Mesh
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
                   Packet Capture
                </a>
              </div>

              {/* NETWORK */}
              <div class="nav-group mb-8">
                <div class="nav-heading !text-warning flex items-center gap-3">
                   <div class="w-1 h-3 bg-warning rounded-full"></div>
                   NETWORK
                </div>
                <a href="/network/active" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/></svg>
                   Active Network
                </a>
                <a href="/network/neighbors" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
                   Neighbor Signals
                </a>
              </div>

              {/* SYSTEM & AUDIT */}
              <div class="nav-group pt-6 border-t border-white/5 mt-6 mb-12">
                <div class="nav-heading !text-slate-500 flex items-center gap-3 mb-2">
                   <div class="w-1 h-3 bg-slate-700 rounded-full"></div>
                   SYSTEM / AUDIT
                </div>
                <a href="/governance" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
                   Forensic Ledger
                </a>
                <a href="/system/supply-chain" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                   Supply Chain
                </a>
                <a href="/settings" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1-2 2 2 2 0 0 1 2-2v-.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                   Settings
                </a>
                <a href="/system/info" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                   System Status
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
             {/* Main Deck Header - Now with Integrated Tactical Navigation */}
             <header class="shell-header">
                <div class="flex items-center gap-8">
                   <div class="flex items-center gap-3">
                      <span class="dot active"></span>
                      <span class="mono-xs font-black text-primary tracking-[0.4em] uppercase">Sovereign Active</span>
                   </div>
                   
                   {/* DYNAMIC MODULE NAVIGATION (Header Segmented Control) */}
                   <div id="module-nav-container" class="hidden md:flex bg-black/60 p-1 rounded-full border border-white/5 backdrop-blur-xl relative h-10 w-[280px]">
                      <div id="module-indicator" class="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] bg-primary/20 border border-primary/30 rounded-full transition-all duration-300 ease-out z-0"></div>
                      
                      {/* Forensic Module Links (Hidden if not in forensics) */}
                      <div id="nav-forensics" class="hidden flex w-full h-full relative z-10">
                         <button onclick="window.switchSidebarTab('integrity')" class="flex-1 flex justify-center items-center text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Integrity</button>
                         <button onclick="window.switchSidebarTab('logs')" class="flex-1 flex justify-center items-center text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Realtime Logs</button>
                      </div>

                      {/* Network Module Links (Hidden if not in network) */}
                      <div id="nav-network" class="hidden flex w-full h-full relative z-10">
                         <a href="/network/active" class="flex-1 flex justify-center items-center text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Active Mesh</a>
                         <a href="/network/neighbors" class="flex-1 flex justify-center items-center text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Neighbors</a>
                      </div>
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

          {/* ── 03 Forensic Telemetry (Right) ─────────────────────────── */}
          <aside class="shell-aside relative z-20 flex flex-col border-l border-white/5 bg-[#080808]">
             {/* Sidebar Header (Simplified since tabs moved to global header) */}
             <header class="p-4 shrink-0 flex justify-between items-center border-b border-white/5 bg-black/20">
                <span class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em] ml-2">Forensic Audit</span>
                <div class="flex gap-2 mr-2">
                   <div class="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
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
                      <div class="flex items-center gap-2 mb-6 px-2">
                         <div class="w-1 h-3 bg-primary rounded-full"></div>
                         <span class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em]">Live Telemetry</span>
                      </div>
                      <mini-log></mini-log>
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
            
            // Sidebar Navigation Active State
            document.querySelectorAll('.nav-link').forEach(link => {
              link.classList.toggle('active', link.getAttribute('href') === path);
            });
            
            // Dynamic Header Navigation
            const navContainer = document.getElementById('module-nav-container');
            const navForensics = document.getElementById('nav-forensics');
            const navNetwork = document.getElementById('nav-network');
            const moduleIndicator = document.getElementById('module-indicator');
            
            if (navContainer) {
               const isForensic = path.includes('governance') || path.includes('forensics') || path.includes('audit');
               const isNetwork = path.includes('network');
               
               navContainer.classList.toggle('hidden', !isForensic && !isNetwork);
               navForensics.classList.toggle('hidden', !isForensic);
               navNetwork.classList.toggle('hidden', !isNetwork);
               
               if (isNetwork && moduleIndicator) {
                  moduleIndicator.style.transform = path.includes('neighbors') ? 'translateX(100%)' : 'translateX(0)';
               }
            }

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

          // Global Utility: escapeHTML
          window.escapeHTML = function(str) {
            if (!str) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
          };

          // Global Tab Switching (Forensics)
          window.switchSidebarTab = function(tab) {
            const contents = document.querySelectorAll('.sidebar-tab-content');
            const moduleIndicator = document.getElementById('module-indicator');
            const path = window.location.pathname;
            
            contents.forEach(c => c.classList.add('hidden'));
            const activeContent = document.getElementById('sidebar-tab-' + tab);
            if (activeContent) activeContent.classList.remove('hidden');

            if (moduleIndicator && (path.includes('governance') || path.includes('forensics'))) {
               moduleIndicator.style.transform = tab === 'integrity' ? 'translateX(0)' : 'translateX(100%)';
            }
          };
          
          // Default tab
          window.switchSidebarTab('logs');
        ` }} />
      </body>
    </html>
  );
};
