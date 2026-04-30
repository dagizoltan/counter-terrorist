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
      <body class="min-h-screen flex flex-col font-sans">
        <nav class="p-6 border-b border-white/5 flex justify-between items-center sticky top-0 bg-black/80 backdrop-blur-md z-50">
          <div class="flex items-center gap-3">
            <div class="w-1.5 h-6 bg-red-600"></div>
            <h1 class="font-extrabold text-lg tracking-widest uppercase">Orchestrator</h1>
          </div>
          <div class="flex gap-8 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            <a href="/" class="hover:text-white transition-colors">Dashboard</a>
            <a href="/audit" class="hover:text-white transition-colors">Audit History</a>
            <a href="/settings" class="hover:text-white transition-colors">Settings</a>
            <form method="POST" action="/logout" class="inline">
              <button type="submit" class="hover:text-white transition-colors">Logout</button>
            </form>
          </div>
        </nav>
        
        <main class="max-w-[1600px] mx-auto w-full p-8 flex-grow">
          {props.children}
        </main>
        
        <footer class="mt-auto border-t border-white/5 p-8 text-left text-slate-600 text-[10px] uppercase tracking-[0.2em]">
          PROTECTION_ACTIVE // NODE: LOCALHOST // OS: LINUX
        </footer>
      </body>
    </html>
  );
};
