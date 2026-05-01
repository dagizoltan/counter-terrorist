import { jsx } from "hono/jsx";

export const Layout = (props: {
  title: string;
  children: any;
  cssPaths?: string[];
  islandPaths?: string[];
  csrfToken?: string;
}) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="api-token" content={Deno.env.get("API_TOKEN") || ""} />
        <meta name="csrf-token" content={props.csrfToken || ""} />
        <title>{props.title} | GHOST_COMMAND</title>
        
        {/* Modern Typography */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        
        {/* Tailwind CDN (Restored for Tactical Clarity) */}
        <script src="https://cdn.tailwindcss.com"></script>
        <script dangerouslySetInnerHTML={{ __html: `
          tailwind.config = {
            theme: {
              extend: {
                fontFamily: {
                  sans: ['Inter', 'sans-serif'],
                  mono: ['JetBrains Mono', 'monospace'],
                },
                colors: {
                  obsidian: '#0a0b10',
                  cyber: '#00d2ff',
                  danger: '#ff2d55',
                  warning: '#ffaa00'
                }
              }
            }
          }
        `}} />
        
        <style dangerouslySetInnerHTML={{ __html: `
          body { 
            background-color: #050505; 
            color: #e2e8f0; 
            -webkit-font-smoothing: antialiased; 
            background-image: radial-gradient(circle at 50% 50%, rgba(0, 210, 255, 0.05) 0%, transparent 100%);
          }
          .glass-panel {
            background: rgba(16, 20, 30, 0.4);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.05);
          }
          .tactical-border {
            border-color: rgba(60, 80, 120, 0.2);
          }
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
          }
          .live-dot {
            width: 6px;
            height: 6px;
            background: #00ff88;
            border-radius: 50%;
            box-shadow: 0 0 8px #00ff88;
            animation: pulse 2s infinite;
          }
        `}} />

        {/* Global theme styles */}
        <link rel="stylesheet" href="/style.css" />

        {/* Page specific islands */}
        {props.islandPaths?.map((path) => (
          <script type="module" src={path.replace(/.*\/islands\//, '/components/islands/')}></script>
        ))}
      </head>
      <body class="min-h-screen flex bg-[#050505] font-sans overflow-hidden" 
            style="background-image: url('/assets/command_bg.png'); background-size: cover; background-position: center;">
        {/* Glassmorphic Overlay */}
        <div class="min-h-screen flex-grow flex bg-obsidian/95 backdrop-blur-xl">
          {/* SIDEBAR */}
          <aside id="sidebar" class="h-screen bg-black/40 backdrop-blur-2xl border-r border-white/5 flex flex-col w-72 z-50 shadow-[20px_0_50px_rgba(0,0,0,0.5)]">
            <div class="p-8 flex items-center gap-4 border-b border-white/5 h-24">
              <div class="w-1.5 h-8 bg-cyber shadow-[0_0_20px_rgba(0,210,255,0.6)] rounded-full"></div>
              <div class="flex flex-col">
                <span class="font-black text-sm tracking-[0.3em] uppercase text-white">Ghost_Command</span>
                <span class="text-[9px] font-bold text-cyber/60 tracking-widest uppercase">Sovereign_Orchestrator</span>
              </div>
            </div>

            <nav class="flex-grow py-8 overflow-y-auto custom-scrollbar">
              <div class="px-6 space-y-1">
                <div class="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-4 ml-2">Main_Systems</div>
                
                <a href="/" class="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-all text-slate-400 hover:text-white group border border-transparent hover:border-white/5">
                  <div class="flex items-center gap-4">
                    <div class="w-1 h-1 bg-cyber rounded-full group-hover:scale-150 transition-transform"></div>
                    <span class="text-[10px] font-bold uppercase tracking-widest">Dashboard</span>
                  </div>
                  <span class="text-[8px] font-black text-emerald-500/50 group-hover:text-emerald-400">ONLINE</span>
                </a>

                <a href="/agents" class="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-all text-slate-400 hover:text-white group border border-transparent hover:border-white/5">
                  <div class="flex items-center gap-4">
                    <div class="w-1 h-1 bg-slate-600 rounded-full group-hover:bg-cyber transition-all"></div>
                    <span class="text-[10px] font-bold uppercase tracking-widest">Agent_Fleet</span>
                  </div>
                  <span class="text-[8px] font-black text-cyber/50">ACTIVE</span>
                </a>

                <div class="pt-6 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-4 ml-2">Intelligence</div>

                <a href="/audit" class="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-all text-slate-400 hover:text-white group border border-transparent hover:border-white/5">
                  <div class="flex items-center gap-4">
                    <div class="w-1 h-1 bg-slate-600 rounded-full group-hover:bg-warning transition-all"></div>
                    <span class="text-[10px] font-bold uppercase tracking-widest">Audit_Chain</span>
                  </div>
                  <span class="text-[8px] font-black text-warning/50">SECURED</span>
                </a>

                <a href="/honeypots" class="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-all text-slate-400 hover:text-white group border border-transparent hover:border-white/5">
                  <div class="flex items-center gap-4">
                    <div class="w-1 h-1 bg-slate-600 rounded-full group-hover:bg-danger transition-all"></div>
                    <span class="text-[10px] font-bold uppercase tracking-widest">Deception_Grid</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <div class="w-1 h-1 bg-danger animate-ping"></div>
                    <span class="text-[8px] font-black text-danger/50">MONITORED</span>
                  </div>
                </a>

                <div class="pt-6 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-4 ml-2">Orchestration</div>

                <a href="/mesh" class="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-all text-slate-400 hover:text-white group border border-transparent hover:border-white/5">
                  <div class="flex items-center gap-4">
                    <div class="w-1 h-1 bg-slate-600 rounded-full group-hover:bg-emerald-500 transition-all"></div>
                    <span class="text-[10px] font-bold uppercase tracking-widest">Mesh_Topology</span>
                  </div>
                  <span class="text-[8px] font-black text-emerald-500/50">CONSENSUS</span>
                </a>
              </div>
            </nav>

            <div class="p-6 border-t border-white/5 bg-black/20">
              <div class="mb-6 px-4 py-3 rounded-lg bg-cyber/5 border border-cyber/20 shadow-[inset_0_0_20px_rgba(0,210,255,0.05)]">
                 <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                      <div class="w-1.5 h-1.5 rounded-full bg-cyber animate-pulse shadow-[0_0_10px_rgba(0,210,255,1)]"></div>
                      <span class="text-[9px] font-black text-cyber uppercase tracking-widest">Consensus_Lock</span>
                    </div>
                    <span class="text-[9px] font-mono text-cyber/60">99.9%</span>
                 </div>
                 <div class="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-cyber/40 to-cyber w-full"></div>
                 </div>
              </div>
              <form method="POST" action="/logout">
                <button type="submit" class="w-full flex items-center justify-center gap-4 p-3 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] text-danger/80 hover:text-danger hover:bg-danger/10 border border-danger/10 hover:border-danger/30 transition-all duration-300">
                  Terminate_Session
                </button>
              </form>
            </div>
          </aside>

          {/* MAIN CONTENT AREA */}
          <div class="flex-grow h-screen flex flex-col overflow-hidden">
            <header class="h-24 border-b border-white/5 flex items-center px-10 bg-black/40 backdrop-blur-xl shrink-0 z-40">
               <div class="flex items-center gap-6">
                  <div class="flex items-center gap-3">
                    <div class="live-dot"></div>
                    <span class="text-[11px] font-black text-white tracking-[0.3em] uppercase">Sovereign_Active</span>
                  </div>
                  <div class="h-4 w-px bg-white/10"></div>
                  <div class="flex items-center gap-4">
                    <span class="text-[9px] font-bold text-slate-500 tracking-widest uppercase">Status:</span>
                    <span class="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[8px] font-black uppercase tracking-tighter">Normal_Operations</span>
                  </div>
               </div>
               <div class="ml-auto flex items-center gap-12">
                  <div class="flex flex-col items-end">
                     <span class="text-[9px] font-bold text-slate-500 tracking-widest uppercase mb-1">Global_Sync</span>
                     <div class="flex items-center gap-2">
                        <span class="text-[10px] font-mono text-emerald-400">SYNCHRONIZED</span>
                        <div class="w-1 h-1 bg-emerald-500 rounded-full"></div>
                     </div>
                  </div>
                  <div class="flex flex-col items-end">
                     <span class="text-[9px] font-bold text-slate-500 tracking-widest uppercase mb-1">Local_Node_ID</span>
                     <span class="text-[10px] font-mono text-cyber">{Deno.hostname()}</span>
                  </div>
               </div>
            </header>

            <main class="flex-grow overflow-y-auto custom-scrollbar bg-obsidian/40">
              <div class="max-w-[1600px] p-12 mx-auto">
                {props.children}
              </div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
};
