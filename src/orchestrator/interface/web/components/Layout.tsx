import { jsx } from "hono/jsx";

export const Layout = (props: {
  title: string;
  children: any;
  cssPaths?: string[];
  islandPaths?: string[];
  csrfToken?: string;
}) => {
  return (
    <html lang="en" class="bg-[#020617]">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="csrf-token" content={props.csrfToken || ""} />
        <title>{props.title} | GHOST_COMMAND</title>
        
        {/* Tailwind CDN */}
        <script src="https://cdn.tailwindcss.com"></script>
        <script dangerouslySetInnerHTML={{ __html: `
          tailwind.config = {
            theme: {
              extend: {
                fontFamily: {
                  sans: ['Outfit', 'sans-serif'],
                  mono: ['JetBrains Mono', 'monospace'],
                },
                colors: {
                  obsidian: '#020617',
                  cyber: '#0ea5e9',
                  danger: '#ef4444',
                  warning: '#f59e0b',
                  success: '#10b981'
                }
              }
            }
          }
        `}} />
        
        {/* Global theme styles */}
        <link rel="stylesheet" href="/style.css" />

        {/* Page specific islands */}
        {props.islandPaths?.map((path) => (
          <script type="module" src={path}></script>
        ))}
      </head>
      <body class="min-h-screen flex font-sans overflow-hidden">
        {/* Main Background with Noise and Gradients */}
        <div class="fixed inset-0 pointer-events-none opacity-50">
           <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(14,165,233,0.15),transparent_60%)]"></div>
           <div class="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>
        </div>

        <div class="relative min-h-screen flex-grow flex w-full overflow-hidden">
          {/* LEFT SIDEBAR (Static Navigation) */}
          <aside id="sidebar" class="h-screen glass-panel border-r border-white/5 flex flex-col w-80 z-50 shrink-0">
            <div class="p-8 flex items-center gap-4 border-b border-white/5 h-24">
              <div class="w-1.5 h-8 bg-cyber shadow-[0_0_20px_rgba(14,165,233,0.6)] rounded-full"></div>
              <div class="flex flex-col">
                <span class="font-black text-sm tracking-[0.4em] uppercase text-white">Ghost_Command</span>
                <span class="text-[9px] font-bold text-cyber/60 tracking-widest uppercase">Autonomous Defense Mesh</span>
              </div>
            </div>

            <nav class="flex-grow py-8 overflow-y-auto custom-scrollbar px-4">
              <div class="space-y-1">
                <div class="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4 ml-4 opacity-50">Operational_Status</div>
                
                <a href="/" class="nav-item flex items-center justify-between p-4 rounded-xl hover:bg-white/5 transition-all text-slate-400 hover:text-white group border border-transparent hover:border-white/5">
                  <div class="flex items-center gap-4">
                    <div class="w-1.5 h-1.5 bg-cyber rounded-full group-hover:scale-150 transition-transform shadow-[0_0_8px_rgba(14,165,233,0.4)]"></div>
                    <span class="text-[10px] font-black uppercase tracking-[0.2em]">Command_Center</span>
                  </div>
                </a>

                <div class="pt-8 text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4 ml-4 opacity-50">Perimeter_Control</div>
                
                <a href="/network" class="nav-item flex items-center justify-between p-4 rounded-xl hover:bg-white/5 transition-all text-slate-400 hover:text-white group border border-transparent hover:border-white/5">
                  <div class="flex items-center gap-4">
                    <div class="w-1.5 h-1.5 bg-slate-600 rounded-full group-hover:bg-cyber transition-all"></div>
                    <span class="text-[10px] font-black uppercase tracking-[0.2em]">Network_Shield</span>
                  </div>
                  <span class="text-[8px] font-black text-success/50 tracking-tighter">STEALTH</span>
                </a>

                <a href="/mesh" class="nav-item flex items-center justify-between p-4 rounded-xl hover:bg-white/5 transition-all text-slate-400 hover:text-white group border border-transparent hover:border-white/5">
                  <div class="flex items-center gap-4">
                    <div class="w-1.5 h-1.5 bg-slate-600 rounded-full group-hover:bg-cyber transition-all"></div>
                    <span class="text-[10px] font-black uppercase tracking-[0.2em]">Mesh_Topology</span>
                  </div>
                  <span class="text-[8px] font-black text-cyber/50 tracking-tighter">QUORUM</span>
                </a>

                <div class="pt-8 text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4 ml-4 opacity-50">Threat_Landscape</div>

                <a href="/threats" class="nav-item flex items-center justify-between p-4 rounded-xl hover:bg-white/5 transition-all text-slate-400 hover:text-white group border border-transparent hover:border-white/5">
                  <div class="flex items-center gap-4">
                    <div class="w-1.5 h-1.5 bg-slate-600 rounded-full group-hover:bg-danger transition-all"></div>
                    <span class="text-[10px] font-black uppercase tracking-[0.2em]">Threat_Index</span>
                  </div>
                  <span class="text-[8px] font-black text-danger/50 tracking-tighter">LIVE</span>
                </a>

                <a href="/honeypots" class="nav-item flex items-center justify-between p-4 rounded-xl hover:bg-white/5 transition-all text-slate-400 hover:text-white group border border-transparent hover:border-white/5">
                  <div class="flex items-center gap-4">
                    <div class="w-1.5 h-1.5 bg-slate-600 rounded-full group-hover:bg-orange-500 transition-all"></div>
                    <span class="text-[10px] font-black uppercase tracking-[0.2em]">Deception_Grid</span>
                  </div>
                </a>

                <a href="/audit" class="nav-item flex items-center justify-between p-4 rounded-xl hover:bg-white/5 transition-all text-slate-400 hover:text-white group border border-transparent hover:border-white/5">
                  <div class="flex items-center gap-4">
                    <div class="w-1.5 h-1.5 bg-slate-600 rounded-full group-hover:bg-warning transition-all"></div>
                    <span class="text-[10px] font-black uppercase tracking-[0.2em]">Audit_Chain</span>
                  </div>
                </a>
              </div>
            </nav>

            <script dangerouslySetInnerHTML={{ __html: `
               document.querySelectorAll('.nav-item').forEach(item => {
                  if (item.getAttribute('href') === window.location.pathname) {
                     item.classList.add('bg-white/5', 'text-white', 'border-white/10');
                     item.querySelector('div div').classList.add('scale-150');
                  }
               });
            `}} />

            <div class="p-8 border-t border-white/5">
              <form method="POST" action="/logout">
                <button type="submit" class="w-full flex items-center justify-center gap-4 p-4 rounded-xl text-[10px] font-black uppercase tracking-[0.3em] text-danger/80 hover:text-danger hover:bg-danger/10 border border-danger/10 hover:border-danger/30 transition-all duration-300">
                  Exit_Session
                </button>
              </form>
            </div>
          </aside>

          {/* MAIN CONTENT AREA */}
          <div class="flex-grow h-screen flex flex-col overflow-hidden relative">
            <header class="h-24 border-b border-white/5 flex items-center px-12 bg-obsidian/40 backdrop-blur-xl shrink-0 z-40">
               <div class="flex items-center gap-8">
                  <div class="flex items-center gap-3">
                    <div class="status-dot active animate-pulse"></div>
                    <span class="text-[11px] font-black text-white tracking-[0.4em] uppercase italic">System_Ready</span>
                  </div>
                  <div class="h-4 w-px bg-white/10"></div>
                  <div class="flex items-center gap-4">
                    <span class="text-[9px] font-bold text-slate-500 tracking-widest uppercase">Node_Hash:</span>
                    <span class="text-[10px] font-mono text-cyber/80 tracking-tighter">{Deno.hostname().slice(0, 16)}</span>
                  </div>
               </div>
               <div class="ml-auto flex items-center gap-8">
                  <div class="flex flex-col items-end">
                     <span class="text-[9px] font-bold text-slate-500 tracking-[0.3em] uppercase mb-1">Mesh_Sovereignty</span>
                     <div class="flex items-center gap-2">
                        <span class="text-[10px] font-black text-success uppercase italic">Synchronized</span>
                        <div class="w-1 h-1 bg-success rounded-full"></div>
                     </div>
                  </div>
                  <button id="toggle-right-sidebar" class="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center hover:bg-white/10 transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/></svg>
                  </button>
               </div>
            </header>

            <main class="flex-grow overflow-y-auto custom-scrollbar">
              <div class="max-w-[1400px] p-12 mx-auto animate-fade-in">
                {props.children}
              </div>
            </main>
          </div>

          {/* RIGHT SIDEBAR (Signal Stream) */}
          <aside id="right-sidebar" class="h-screen glass-panel border-l border-white/5 flex flex-col w-[450px] z-50 shrink-0 transition-all duration-500 ease-in-out relative">
            <div class="p-8 flex items-center justify-between border-b border-white/5 h-24 shrink-0">
               <div class="flex items-center gap-3">
                  <div class="w-2 h-2 bg-cyber rounded-full animate-pulse shadow-[0_0_10px_rgba(14,165,233,0.5)]"></div>
                  <span class="text-[11px] font-black text-white tracking-[0.3em] uppercase italic">Global_Signal_Stream</span>
               </div>
               <div class="flex items-center gap-2">
                  <span class="text-[9px] font-mono text-slate-500">LIVE_TELEMETRY</span>
               </div>
            </div>
            
            <div class="flex-grow overflow-hidden flex flex-col bg-obsidian/20">
               <blocking-log id="main-log" class="h-full"></blocking-log>
            </div>

            {/* Sidebar State Logic */}
            <script dangerouslySetInnerHTML={{ __html: `
              const rightSidebar = document.getElementById('right-sidebar');
              const toggleBtn = document.getElementById('toggle-right-sidebar');
              let isSidebarOpen = localStorage.getItem('rightSidebarOpen') !== 'false';

              function updateSidebarState() {
                if (isSidebarOpen) {
                  rightSidebar.style.width = '450px';
                  rightSidebar.style.opacity = '1';
                  rightSidebar.classList.remove('compact-state');
                } else {
                  rightSidebar.style.width = '60px';
                  rightSidebar.classList.add('compact-state');
                }
                localStorage.setItem('rightSidebarOpen', isSidebarOpen);
              }

              toggleBtn.addEventListener('click', () => {
                isSidebarOpen = !isSidebarOpen;
                updateSidebarState();
              });

              // Initial state
              updateSidebarState();
            `}} />
          </aside>
        </div>
      </body>
    </html>
  );
};
