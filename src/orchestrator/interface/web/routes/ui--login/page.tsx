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
            margin: 0;
            padding: 0;
            overflow: hidden;
            width: 100vw;
            height: 100vh;
          }
          .login-card {
            width: 100%;
            max-width: 440px;
            padding: 4.5rem;
            position: relative;
            z-index: 10;
            animation: card-entry 1s cubic-bezier(0.16, 1, 0.3, 1);
          }
          @keyframes card-entry {
            from { opacity: 0; transform: translateY(30px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          .bg-grid {
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 0;
            opacity: 0.03;
            background: linear-gradient(hsla(0,0%,100%,0.05) 1px, transparent 1px), 
                        linear-gradient(90deg, hsla(0,0%,100%,0.05) 1px, transparent 1px);
            background-size: 80px 80px;
          }
          .bg-gradient {
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 0;
            background: linear-gradient(to bottom, transparent, hsla(var(--bg-h), var(--bg-s), var(--bg-l), 0.2), var(--bg));
          }
          .error-box {
            margin-bottom: 2.5rem;
            padding: 1.25rem;
            background: hsla(var(--danger-h), var(--danger-s), var(--danger-l), 0.08);
            border: 1px solid hsla(var(--danger-h), var(--danger-s), var(--danger-l), 0.2);
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 1rem;
          }
          .danger-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--danger);
            box-shadow: 0 0 12px var(--danger);
          }
        `}} />
      </head>
      <body class="auth-page">
        <div class="noise-overlay"></div>
        <div class="bg-grid"></div>
        <div class="bg-gradient"></div>

        <main class="login-card glass-panel shadow-2xl" style="border-top: 2px solid hsla(var(--primary-h), var(--primary-s), var(--primary-l), 0.3);">
          <header style="text-align: center; margin-bottom: 5rem;">
            <div style="display: inline-flex; align-items: center; justify-content: center; width: 90px; height: 90px; border-radius: 28px; background: hsla(var(--primary-h), var(--primary-s), var(--primary-l), 0.08); border: 1px solid hsla(var(--primary-h), var(--primary-s), var(--primary-l), 0.2); margin-bottom: 3rem; transition: transform 0.7s;" class="hover:scale-105 transition-transform duration-700">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <h1 style="font-size: 2rem; font-weight: 700; letter-spacing: 0.25em; color: white; margin: 0 0 1.25rem 0; font-family: 'Outfit', sans-serif;">SOVEREIGN</h1>
            <p class="mono-xs" style="color: var(--text-secondary); opacity: 0.9; margin: 0; font-weight: 800; letter-spacing: 0.4em;">Tactical Orchestration Node</p>
          </header>

          {props.error && (
            <div class="error-box animate-in fade-in slide-in-from-top-2 duration-500">
              <div class="danger-dot"></div>
              <span class="mono-xs" style="color: var(--danger); font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em;">{props.error}</span>
            </div>
          )}

          <form method="POST" action="/login" style="display: flex; flex-direction: column; gap: 2.5rem;">
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              <label class="mono-xs" style="color: var(--text-muted); text-transform: uppercase; margin-left: 0.5rem; font-weight: 800; tracking: 0.3em;">Access Token</label>
              <div style="position: relative;">
                <input
                  class="t-input"
                  style="width: 100%; padding: 1.25rem 1.5rem; font-size: 1.125rem; letter-spacing: 0.4em; border-radius: 12px;"
                  name="token"
                  type="password"
                  placeholder="••••••••"
                  required
                  autoFocus
                />
                <div style="position: absolute; right: 1.5rem; top: 50%; transform: translateY(-50%); opacity: 0.4; color: var(--primary);">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
              </div>
            </div>

            <button class="t-btn" style="width: 100%; justify-content: center; padding: 1.25rem; font-size: 0.875rem; letter-spacing: 0.3em; font-weight: 900; border-radius: 12px;" type="submit">
              Engage Interface
            </button>
          </form>

          <footer style="margin-top: 4rem; text-align: center;">
            <div style="display: flex; align-items: center; justify-content: center; gap: 0.75rem; margin-bottom: 2rem;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--success); box-shadow: 0 0 10px var(--success);"></span>
              <span class="mono-xs" style="color: var(--text-secondary); text-transform: uppercase; font-weight: 800; letter-spacing: 0.2em;">mTLS Secure Gateway</span>
            </div>
            <p style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.35em; line-height: 1.8; margin: 0;">
              Proprietary System<br/>Access Logged & Cryptographically Audited
            </p>
          </footer>
        </main>

        <div style="position: fixed; bottom: 3rem; right: 3rem; opacity: 0.5;">
          <p class="mono-xs" style="font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5em;">Ghost Command v4.2</p>
        </div>
      </body>
    </html>
  );
};
