import { jsx } from "hono/jsx";

/**
 * Atomic Login Page
 * Zero-dependency, CSS-driven authentication portal.
 */
export const Login = (props: { error?: string }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Sovereign Auth | GHOST_COMMAND</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <div class="auth-container animate-fade-in">
          <div class="glass-panel auth-card">
            <div style="width:48px; height:48px; background:var(--cyber-blue-glow); border:1px solid rgba(14,165,233,0.2); border-radius:1rem; display:flex; align-items:center; justify-content:center; margin:0 auto 1.5rem auto;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--cyber-blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            
            <h1 style="font-size:1.75rem; color:white; margin:0 0 0.5rem 0; font-style:italic;">GHOST_COMMAND</h1>
            <p class="mono-label" style="opacity:0.4; margin-bottom:2.5rem;">Sovereign_Auth_Node // v4.2</p>

            {props.error && <div class="error-banner">{props.error}</div>}

            <form method="POST" action="/login" style="width:100%; text-align:left;">
              <div class="mono-label" style="margin-bottom:0.75rem; padding-left:0.5rem; opacity:0.4;">Access_Token</div>
              <input
                class="auth-input"
                name="password"
                type="password"
                placeholder="••••••••••••••••"
                required
                autoFocus
              />
              <button class="tactical-button" style="width:100%; padding:1.25rem;" type="submit">Engage_System</button>
            </form>

            <div style="margin-top:2.5rem; padding-top:1.5rem; border-top:1px solid var(--border-color); width:100%; display:flex; justify-content:center; gap:0.75rem; align-items:center;">
               <div class="status-dot active pulse"></div>
               <span class="mono-label" style="opacity:0.3;">Audit_Active</span>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
};
