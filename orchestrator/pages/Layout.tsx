/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";

export const Layout = (props: {
  title: string;
  children: any;
  cssPaths?: string[];
  islandPaths?: string[];
}) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="api-token" content={Deno.env.get("API_TOKEN") || ""} />
        <title>{props.title} | Security Orchestrator</title>
        
        {/* Tailwind CDN for layout utilities */}
        <script src="https://cdn.tailwindcss.com"></script>
        
        {/* Global theme styles */}
        <link rel="stylesheet" href="/pages/global.css" />

        {/* Page specific styles */}
        {props.cssPaths?.map((path) => (
          <link rel="stylesheet" href={path} />
        ))}

        {/* Page specific islands (Web Components) */}
        {props.islandPaths?.map((path) => (
          <script type="module" src={path}></script>
        ))}
      </head>
      <body class="min-h-screen flex flex-col">
        <nav class="p-4 flex justify-between items-center">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
            <h1 class="font-bold text-xl tracking-tight">SECURE_ROOT</h1>
          </div>
          <div class="flex gap-6 text-sm font-medium">
            <a href="/" class="hover:text-red-400 transition-colors">Dashboard</a>
            <a href="/audit" class="hover:text-red-400 transition-colors">Audit History</a>
            <a href="/settings" class="hover:text-red-400 transition-colors">Settings</a>
            <form method="POST" action="/logout" class="inline">
              <button type="submit" class="hover:text-red-400 transition-colors">Logout</button>
            </form>
          </div>
        </nav>
        
        <main class="max-w-7xl mx-auto w-full p-6 flex-grow">
          {props.children}
        </main>
        
        <footer class="mt-auto border-t border-slate-800 p-6 text-center text-slate-500 text-xs">
          © 2024 Deno Security Orchestrator | Active Protection Enabled
        </footer>
      </body>
    </html>
  );
};
