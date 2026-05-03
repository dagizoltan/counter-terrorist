import { jsx } from "hono/jsx";

/**
 * Sovereign App Shell
 * Rebuilt as a robust, grid-based tactical container.
 * Architecture: Left Navigation | Main Content | Right Forensic Stream
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
        <title>{props.title} | GHOST_COMMAND</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <div class="noise-overlay"></div>
        <div class="system-scan-overlay"></div>
        <alert-overlay></alert-overlay>
        <div class="app-shell">
          {/* LEFT SIDEBAR: NAVIGATION */}
          <aside class="shell-sidebar">
            <header class="shell-header">
              <div class="flex items-center gap-4">
                <div class="w-1.5 h-6 bg-primary rounded-full shadow-primary"></div>
                <div class="flex flex-col">
                  <span class="font-black text-[12px] tracking-[0.3em] text-white uppercase">Ghost_Command</span>
                  <span class="mono-xs text-primary opacity-40 font-bold tracking-[0.15em] text-[8px]">v4.2-STABLE</span>
                </div>
              </div>
            </header>

            <nav class="flex-grow overflow-y-auto custom-scrollbar">
              <div class="nav-group">
                <div class="nav-heading">01_Situational</div>
                <a href="/" class="nav-link">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h7v7H3z"/><path d="M14 3h7v7h-7z"/><path d="M14 14h7v7h-7z"/><path d="M3 14h7v7H3z"/></svg>
                  Dashboard
                </a>
                <a href="/threats" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                   Alert Center
                </a>
                <a href="/events" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                   Live Stream
                </a>
                <a href="/intel/map" class="nav-link">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                  Tactical Map
                </a>
              </div>

              <div class="nav-group">
                <div class="nav-heading">02_Infrastructure</div>
                <a href="/network" class="nav-link">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  Perimeter
                </a>
                <a href="/mesh" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 14 4-4"/><path d="m3.34 7 1.66 3"/><path d="m9.94 21 1.06-3"/><path d="M2 2h20"/><path d="M21 22h-1"/><path d="M15 8l-2 5"/><path d="M9 8 7 13"/></svg>
                   Mesh Topology
                </a>
                <a href="/agents" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                   Agent Fleet
                </a>
              </div>

              <div class="nav-group">
                <div class="nav-heading">03_Active_Defense</div>
                <a href="/honeypots" class="nav-link">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                  Deception
                </a>
              </div>

              <div class="nav-group">
                <div class="nav-heading">04_Forensics</div>
                <a href="/compliance/audit" class="nav-link">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
                  Audit Ledger
                </a>
                <a href="/processes" class="nav-link">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></svg>
                  Processes
                </a>
                <a href="/analysis/timeline" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                   Timeline
                </a>
                <a href="/analysis/replay" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15 6 12 10 9"/><path d="M6 12h12a2 2 0 0 1 2 2v1"/><path d="M20 18v1a2 2 0 0 1-2 2H6"/></svg>
                   Forensic Replay
                </a>
              </div>

              <div class="nav-group">
                <div class="nav-heading">05_Governance</div>
                <a href="/sysinfo" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                   Node Info
                </a>
                <a href="/supply-chain" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                   Supply Chain
                </a>
                <a href="/settings" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                   Settings
                </a>
              </div>
            </nav>

            <script dangerouslySetInnerHTML={{ __html: `
              window.escapeHTML = function(str) {
                if (typeof str !== 'string') return str;
                const p = document.createElement('p');
                p.textContent = str;
                return p.innerHTML;
              };
              function updateNav() {
                const path = window.location.pathname;
                document.querySelectorAll('.nav-link').forEach(link => {
                  if (link.getAttribute('href') === path) {
                    link.classList.add('active');
                  } else {
                    link.classList.remove('active');
                  }
                });
              }
              updateNav();
              window.addEventListener('popstate', updateNav);
            ` }} />

            <footer class="p-8 border-t border-white/5 bg-black/20">
              <form method="POST" action="/logout">
                <input type="hidden" name="csrfToken" value={props.csrfToken} />
                <button type="submit" class="t-btn danger w-full justify-center group">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="group-hover:translate-x-1 transition-transform"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Terminate_Session
                </button>
              </form>
            </footer>
          </aside>

          {/* MAIN STAGE */}
          <main class="shell-main">
            <header class="shell-header justify-start gap-12">
              <div class="flex items-center gap-6">
                <span class="mono-xs font-black text-slate-500 tracking-[0.5em] uppercase opacity-60">Sovereign_Node</span>
                <div class="h-4 w-px bg-white/10"></div>
                <div class="flex items-center gap-3">
                   <span class="dot active pulse shadow-success"></span>
                   <span class="mono-xs font-black text-success/60 tracking-[0.2em] uppercase">Online</span>
                </div>
              </div>
              <div class="flex-grow"></div>
              <div class="flex items-center gap-6">
                <div class="mono-xs font-black text-slate-500 tracking-[0.2em] uppercase">Grid_Coord: <span class="text-white">SH-0921</span></div>
                <div class="w-8 h-8 rounded border border-white/5 bg-white/[0.02] flex items-center justify-center group hover:border-primary/30 transition-colors cursor-pointer">
                   <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-slate-600 group-hover:text-primary transition-colors"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
              </div>
            </header>

            <div class="shell-content">
              {props.children}
            </div>
          </main>

          {/* RIGHT ASIDE: TELEMETRY */}
          <aside class="shell-aside">
            <header class="shell-header border-b">
              <div class="flex items-center gap-3">
                <div class="p-1.5 bg-danger/5 border border-danger/20 rounded">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <span class="font-black text-[9px] tracking-[0.4em] text-white uppercase">Forensic_Feed</span>
              </div>
              <div class="mono-xs text-danger font-black animate-pulse text-[9px] tracking-widest">LIVE</div>
            </header>

            <div class="flex-grow overflow-y-auto custom-scrollbar">
              <mini-log></mini-log>
            </div>

            <footer class="p-8 bg-black/30 border-t border-white/5">
              <div class="flex justify-between items-center mb-5">
                <span class="mono-xs font-black text-slate-500 tracking-widest">GRID_HEALTH</span>
                <span class="mono-xs font-black text-success tracking-widest">OPTIMAL // 100%</span>
              </div>
              <div class="h-1.5 bg-white/5 rounded-full overflow-hidden shadow-inner">
                <div class="w-full h-full bg-success shadow-success"></div>
              </div>
            </footer>
          </aside>
        </div>

        {/* Core Scripts */}
        <script type="module" src="/components/islands/MiniLog.js" />
        <script type="module" src="/components/islands/AlertOverlay.js" />
        {props.islandPaths?.map(path => (
          <script type="module" src={path} />
        ))}
      </body>
    </html>
  );
};
