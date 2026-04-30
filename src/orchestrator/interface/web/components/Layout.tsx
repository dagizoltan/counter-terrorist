/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";

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
        <title>{props.title} | Security Orchestrator</title>
        
        {/* Modern Typography */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        
        {/* Tailwind CDN */}
        <script src="https://cdn.tailwindcss.com"></script>
        <script dangerouslySetInnerHTML={{ __html: `
          tailwind.config = {
            theme: {
              extend: {
                fontFamily: {
                  sans: ['Inter', 'sans-serif'],
                  mono: ['JetBrains Mono', 'monospace'],
                },
                borderRadius: {
                  'none': '0',
                  'sm': '2px',
                  'DEFAULT': '4px',
                  'md': '6px',
                  'lg': '8px',
                  'xl': '12px',
                }
              }
            }
          }
        `}} />
        
        <style dangerouslySetInnerHTML={{ __html: `
          body { background-color: #050505; color: #e2e8f0; -webkit-font-smoothing: antialiased; }
          .sharp-border { border-radius: 2px !important; }
        `}} />

        {/* Global theme styles */}
        <link rel="stylesheet" href="/components/theme.css" />

        {/* Page specific styles */}
        {props.cssPaths?.map((path) => (
          <link rel="stylesheet" href={path} />
        ))}

        {/* Page specific islands (Web Components) */}
        {props.islandPaths?.map((path) => (
          <script type="module" src={path.replace(/.*\/islands\//, '/components/islands/')}></script>
        ))}
      </head>
      <body class="min-h-screen flex bg-[#050505] font-sans overflow-hidden">
        {/* SIDEBAR */}
        <aside id="sidebar" class="h-screen bg-black border-r border-white/5 flex flex-col transition-all duration-300 z-50 w-64 [&.compact]:w-20 group">
          {/* BRANDING */}
          <div class="p-6 flex items-center gap-3 border-b border-white/5 h-20">
            <div class="min-w-[1.5rem] h-6 bg-red-600 flex-shrink-0"></div>
            <span class="font-black text-lg tracking-widest uppercase truncate sidebar-label group-[.compact]:hidden">Orchestrator</span>
          </div>

          {/* NAVIGATION */}
          <nav class="flex-grow py-6 overflow-y-auto overflow-x-hidden">
            <div class="px-4 space-y-2">
              <a href="/" class="flex items-center gap-4 p-3 hover:bg-white/5 transition-all text-slate-400 hover:text-white group/item">
                <div class="w-6 h-6 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                </div>
                <span class="text-[11px] font-bold uppercase tracking-[0.2em] truncate sidebar-label group-[.compact]:hidden">Dashboard</span>
              </a>

              <a href="/events" class="flex items-center gap-4 p-3 hover:bg-white/5 transition-all text-slate-400 hover:text-white group/item">
                <div class="w-6 h-6 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                </div>
                <span class="text-[11px] font-bold uppercase tracking-[0.2em] truncate sidebar-label group-[.compact]:hidden">Events</span>
              </a>

              <a href="/processes" class="flex items-center gap-4 p-3 hover:bg-white/5 transition-all text-slate-400 hover:text-white group/item">
                <div class="w-6 h-6 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-9l-3 3H2v12h20V7z"/><path d="M16 2v5"/><path d="M8 2v5"/><path d="M3 13h18"/></svg>
                </div>
                <span class="text-[11px] font-bold uppercase tracking-[0.2em] truncate sidebar-label group-[.compact]:hidden">Kernel</span>
              </a>

              <div class="group/nav-item">
                <a href="/agents" class="flex items-center gap-4 p-3 hover:bg-white/5 transition-all text-slate-400 hover:text-white group/item">
                  <div class="w-6 h-6 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  </div>
                  <span class="text-[11px] font-bold uppercase tracking-[0.2em] truncate sidebar-label group-[.compact]:hidden">Agents</span>
                </a>
                
                <div class="ml-10 space-y-1 border-l border-white/5 group-[.compact]:hidden">
                  {/* HONEYPOTS */}
                  <div class="group/honeypot">
                    <a href="/honeypots" class="block py-2 pl-4 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all flex items-center gap-2">
                       <span>Honeypots</span>
                       <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </a>
                    <div class="space-y-0.5 ml-2">
                      <a href="/honeypots/ssh" class="block py-1 pl-4 text-[8px] font-bold uppercase tracking-[0.2em] text-slate-600 hover:text-green-500 transition-all">• SSH_Decoy</a>
                      <a href="/honeypots/redis" class="block py-1 pl-4 text-[8px] font-bold uppercase tracking-[0.2em] text-slate-600 hover:text-green-500 transition-all">• Redis_Vault</a>
                      <a href="/honeypots/http" class="block py-1 pl-4 text-[8px] font-bold uppercase tracking-[0.2em] text-slate-600 hover:text-green-500 transition-all">• HTTP_Admin</a>
                    </div>
                  </div>

                  {/* CORE AGENTS */}
                  <a href="/agents/firewall" class="block py-2 pl-4 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all">Firewall_Agent</a>
                  <a href="/agents/vpn" class="block py-2 pl-4 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all">VPN_Tunnels</a>
                  <a href="/agents/scanner" class="block py-2 pl-4 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all">Vuln_Scanner</a>
                  <a href="/agents/ebpf" class="block py-2 pl-4 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all">Kernel_eBPF</a>
                  <a href="/agents/fim" class="block py-2 pl-4 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all">FIM_Integrity</a>
                </div>
              </div>
              
              <a href="/sysinfo" class="flex items-center gap-4 p-3 hover:bg-white/5 transition-all text-slate-400 hover:text-white group/item">
                <div class="w-6 h-6 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M20 15h2"/><path d="M9 2v2"/><path d="M9 20v2"/><path d="M2 9h2"/><path d="M20 9h2"/></svg>
                </div>
                <span class="text-[11px] font-bold uppercase tracking-[0.2em] truncate sidebar-label group-[.compact]:hidden">Sys_Info</span>
              </a>

              <a href="/intel/map" class="flex items-center gap-4 p-3 hover:bg-white/5 transition-all text-slate-400 hover:text-white group/item">
                <div class="w-6 h-6 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                </div>
                <span class="text-[11px] font-bold uppercase tracking-[0.2em] truncate sidebar-label group-[.compact]:hidden">Global_Map</span>
              </a>

              <a href="/forensics/replay" class="flex items-center gap-4 p-3 hover:bg-white/5 transition-all text-slate-400 hover:text-white group/item">
                <div class="w-6 h-6 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-1.9"/><path d="M3 3v18h18"/><path d="M7 15l4-4 4 4 5-5"/></svg>
                </div>
                <span class="text-[11px] font-bold uppercase tracking-[0.2em] truncate sidebar-label group-[.compact]:hidden">Forensic_Replay</span>
              </a>

              <a href="/audit/integrity" class="flex items-center gap-4 p-3 hover:bg-white/5 transition-all text-slate-400 hover:text-white group/item">
                <div class="w-6 h-6 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                </div>
                <span class="text-[11px] font-bold uppercase tracking-[0.2em] truncate sidebar-label group-[.compact]:hidden">Mesh_Integrity</span>
              </a>

              <a href="/audit" class="flex items-center gap-4 p-3 hover:bg-white/5 transition-all text-slate-400 hover:text-white group/item">
                <div class="w-6 h-6 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10h10V2z"/><path d="M12 12H2v10h10V12z"/><path d="M22 2h-10v10h10V2z"/><path d="M22 12h-10v10h10V12z"/></svg>
                </div>
                <span class="text-[11px] font-bold uppercase tracking-[0.2em] truncate sidebar-label group-[.compact]:hidden">Audit Log</span>
              </a>

              <a href="/settings" class="flex items-center gap-4 p-3 hover:bg-white/5 transition-all text-slate-400 hover:text-white group/item">
                <div class="w-6 h-6 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                </div>
                <span class="text-[11px] font-bold uppercase tracking-[0.2em] truncate sidebar-label group-[.compact]:hidden">Settings</span>
              </a>
            </div>
          </nav>

          {/* FOOTER / LOGOUT */}
          <div class="mt-auto border-t border-white/5 p-4">
            <form method="POST" action="/logout" class="w-full">
              <button type="submit" class="w-full flex items-center gap-4 p-3 hover:bg-red-950/20 text-slate-500 hover:text-red-500 transition-all">
                <div class="w-6 h-6 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
                </div>
                <span class="text-[11px] font-bold uppercase tracking-[0.2em] truncate sidebar-label group-[.compact]:hidden">Logout</span>
              </button>
            </form>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <div class="flex-grow h-screen flex flex-col overflow-hidden">
          {/* HEADER / TOGGLE */}
          <header class="h-20 border-b border-white/5 flex items-center px-8 bg-black/40 backdrop-blur-sm shrink-0">
             <button id="sidebar-toggle" class="p-2 hover:bg-white/5 text-slate-400 hover:text-white transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
             </button>
             <div class="ml-auto flex items-center gap-6">
                <div class="flex flex-col items-end">
                   <span class="text-[10px] font-black text-slate-500 tracking-widest uppercase">Node_Status</span>
                   <span class="text-[11px] font-bold text-green-500 tracking-wider">SYNCED_0X44A</span>
                </div>
                <div class="w-10 h-10 bg-white/5 border border-white/5 flex items-center justify-center text-[10px] font-black">DR</div>
             </div>
          </header>

          <main class="flex-grow overflow-y-auto">
            <div class="max-w-[1500px] p-8 mx-auto">
              {props.children}
            </div>
          </main>
        </div>

        <script dangerouslySetInnerHTML={{ __html: `
          const sidebar = document.getElementById('sidebar');
          const toggle = document.getElementById('sidebar-toggle');
          
          // Use localStorage to persist sidebar state
          const isCompact = localStorage.getItem('sidebar-compact') === 'true';
          if (isCompact) sidebar.classList.add('compact');

          toggle.addEventListener('click', () => {
            const nowCompact = sidebar.classList.toggle('compact');
            localStorage.setItem('sidebar-compact', nowCompact);
          });
        `}} />
      </body>
    </html>
  );
};
