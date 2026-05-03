import { jsx } from "hono/jsx";

export const Login = (props: { error?: string }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Sovereign Auth | GHOST_COMMAND</title>
        <link rel="stylesheet" href="/style.css" />
        <style dangerouslySetInnerHTML={{ __html: `
          body.auth-page {
            background-color: var(--bg-black);
            background-image: 
              radial-gradient(circle at 50% 50%, hsla(var(--primary-h), var(--primary-s), 10%, 0.1) 0%, transparent 80%),
              url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l30 30-30 30L0 30z' fill='%23ffffff' fill-opacity='0.02' fill-rule='evenodd'/%3E%3C/svg%3E");
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            overflow: hidden;
          }
          .auth-container {
            perspective: 1000px;
          }
          .auth-card {
            transform: rotateX(2deg);
            transition: transform 0.5s cubic-bezier(0.23, 1, 0.32, 1);
          }
          .auth-card:hover {
            transform: rotateX(0deg);
          }
        `}} />
      </head>
      <body class="auth-page">
        <div class="fixed inset-0 pointer-events-none">
          <div class="animate-scan-y opacity-10"></div>
          <div class="absolute inset-0 opacity-[0.03]" style="background: radial-gradient(circle at 2px 2px, white 1px, transparent 0); background-size: 32px 32px;"></div>
        </div>
        
        <div class="auth-container w-full max-w-md px-6 z-10">
          <div class="auth-card t-panel glass-panel p-12 border-t-4 border-primary animate-fade-in shadow-2xl">
            {/* Header Section */}
            <div class="mb-12 text-center">
              <div class="inline-block p-5 bg-primary/5 border border-primary/20 rounded-full shadow-primary mb-8 relative group">
                <div class="absolute inset-0 bg-primary/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <svg class="relative z-10" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              
              <h1 class="text-6xl font-black text-white tracking-tighter leading-none mb-4 uppercase italic">Ghost_Command</h1>
              <div class="flex items-center justify-center gap-4">
                <div class="flex items-center gap-2">
                  <span class="dot active shadow-primary pulse"></span>
                  <span class="mono-xs text-primary font-black tracking-[0.3em] uppercase">Auth_Node_01</span>
                </div>
                <span class="text-slate-800 font-bold opacity-30">//</span>
                <span class="mono-xs text-slate-500 font-bold tracking-widest uppercase">v4.2.0_STABLE</span>
              </div>
            </div>

            {/* Error Message */}
            {props.error && (
              <div class="bg-danger/5 border border-danger/20 text-danger p-6 mb-10 rounded-lg animate-fade-in relative overflow-hidden group">
                <div class="absolute inset-0 bg-danger/5 opacity-50 group-hover:opacity-100 transition-opacity"></div>
                <div class="flex items-center gap-4 relative z-10">
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                   <span class="mono-xs font-black uppercase tracking-widest">[CRITICAL_FAILURE]: {props.error}</span>
                </div>
              </div>
            )}

            {/* Auth Form */}
            <form method="POST" action="/login" class="space-y-10">
              <div class="space-y-4">
                <div class="flex justify-between items-center px-1">
                  <label class="mono-xs text-slate-500 font-black uppercase tracking-[0.2em]">Access_Identifier</label>
                  <span class="mono-xs text-slate-800 font-black">ENCRYPTED_INPUT</span>
                </div>
                <div class="relative group">
                  <input
                    class="t-input w-full p-6 pl-8 m-0 bg-black/60 border-white/5 focus:border-primary group-hover:border-white/10 transition-all text-xl tracking-widest font-black"
                    name="password"
                    type="password"
                    placeholder="••••••••••••••••"
                    required
                    autoFocus
                  />
                  <div class="absolute right-6 top-1/2 -translate-y-1/2 text-slate-700 group-hover:text-primary transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </div>
                </div>
              </div>

              <button class="t-btn w-full justify-center py-6 text-sm font-black shadow-primary/20 group relative overflow-hidden" type="submit">
                <div class="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform"></div>
                <span class="relative z-10 uppercase tracking-[0.2em]">Engage_Sovereign_Access</span>
              </button>
            </form>

            {/* Footer Metrics */}
            <footer class="mt-12 pt-10 border-t border-white/5 space-y-8">
               <div class="flex justify-between items-center px-2">
                  <div class="flex items-center gap-4">
                     <span class="dot active shadow-success"></span>
                     <span class="mono-xs font-black text-success tracking-widest uppercase">Encryption_Active</span>
                  </div>
                  <div class="flex items-center gap-2">
                     <span class="mono-xs text-slate-700 font-bold uppercase tracking-widest">Protocol:</span>
                     <span class="mono-xs text-white font-black uppercase tracking-widest bg-white/5 px-2 py-1 rounded">AES-256-GCM</span>
                  </div>
               </div>
               
               <div class="p-6 bg-black/60 border border-white/5 rounded-lg text-[9px] mono font-bold text-slate-600 leading-relaxed uppercase tracking-widest text-center italic">
                 Restricted access environment. All telemetry, keystrokes, and connection patterns are cryptographically hashed and committed to the forensic ledger.
               </div>
            </footer>
          </div>
        </div>
        
        {/* Ambient Status Indicators */}
        <div class="fixed bottom-12 left-12 space-y-3 animate-fade-in" style="animation-delay: 500ms;">
          <div class="flex items-center gap-4">
            <div class="w-1.5 h-1.5 bg-success shadow-success rounded-full"></div>
            <div class="mono-xs text-slate-700 font-black tracking-[0.3em] uppercase">Uplink_Stability: 99.98%</div>
          </div>
          <div class="flex items-center gap-4">
            <div class="w-1.5 h-1.5 bg-primary shadow-primary rounded-full pulse"></div>
            <div class="mono-xs text-primary font-black tracking-[0.3em] uppercase">mTLS_Handshake: VERIFIED</div>
          </div>
        </div>

        <div class="fixed bottom-12 right-12 opacity-20">
           <span class="mono-xs font-black text-slate-600 uppercase tracking-[0.5em]">SOVEREIGN_SYSTEMS_INTERNATIONAL</span>
        </div>
      </body>
    </html>
  );
};
