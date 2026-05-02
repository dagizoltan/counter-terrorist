import { jsx } from "hono/jsx";

/**
 * Sovereign Tri-Pane Layout (Atomic)
 * Restored original complexity with zero-class hardening.
 * Includes: Global Navigation, Center Stage, and Forensic Telemetry Sidebar.
 */
export const Layout = (props: {
  title: string;
  children: any;
  csrfToken?: string;
  islandPaths?: string[];
}) => {
  const styles = {
    body: "background-color:#020617; color:#f8fafc; margin:0; padding:0; height:100vh; width:100vw; overflow:hidden; font-family:sans-serif; display:flex;",
    bgGlow: "position:fixed; inset:0; pointer-events:none; z-index:-1; background:radial-gradient(circle at 50% 0%, rgba(14, 165, 233, 0.1), transparent 70%);",
    leftSidebar: "width:280px; height:100vh; background:rgba(15, 23, 42, 0.8); border-right:1px solid rgba(255, 255, 255, 0.05); display:flex; flex-direction:column; flex-shrink:0; backdrop-filter:blur(20px); z-index:100;",
    rightSidebar: "width:360px; height:100vh; background:rgba(2, 6, 23, 0.6); border-left:1px solid rgba(255, 255, 255, 0.05); display:flex; flex-direction:column; flex-shrink:0; backdrop-filter:blur(20px); z-index:100;",
    centerStage: "flex-grow:1; height:100vh; display:flex; flex-direction:column; overflow:hidden; position:relative;",
    header: "height:5rem; border-bottom:1px solid rgba(255, 255, 255, 0.05); display:flex; align-items:center; justify-content:space-between; padding:0 2.5rem; background:rgba(2, 6, 23, 0.4); backdrop-filter:blur(10px); flex-shrink:0;",
    mainContent: "flex-grow:1; overflow-y:auto; padding:3rem; scrollbar-width:thin;",
    navItem: "display:flex; align-items:center; padding:0.85rem 1.25rem; border-radius:0.75rem; text-decoration:none; color:#94a3b8; font-size:10px; font-weight:900; text-transform:uppercase; letter-spacing:0.15em; margin:0.2rem 1rem; transition:all 0.2s;",
    label: "font-size:9px; font-weight:900; letter-spacing:0.3em; color:rgba(148, 163, 184, 0.3); text-transform:uppercase; margin:1.5rem 0 0.5rem 2rem;",
    statusDot: "width:8px; height:8px; border-radius:50%; background:#10b981; box-shadow:0 0 10px #10b981;",
    logEntry: "padding:0.75rem 1rem; border-bottom:1px solid rgba(255,255,255,0.03); font-family:monospace; font-size:10px; color:rgba(148,163,184,0.7);"
  };

  return (
    <html lang="en" style="background-color:#020617;">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{props.title} | GHOST_COMMAND</title>
        <style dangerouslySetInnerHTML={{ __html: `
            body { scrollbar-color: rgba(255,255,255,0.1) transparent; scrollbar-width: thin; }
            .nav-item:hover { background: rgba(255,255,255,0.05); color: white; }
            @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
            .pulse { animation: pulse 2s infinite; }
        `}} />
      </head>
      <body style={styles.body}>
        <div style={styles.bgGlow}></div>

        {/* LEFT SIDEBAR: GLOBAL NAVIGATION */}
        <aside style={styles.leftSidebar}>
          <div style="height:5rem; display:flex; align-items:center; padding:0 2rem; border-bottom:1px solid rgba(255,255,255,0.05);">
            <div style="width:4px; height:24px; background:#0ea5e9; border-radius:2px; box-shadow:0 0 15px #0ea5e9;"></div>
            <div style="display:flex; flex-direction:column; margin-left:1rem;">
              <span style="font-weight:900; font-size:12px; letter-spacing:0.3em; color:white;">GHOST_COMMAND</span>
              <span style="font-weight:900; font-size:8px; color:#0ea5e9; opacity:0.6;">SOVEREIGN_NODE_v4.2</span>
            </div>
          </div>

          <nav style="flex-grow:1; overflow-y:auto; padding-top:1rem;">
            <div style={styles.label}>01_Situational</div>
            <a href="/" style={styles.navItem}>Dashboard</a>
            <a href="/intel/map" style={styles.navItem}>Tactical Overlay</a>
            
            <div style={styles.label}>02_Defense</div>
            <a href="/network" style={styles.navItem}>Network Perimeter</a>
            <a href="/mesh" style={styles.navItem}>Mesh Fabric</a>
            <a href="/honeypots" style={styles.navItem}>Deception Grid</a>
            
            <div style={styles.label}>03_Forensics</div>
            <a href="/compliance/audit" style={styles.navItem}>Audit Ledger</a>
            <a href="/compliance/incidents" style={styles.navItem}>Incident Portal</a>
            <a href="/processes" style={styles.navItem}>Process Integrity</a>

            <div style={styles.label}>04_Core</div>
            <a href="/agents" style={styles.navItem}>Agent Fleet</a>
            <a href="/settings" style={styles.navItem}>Node Config</a>
          </nav>

          <div style="padding:1.5rem; border-top:1px solid rgba(255,255,255,0.05);">
             <form method="POST" action="/logout">
                <button type="submit" style="width:100%; padding:0.75rem; border-radius:0.75rem; background:rgba(239,68,68,0.05); color:#ef4444; border:1px solid rgba(239,68,68,0.1); font-weight:900; font-size:9px; text-transform:uppercase; letter-spacing:0.2em; cursor:pointer;">
                  Terminate_Session
                </button>
             </form>
          </div>
        </aside>

        {/* CENTER STAGE: PRIMARY INTERFACE */}
        <div style={styles.centerStage}>
          <header style={styles.header}>
            <div style="display:flex; align-items:center; gap:2rem;">
               <div style="display:flex; align-items:center; gap:0.5rem;">
                  <div style={styles.statusDot} class="pulse"></div>
                  <span style="font-weight:900; font-size:10px; letter-spacing:0.1em; color:#10b981; font-style:italic;">GRID_NOMINAL</span>
               </div>
               <div style="width:1px; height:16px; background:rgba(255,255,255,0.1);"></div>
               <div style="display:flex; align-items:center; gap:0.5rem;">
                  <span style="font-size:9px; font-weight:900; color:rgba(148,163,184,0.4);">HOSTNAME:</span>
                  <span style="font-size:9px; font-weight:900; color:white;">{Deno.hostname()}</span>
               </div>
            </div>
            
            <div style="display:flex; align-items:center; gap:1.5rem;">
               <div style="text-align:right;">
                  <div style="font-size:8px; font-weight:900; color:rgba(148,163,184,0.3); text-transform:uppercase;">Encryption_Layer</div>
                  <div style="font-size:9px; font-weight:900; color:#0ea5e9;">CHACHA20_POLY1305</div>
               </div>
               <div style="width:32px; height:32px; border-radius:50%; background:rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; color:white;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
               </div>
            </div>
          </header>

          <main style={styles.mainContent}>
            <div style="max-width:1400px; margin:0 auto;">
              {props.children}
            </div>
          </main>
        </div>

        {/* RIGHT SIDEBAR: FORENSIC TELEMETRY STREAM */}
        <aside style={styles.rightSidebar}>
          <div style="height:5rem; display:flex; align-items:center; padding:0 2rem; border-bottom:1px solid rgba(255,255,255,0.05); justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:0.75rem;">
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
               <span style="font-weight:900; font-size:10px; letter-spacing:0.2em; color:white;">FORENSIC_STREAM</span>
            </div>
            <div style="width:8px; height:8px; border-radius:50%; background:#ef4444; opacity:0.5;" class="pulse"></div>
          </div>
          
          <div id="telemetry-log-stream" style="flex-grow:1; overflow-y:auto; padding:1rem; display:flex; flex-direction:column-reverse; gap:0.5rem; scrollbar-width:none;">
             <div style={styles.logEntry}>[SYSTEM] Listening for subliminal mesh signals...</div>
             <div style={styles.logEntry}>[KERNEL] Adaptive hardening active (ASLR=1)</div>
             <div style={styles.logEntry}>[AUTH] Sovereign session established for root</div>
             <div style={styles.logEntry}>[BOOT] Deploying active defense sidecars...</div>
          </div>

          <div style="padding:1.5rem; background:rgba(0,0,0,0.2); border-top:1px solid rgba(255,255,255,0.05);">
             <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
                <span style="font-size:8px; font-weight:900; color:rgba(148,163,184,0.4); text-transform:uppercase;">Stream_Health</span>
                <span style="font-size:8px; font-weight:900; color:#10b981;">SYNCED</span>
             </div>
             <div style="height:2px; background:rgba(255,255,255,0.05); border-radius:1px;">
                <div style="height:100%; width:100%; background:#10b981;"></div>
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
