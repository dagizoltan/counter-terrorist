import { jsx } from "hono/jsx";

/**
 * Sovereign Tri-Pane Layout (Atomic)
 * Restored original complexity with CSS-driven design.
 * Includes: Global Navigation, Center Stage, and Forensic Telemetry Sidebar.
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
        <title>{props.title} | GHOST_COMMAND</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        {/* LEFT SIDEBAR: GLOBAL NAVIGATION */}
        <aside class="left-sidebar">
          <div style="height:5rem; display:flex; align-items:center; padding:0 2rem; border-bottom:1px solid var(--border-color);">
            <div style="width:4px; height:24px; background:var(--cyber-blue); border-radius:2px; box-shadow:0 0 15px var(--cyber-blue);"></div>
            <div style="display:flex; flex-direction:column; margin-left:1rem;">
              <span style="font-weight:900; font-size:12px; letter-spacing:0.3em; color:white;">GHOST_COMMAND</span>
              <span style="font-weight:900; font-size:8px; color:var(--cyber-blue); opacity:0.6;">SOVEREIGN_NODE_v4.2</span>
            </div>
          </div>

          <nav style="flex-grow:1; overflow-y:auto; padding-top:1rem;">
            <div class="nav-label">01_Situational</div>
            <a href="/" class="nav-item">Dashboard</a>
            <a href="/intel/map" class="nav-item">Tactical Overlay</a>
            
            <div class="nav-label">02_Defense</div>
            <a href="/network" class="nav-item">Network Perimeter</a>
            <a href="/mesh" class="nav-item">Mesh Fabric</a>
            <a href="/honeypots" class="nav-item">Deception Grid</a>
            
            <div class="nav-label">03_Forensics</div>
            <a href="/compliance/audit" class="nav-item">Audit Ledger</a>
            <a href="/compliance/incidents" class="nav-item">Incident Portal</a>
            <a href="/processes" class="nav-item">Process Integrity</a>

            <div class="nav-label">04_Core</div>
            <a href="/agents" class="nav-item">Agent Fleet</a>
            <a href="/settings" class="nav-item">Node Config</a>
          </nav>

          <div style="padding:1.5rem; border-top:1px solid var(--border-color);">
             <form method="POST" action="/logout">
                <button type="submit" class="tactical-button critical" style="width:100%; font-size:9px;">
                  Terminate_Session
                </button>
             </form>
          </div>
        </aside>

        {/* CENTER STAGE: PRIMARY INTERFACE */}
        <div class="center-stage">
          <header class="main-header">
            <div style="display:flex; align-items:center; gap:2rem;">
               <div style="display:flex; align-items:center; gap:0.5rem;">
                  <div class="status-dot active pulse"></div>
                  <span style="font-weight:900; font-size:10px; letter-spacing:0.1em; color:var(--cyber-green); font-style:italic;">GRID_NOMINAL</span>
               </div>
               <div style="width:1px; height:16px; background:var(--border-color);"></div>
               <div style="display:flex; align-items:center; gap:0.5rem;">
                  <span class="mono-label" style="opacity:0.4;">HOSTNAME:</span>
                  <span class="mono-label" style="color:white; font-size:9px;">{Deno.hostname()}</span>
               </div>
            </div>
            
            <div style="display:flex; align-items:center; gap:1.5rem;">
               <div style="text-align:right;">
                  <div class="mono-label" style="font-size:8px; opacity:0.3;">Encryption_Layer</div>
                  <div class="mono-label" style="font-size:9px; color:var(--cyber-blue);">CHACHA20_POLY1305</div>
               </div>
               <div style="width:32px; height:32px; border-radius:50%; background:var(--border-color); display:flex; align-items:center; justify-content:center; color:white;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
               </div>
            </div>
          </header>

          <main class="main-content">
            <div class="main-content-inner animate-fade-in">
              {props.children}
            </div>
          </main>
        </div>

        {/* RIGHT SIDEBAR: FORENSIC TELEMETRY STREAM */}
        <aside class="right-sidebar">
          <div style="height:5rem; display:flex; align-items:center; padding:0 2rem; border-bottom:1px solid var(--border-color); justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:0.75rem;">
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cyber-red)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
               <span style="font-weight:900; font-size:10px; letter-spacing:0.2em; color:white;">FORENSIC_STREAM</span>
            </div>
            <div class="status-dot critical pulse" style="opacity:0.5;"></div>
          </div>
          
          <div id="telemetry-log-stream" class="log-stream">
             <div class="log-entry">[SYSTEM] Listening for subliminal mesh signals...</div>
             <div class="log-entry">[KERNEL] Adaptive hardening active (ASLR=1)</div>
             <div class="log-entry">[AUTH] Sovereign session established for root</div>
             <div class="log-entry">[BOOT] Deploying active defense sidecars...</div>
          </div>

          <div style="padding:1.5rem; background:rgba(0,0,0,0.2); border-top:1px solid var(--border-color);">
             <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
                <span class="mono-label" style="font-size:8px; opacity:0.4;">Stream_Health</span>
                <span class="mono-label" style="font-size:8px; color:var(--cyber-green);">SYNCED</span>
             </div>
             <div class="progress-bar">
                <div class="progress-fill" style="width:100%; background:var(--cyber-green);"></div>
             </div>
          </div>
        </aside>

        {/* Global Hydration Islands */}
        {props.islandPaths?.map(path => (
          <script type="module" src={path} />
        ))}
      </body>
    </html>
  );
};
