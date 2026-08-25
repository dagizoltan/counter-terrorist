import { jsx } from "hono/jsx";

/**
 * Authentication view.
 *
 * Previously carried a 70-line inline <style> block plus 15 inline style=""
 * attributes — a fourth place where surface colours, radii and spacing were
 * defined, drifting from the three that already existed. All of it now comes
 * from the shared stylesheet; see the AUTHENTICATION VIEW block in
 * design/03-components.css.
 */
export const Login = (props: { error?: string }) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="color-scheme" content="dark" />
      <title>Authenticate · Sovereign Orchestrator</title>
      <link rel="stylesheet" href="/style.css" />
    </head>
    <body class="auth-page">
      <div class="bg-grid" aria-hidden="true"></div>
      <div class="bg-gradient" aria-hidden="true"></div>

      <main class="login-card">
        <header class="login-card__head">
          <span class="login-card__mark" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </span>
          <h1 class="login-card__title">Sovereign</h1>
          <span class="eyebrow">Tactical Orchestration Node</span>
        </header>

        {props.error && (
          <div class="error-box" role="alert">
            <span class="danger-dot" aria-hidden="true"></span>
            <span>{props.error}</span>
          </div>
        )}

        <form method="POST" action="/login" class="login-form">
          <div class="field">
            <label class="field__label" for="token">Access Token</label>
            <input
              id="token"
              class="input login-input"
              name="token"
              type="password"
              placeholder="••••••••••••"
              autocomplete="current-password"
              required
              autofocus
            />
          </div>

          <button class="btn solid btn--lg btn--block" type="submit">Engage Interface</button>
        </form>

        <footer class="login-card__foot">
          <span class="eyebrow">
            <span class="indicator" data-state="ok" aria-hidden="true"></span>
            mTLS Secure Gateway
          </span>
          <p class="login-card__notice">Access is logged and cryptographically audited.</p>
        </footer>
      </main>
    </body>
  </html>
);
