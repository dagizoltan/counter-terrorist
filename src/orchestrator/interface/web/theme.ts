/**
 * TACTICAL_DESIGN_SYSTEM
 * Expanded, zero-dependency CSS for the Sovereign Security Orchestrator.
 */
export const TACTICAL_THEME = `
  :root {
    --obsidian: #020617;
    --panel-bg: rgba(15, 23, 42, 0.7);
    --cyber-blue: #0ea5e9;
    --cyber-green: #10b981;
    --cyber-red: #ef4444;
    --cyber-yellow: #f59e0b;
    --text-primary: #f8fafc;
    --text-secondary: #94a3b8;
    --border-dim: rgba(255, 255, 255, 0.05);
    --border-bright: rgba(255, 255, 255, 0.1);
    --glow-blue: 0 0 20px rgba(14, 165, 233, 0.2);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background-color: var(--obsidian);
    color: var(--text-primary);
    font-family: 'Inter', 'Outfit', sans-serif;
    line-height: 1.5;
    overflow: hidden;
    height: 100vh;
    margin: 0;
  }

  /* ── TAILWIND SHIM (Sovereign Utilities) ────────────────────────── */
  .flex { display: flex; }
  .flex-col { flex-direction: column; }
  .items-center { align-items: center; }
  .justify-between { justify-content: space-between; }
  .justify-center { justify-content: center; }
  .relative { position: relative; }
  .absolute { position: absolute; }
  .inset-0 { top: 0; right: 0; bottom: 0; left: 0; }
  .w-full { width: 100%; }
  .h-full { height: 100%; }
  .min-h-screen { min-height: 100vh; }
  .z-50 { z-index: 50; }
  
  .gap-2 { gap: 0.5rem; }
  .gap-4 { gap: 1rem; }
  .gap-6 { gap: 1.5rem; }
  .gap-8 { gap: 2rem; }
  
  .p-4 { padding: 1rem; }
  .p-6 { padding: 1.5rem; }
  .p-8 { padding: 2rem; }
  .p-10 { padding: 2.5rem; }
  .p-12 { padding: 3rem; }
  
  .m-0 { margin: 0; }
  .mb-2 { margin-bottom: 0.5rem; }
  .mb-4 { margin-bottom: 1rem; }
  .mb-8 { margin-bottom: 2rem; }
  .mb-10 { margin-bottom: 2.5rem; }

  .bg-obsidian { background-color: var(--obsidian); }
  .text-white { color: white; }
  .text-cyber { color: var(--cyber-blue); }
  .text-danger { color: var(--cyber-red); }
  .text-success { color: var(--cyber-green); }
  
  .border-b { border-bottom: 1px solid var(--border-dim); }
  .border-r { border-right: 1px solid var(--border-dim); }
  .border-t { border-top: 1px solid var(--border-dim); }
  
  .font-black { font-weight: 900; }
  .uppercase { text-transform: uppercase; }
  .italic { font-style: italic; }
  .tracking-widest { letter-spacing: 0.3em; }

  /* ── Hardened Components ───────────────────────────────────────── */
  .glass-panel {
    background: var(--panel-bg);
    backdrop-filter: blur(16px);
    border: 1px solid var(--border-dim);
    box-shadow: var(--glow-blue);
  }

  .tactical-sidebar {
    width: 320px;
    height: 100vh;
    flex-shrink: 0;
  }

  .main-stage {
    flex-grow: 1;
    height: 100vh;
    overflow-y: auto;
  }

  .tactical-header {
    height: 6rem;
    background: rgba(2, 6, 23, 0.4);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    padding: 0 3rem;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    border-radius: 0.75rem;
    text-decoration: none;
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    transition: all 0.3s;
  }

  .nav-item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: white;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-dot.active {
    background: var(--cyber-green);
    box-shadow: 0 0 12px var(--cyber-green);
  }

  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
`;
