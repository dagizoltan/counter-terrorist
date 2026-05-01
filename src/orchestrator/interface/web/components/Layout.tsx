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
      <body class="min-h-screen flex bg-[#050505] font-sans overflow-hidden">
        {/* SIDEBAR */}
        <aside id="sidebar" class="h-screen bg-black border-r border-white/5 flex flex-col w-64 z-50">
          <div class="p-6 flex items-center gap-3 border-b border-white/5 h-20">
            <div class="w-1.5 h-6 bg-cyber"></div>
            <span class="font-black text-sm tracking-widest uppercase">Ghost_Command</span>
          </div>

          <nav class="flex-grow py-6 overflow-y-auto">
            <div class="px-4 space-y-1">
              <a href="/" class="flex items-center gap-4 p-3 hover:bg-white/5 transition-all text-slate-400 hover:text-white group">
                <span class="text-[10px] font-bold uppercase tracking-widest">Dashboard</span>
              </a>
              <a href="/events" class="flex items-center gap-4 p-3 hover:bg-white/5 transition-all text-slate-400 hover:text-white group">
                <span class="text-[10px] font-bold uppercase tracking-widest">Threat_Matrix</span>
              </a>
              <a href="/agents" class="flex items-center gap-4 p-3 hover:bg-white/5 transition-all text-slate-400 hover:text-white group">
                <span class="text-[10px] font-bold uppercase tracking-widest">Agent_Fleet</span>
              </a>
              <a href="/honeypots" class="flex items-center gap-4 p-3 hover:bg-white/5 transition-all text-slate-400 hover:text-white group">
                <span class="text-[10px] font-bold uppercase tracking-widest">Deception_Grid</span>
              </a>
              <a href="/audit/integrity" class="flex items-center gap-4 p-3 hover:bg-white/5 transition-all text-slate-400 hover:text-white group">
                <span class="text-[10px] font-bold uppercase tracking-widest">Mesh_Integrity</span>
              </a>
            </div>
          </nav>

          <div class="p-4 border-t border-white/5">
            <form method="POST" action="/logout">
              <button type="submit" class="w-full flex items-center gap-4 p-3 text-[10px] font-bold uppercase tracking-widest text-danger hover:bg-danger/5 transition-all">
                Terminate_Session
              </button>
            </form>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <div class="flex-grow h-screen flex flex-col overflow-hidden">
          <header class="h-20 border-b border-white/5 flex items-center px-8 bg-black/40 backdrop-blur-sm shrink-0">
             <div class="flex items-center gap-4">
                <div class="live-dot"></div>
                <span class="text-[10px] font-black text-slate-500 tracking-widest uppercase">Sovereign_Mesh_Active</span>
             </div>
             <div class="ml-auto flex items-center gap-6">
                <div class="flex flex-col items-end">
                   <span class="text-[9px] font-black text-slate-500 tracking-widest uppercase">Node_Identity</span>
                   <span class="text-[10px] font-mono text-cyber">{Deno.hostname()}</span>
                </div>
             </div>
          </header>

          <main class="flex-grow overflow-y-auto">
            <div class="max-w-[1600px] p-8 mx-auto">
              {props.children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
};
