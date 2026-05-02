import { jsx } from "hono/jsx";

/**
 * Atomic Login Page
 * Zero-dependency, zero-class authentication portal.
 */
export const Login = (props: { error?: string }) => {
  const styles = {
    body: "background-color:#020617; color:#f8fafc; margin:0; padding:0; height:100vh; display:flex; align-items:center; justify-content:center; font-family:sans-serif;",
    card: "width:100%; max-width:400px; padding:3rem; background:rgba(15, 23, 42, 0.7); border:1px solid rgba(255, 255, 255, 0.05); border-radius:2rem; backdrop-filter:blur(16px); display:flex; flex-direction:column; align-items:center; box-shadow:0 0 40px rgba(0, 0, 0, 0.5);",
    input: "width:100%; background:rgba(255, 255, 255, 0.05); border:1px solid rgba(255, 255, 255, 0.05); color:white; padding:1.25rem; border-radius:1rem; outline:none; font-size:14px; margin-bottom:1.5rem;",
    button: "width:100%; background:rgba(14, 165, 233, 0.1); border:1px solid rgba(14, 165, 233, 0.2); color:#0ea5e9; padding:1.25rem; border-radius:1rem; font-weight:900; letter-spacing:0.3em; text-transform:uppercase; cursor:pointer; transition:background 0.3s;",
    logo: "width:48px; height:48px; background:rgba(14, 165, 233, 0.1); border:1px solid rgba(14, 165, 233, 0.2); border-radius:1rem; display:flex; align-items:center; justify-content:center; margin-bottom:1.5rem;",
    error: "width:100%; background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.2); color:#ef4444; padding:1rem; border-radius:1rem; font-size:10px; font-weight:900; text-transform:uppercase; text-align:center; margin-bottom:2rem;"
  };

  return (
    <html lang="en" style="background-color:#020617;">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Sovereign Auth | GHOST_COMMAND</title>
      </head>
      <body style={styles.body}>
        <div style={styles.card}>
          <div style={styles.logo}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          
          <h1 style="font-weight:900; text-transform:uppercase; font-style:italic; font-size:1.5rem; letter-spacing:0.4em; color:white; margin:0 0 0.5rem 0;">GHOST_COMMAND</h1>
          <p style="font-weight:900; text-transform:uppercase; opacity:0.4; font-size:9px; letter-spacing:0.3em; margin-bottom:2.5rem;">Sovereign_Auth_Node</p>

          {props.error && <div style={styles.error}>{props.error}</div>}

          <form method="POST" action="/login" style="width:100%;">
            <div style="margin-bottom:0.5rem; padding-left:0.5rem; font-weight:900; text-transform:uppercase; opacity:0.4; font-size:8px; letter-spacing:0.2em;">Access_Token</div>
            <input
              style={styles.input}
              name="password"
              type="password"
              placeholder="••••••••••••••••"
              required
              autoFocus
            />
            <button style={styles.button} type="submit">Engage_System</button>
          </form>

          <div style="margin-top:2.5rem; padding-top:1.5rem; border-top:1px solid rgba(255, 255, 255, 0.05); width:100%; display:flex; justify-content:center; gap:1rem;">
             <div style="width:6px; height:6px; border-radius:50%; background:#10b981;"></div>
             <span style="font-weight:900; text-transform:uppercase; opacity:0.3; font-size:8px; letter-spacing:0.1em;">Audit_Active</span>
          </div>
        </div>
      </body>
    </html>
  );
};
