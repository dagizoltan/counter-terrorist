import { jsx } from "hono/jsx";

export const Login = (props: { error?: string }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Authenticate | Sovereign Orchestrator</title>
        <link rel="stylesheet" href="/style.css" />
        <style dangerouslySetInnerHTML={{ __html: `
          body.auth-page {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: radial-gradient(circle at 50% 50%, hsla(var(--primary-h), var(--primary-s), 15%, 0.1) 0%, var(--bg) 100%);
          }
          .login-card {
            width: 100%;
            max-width: 420px;
            padding: 3.5rem;
            animation: card-entry 0.8s cubic-bezier(0.16, 1, 0.3, 1);
          }
          @keyframes card-entry {
            from { opacity: 0; transform: translateY(20px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}} />
      </head>
      <body class="auth-page">
        <div class="noise-overlay"></div>
        {/* Subtle Background Elements */}
        <div class="fixed inset-0 pointer-events-none z-0">
          <div class="absolute inset-0 opacity-[0.03]" style="background: linear-gradient(hsla(0,0%,100%,0.05) 1px, transparent 1px), linear-gradient(90deg, hsla(0,0%,100%,0.05) 1px, transparent 1px); background-size: 80px 80px;"></div>
          <div class="absolute inset-0 bg-gradient-to-b from-transparent via-bg/20 to-bg"></div>
        </div>

        <main class="login-card glass-panel z-10 border-t-2 border-primary/20">
          <header class="text-center mb-16">
            <div class="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 mb-10 shadow-primary/10 group hover:scale-110 transition-transform duration-700">
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <h1 class="text-3xl font-bold tracking-[0.2em] text-white mb-4">SOVEREIGN</h1>
            <p class="text-slate-500 font-bold tracking-[0.5em] text-[9px] uppercase opacity-60">Tactical Orchestration Node</p>
          </header>

          {props.error && (
            <div class="mb-8 p-4 bg-danger/10 border border-danger/20 rounded-lg flex items-center gap-3 animate-fade-in">
              <div class="w-1.5 h-1.5 rounded-full bg-danger animate-pulse"></div>
              <span class="mono-xs text-danger font-bold uppercase tracking-widest">{props.error}</span>
            </div>
          )}

          <form method="POST" action="/login" class="space-y-8">
            <div class="space-y-3">
              <label class="block mono-xs text-slate-600 font-bold uppercase tracking-widest ml-1">Access Token</label>
              <div class="relative">
                <input
                  class="t-input w-full py-4 px-5 text-base tracking-[0.3em]"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  autoFocus
                />
                <div class="absolute right-5 top-1/2 -translate-y-1/2 opacity-20">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
              </div>
            </div>

            <button class="t-btn w-full justify-center py-4 text-xs tracking-[0.2em] shadow-primary/10" type="submit">
              Engage Interface
            </button>
          </form>

          <footer class="mt-12 text-center">
            <div class="flex items-center justify-center gap-2 mb-6">
              <span class="dot active"></span>
              <span class="mono-xs text-slate-500 uppercase tracking-widest">mTLS Secure Gateway</span>
            </div>
            <p class="text-[9px] font-bold text-slate-700 uppercase tracking-[0.3em] leading-relaxed">
              Proprietary System<br/>Access Logged & Cryptographically Audited
            </p>
          </footer>
        </main>

        <div class="fixed bottom-10 right-10 opacity-30">
          <p class="mono-xs font-black text-slate-700 tracking-[0.5em] uppercase">Ghost_Command v4.2</p>
        </div>
      </body>
    </html>
  );
};
