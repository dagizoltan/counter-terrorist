import { jsx } from "hono/jsx";

export const Login = (props: { error?: string }) => {
  return (
    <html lang="en" class="bg-[#020617]">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Sovereign Auth | GHOST_COMMAND</title>
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
                  danger: '#ef4444'
                }
              }
            }
          }
        `}} />
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body class="min-h-screen flex items-center justify-center font-sans overflow-hidden bg-obsidian relative">
        {/* Decorative Background Elements */}
        <div class="absolute inset-0 pointer-events-none overflow-hidden">
           <div class="absolute -top-24 -left-24 w-96 h-96 bg-cyber/10 rounded-full blur-[120px]"></div>
           <div class="absolute -bottom-24 -right-24 w-96 h-96 bg-danger/5 rounded-full blur-[120px]"></div>
           <div class="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        </div>

        <div class="relative w-full max-w-md animate-fade-in px-6">
          <div class="glass-panel p-10 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden group">
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyber/50 to-transparent"></div>
            
            <div class="flex flex-col items-center mb-10">
              <div class="w-12 h-12 rounded-2xl bg-cyber/10 flex items-center justify-center border border-cyber/20 mb-6 group-hover:scale-110 transition-transform duration-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-cyber"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <h1 class="text-2xl font-black tracking-[0.4em] uppercase text-white mb-2 italic">GHOST_COMMAND</h1>
              <p class="text-[10px] font-bold text-slate-500 tracking-[0.3em] uppercase">Sovereign Authentication Node</p>
            </div>

            {props.error && (
              <div class="bg-danger/10 border border-danger/20 text-danger text-[11px] font-bold py-3 px-4 rounded-xl mb-8 text-center animate-shake">
                {props.error}
              </div>
            )}

            <form method="POST" action="/login" class="space-y-8">
              <div class="space-y-3">
                <div class="flex justify-between items-center px-1">
                   <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest" for="password">
                     Access_Token
                   </label>
                   <span class="text-[9px] font-mono text-cyber/40 uppercase">Encrypted_Channel</span>
                </div>
                <div class="relative group/input">
                  <input
                    class="w-full bg-white/5 border border-white/5 text-white rounded-2xl py-4 px-5 text-sm font-medium focus:outline-none focus:border-cyber/50 transition-all placeholder:text-white/10"
                    id="password"
                    name="password"
                    type="password"
                    placeholder="••••••••••••••••"
                    required
                    autoFocus
                  />
                  <div class="absolute bottom-0 left-5 right-5 h-[1px] bg-gradient-to-r from-transparent via-cyber/0 to-transparent group-focus-within/input:via-cyber/50 transition-all duration-500"></div>
                </div>
              </div>

              <button
                class="w-full bg-cyber/10 hover:bg-cyber text-cyber hover:text-white font-black text-[11px] tracking-[0.4em] uppercase py-5 px-4 rounded-2xl border border-cyber/20 hover:border-cyber transition-all duration-300 shadow-lg hover:shadow-cyber/20"
                type="submit"
              >
                ENGAGE_SYSTEM
              </button>
            </form>

            <div class="mt-10 pt-8 border-t border-white/5 flex flex-col items-center gap-4">
               <div class="flex items-center gap-2">
                  <div class="w-1 h-1 rounded-full bg-emerald-500"></div>
                  <span class="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Biometric_Fallback_Ready</span>
               </div>
               <p class="text-[9px] font-medium text-slate-600 text-center leading-relaxed">
                 By engaging, you acknowledge this session is logged on the **Audit_Chain** and monitored by **eBPF Sentinel**.
               </p>
            </div>
          </div>
          
          <div class="mt-8 flex justify-center gap-8">
             <div class="flex flex-col items-center">
                <span class="text-[8px] font-black text-slate-700 uppercase tracking-widest mb-1">Grid_Status</span>
                <span class="text-[9px] font-mono text-emerald-500/50 uppercase tracking-tighter">Nominal</span>
             </div>
             <div class="flex flex-col items-center">
                <span class="text-[8px] font-black text-slate-700 uppercase tracking-widest mb-1">Mesh_Sync</span>
                <span class="text-[9px] font-mono text-emerald-500/50 uppercase tracking-tighter">Active</span>
             </div>
          </div>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
          }
          .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
        `}} />
      </body>
    </html>
  );
};
