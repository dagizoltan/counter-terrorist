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
        <div class="app-shell">
          {/* LEFT SIDEBAR: NAVIGATION */}
          <aside class="shell-sidebar">
            <header class="shell-header border-b">
              <div class="flex items-center gap-4">
                <div class="w-1 h-6 bg-primary rounded-full shadow-primary"></div>
                <div class="flex flex-col">
                  <span class="font-black text-[12px] tracking-widest text-white">GHOST_COMMAND</span>
                  <span class="mono-xs text-primary opacity-60">NODE_v4.2-STABLE</span>
                </div>
              </div>
            </header>

            <nav class="flex-grow overflow-y-auto">
              <div class="nav-group">
                <div class="nav-heading">01_Situational</div>
                <a href="/" class="nav-link">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                  Dashboard
                </a>
                <a href="/intel/map" class="nav-link">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                  Tactical Map
                </a>
                <a href="/sysinfo" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                   Node Info
                </a>
              </div>

              <div class="nav-group">
                <div class="nav-heading">02_Infrastructure</div>
                <a href="/network" class="nav-link">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  Perimeter
                </a>
                <a href="/mesh" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                   Mesh Topology
                </a>
                <a href="/agents" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                   Agent Fleet
                </a>
              </div>

              <div class="nav-group">
                <div class="nav-heading">03_Active_Defense</div>
                <a href="/honeypots" class="nav-link">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                  Deception
                </a>
                <a href="/threats" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                   Threat Intel
                </a>
              </div>

              <div class="nav-group">
                <div class="nav-heading">04_Forensics</div>
                <a href="/compliance/audit" class="nav-link">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  Audit Ledger
                </a>
                <a href="/processes" class="nav-link">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                  Processes
                </a>
                <a href="/analysis/timeline" class="nav-link">
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                   Timeline
                </a>
              </div>

                <div class="nav-group">
                  <div class="nav-heading">05_Governance</div>
                  <a href="/settings" class="nav-link">
                     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                     Alert Relay
                  </a>
                  <a href="/supply-chain" class="nav-link">
                     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                     Supply Chain
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

            <footer class="p-6 border-t">
              <form method="POST" action="/logout">
                <button type="submit" class="t-btn danger w-full justify-center">Terminate_Session</button>
              </form>
            </footer>
          </aside>

          {/* MAIN STAGE */}
          <main class="shell-main">
            <header class="shell-header">
              <div class="flex items-center gap-8">
                <div class="mono-sm font-black text-primary tracking-[0.35em]">GHOST_COMMAND_OS // v4.2.0_ALPHA</div>
                <div class="flex items-center gap-3 px-6 border-l border-white/10">
                   <span class="dot active"></span>
                   <span class="mono-xs font-bold text-slate-500 tracking-widest uppercase">System_Integrity: VERIFIED</span>
                </div>
              </div>
              <div class="flex items-center gap-8">
                <div class="mono-xs font-bold text-slate-500 tracking-widest">REGION: SOVEREIGN_NODE_ALPHA</div>
                <div class="flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/5 rounded">
                   <span class="mono-xs font-black text-white">OP_LEVEL: 05</span>
                </div>
                <div class="w-10 h-10 rounded-full bg-panel-bg border border-border-subtle flex items-center justify-center shadow-primary">
                   <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
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
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span class="font-black text-[10px] tracking-[0.2em] text-white">FORENSIC_STREAM</span>
              </div>
              <div class="status-pill error animate-pulse">Live</div>
            </header>

            <div class="flex-grow overflow-y-auto">
              <mini-log></mini-log>
            </div>

            <footer class="p-6 bg-black/20 border-t">
              <div class="flex justify-between items-center mb-4">
                <span class="metric-tag">Grid_Health</span>
                <span class="metric-tag text-success">Optimal</span>
              </div>
              <div class="h-1 bg-border-subtle rounded-full overflow-hidden">
                <div class="w-full h-full bg-success shadow-success"></div>
              </div>
            </footer>
          </aside>
        </div>

        {/* Core Scripts */}
        <script type="module" src="/components/islands/MiniLog.js" />
        {props.islandPaths?.map(path => (
          <script type="module" src={path} />
        ))}
      </body>
    </html>
  );
};
