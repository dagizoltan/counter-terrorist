import { jsx } from "hono/jsx";

export const LogViewer = ({ id = "log-viewer", height = "600px" }: { id?: string, height?: string }) => (
  <div class="glass-panel" style="padding:0; background:rgba(0,0,0,0.6); position:relative; overflow:hidden;">
     <div style="position:absolute; top:0; right:0; padding:2rem; opacity:0.05; pointer-events:none;">
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
     </div>
     <div style="padding:2.5rem;">
        <pre id={id} style={`font-family:'JetBrains Mono', monospace; font-size:12px; line-height:1.6; color:var(--text-secondary); overflow-x:auto; height:${height}; padding:1.5rem; white-space:pre-wrap;`}>
           Initializing_Secure_Stream_Access...
        </pre>
     </div>
     <div style="position:absolute; bottom:0; left:0; right:0; height:4rem; background:linear-gradient(to top, rgba(0,0,0,0.8), transparent); pointer-events:none;"></div>
     <script dangerouslySetInnerHTML={{ __html: `
        async function loadLogs() {
          const viewer = document.getElementById('${id}');
          if (!viewer) return;
          try {
            const res = await fetch('/api/compliance/logs');
            const data = await res.json();
            if (data && data.logs) {
              viewer.innerText = data.logs;
              viewer.scrollTop = viewer.scrollHeight;
            } else if (typeof data === 'string') {
              viewer.innerText = data;
              viewer.scrollTop = viewer.scrollHeight;
            }
          } catch (e) {
            console.error("Failed to load logs:", e);
          }
        }
        loadLogs();
        setInterval(loadLogs, 5000);
      ` }} />
  </div>
);
