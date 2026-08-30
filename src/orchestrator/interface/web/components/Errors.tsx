
export const ErrorPage = ({ title, message, details, actionLabel, actionUrl }: { title: string, message: string, details?: string, actionLabel: string, actionUrl: string }) => (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>{title}</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body class="bg-[#050505] text-slate-300 font-sans h-screen flex flex-col items-center justify-center relative overflow-hidden">
        <div class="noise-overlay pointer-events-none opacity-[0.03] absolute inset-0"></div>

        <div class="t-panel glass-panel border-t-2 border-danger text-center max-w-lg relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
           <div class="inline-flex p-4 bg-danger/10 border border-danger/20 rounded-full mb-4 shadow-[0_0_20px_rgba(var(--danger-rgb),0.15)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-danger"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
           </div>
           <h1 class="tactical-title text-4xl text-white mb-4">{title}</h1>
           <p class="eyebrow leading-relaxed mb-4">
              {message}
           </p>
           {details && (
               <div class="bg-black/60 p-4 rounded border border-white/5 mb-5 overflow-x-auto text-left">
                  <span class="mono-xs text-danger font-black">{details}</span>
               </div>
           )}
           <a href={actionUrl} class="t-btn block w-full py-4 text-center font-black tracking-widest uppercase">
              {actionLabel}
           </a>
        </div>
      </body>
    </html>
);

export const NotFoundPage = () => (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>404 // ASSET NOT FOUND</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body class="bg-[#050505] text-slate-300 font-sans h-screen flex flex-col items-center justify-center relative overflow-hidden">
        <div class="noise-overlay pointer-events-none opacity-[0.03] absolute inset-0"></div>

        <div class="t-panel glass-panel border-t-2 border-danger text-center max-w-lg relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
           <div class="inline-flex p-4 bg-danger/10 border border-danger/20 rounded-full mb-4 shadow-[0_0_20px_rgba(var(--danger-rgb),0.15)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-danger"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
           </div>
           <h1 class="tactical-title text-4xl text-white mb-4">404 // ASSET NOT FOUND</h1>
           <p class="eyebrow leading-relaxed mb-5">
              The requested telemetry endpoint or tactical asset does not exist in the current namespace.
           </p>
           <a href="/" class="t-btn block w-full py-4 text-center font-black tracking-widest uppercase">
              Return To Overwatch
           </a>
        </div>

        <div class="absolute bottom-10 flex gap-4 opacity-40 pointer-events-none">
            <span class="eyebrow" data-tone="danger">Signal_Lost</span>
            <span class="text-slate-600">/</span>
            <span class="eyebrow tabular-nums">ERR_404_NOT_FOUND</span>
        </div>
      </body>
    </html>
);
