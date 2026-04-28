/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";

export const Layout = (props: { title: string; children: any }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="api-token" content={Deno.env.get("API_TOKEN") || ""} />
        <title>{props.title} | Security Orchestrator</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script type="module" src="/static/components/StatusIndicator.js"></script>
        <script type="module" src="/static/components/BlockingLog.js"></script>
      </head>
      <body class="bg-slate-900 text-slate-100 min-h-screen">
        <nav class="border-b border-slate-800 p-4 flex justify-between items-center bg-slate-950">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
            <h1 class="font-bold text-xl tracking-tight">SECURE_ROOT</h1>
          </div>
          <div class="flex gap-6 text-sm font-medium">
            <a href="/" class="hover:text-red-400 transition-colors">Dashboard</a>
            <a href="/audit" class="hover:text-red-400 transition-colors">Audit History</a>
            <a href="/settings" class="hover:text-red-400 transition-colors">Settings</a>
          </div>
        </nav>
        <main class="max-w-7xl mx-auto p-6">
          {props.children}
        </main>
        <footer class="mt-auto border-t border-slate-800 p-6 text-center text-slate-500 text-xs">
          © 2024 Deno Security Orchestrator | Active Protection Enabled
        </footer>
      </body>
    </html>
  );
};
