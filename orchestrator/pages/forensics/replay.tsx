import { Layout } from "../Layout.tsx";

export default function ForensicReplay() {
  return (
    <Layout title="Forensic Replay // Autonomous Defense Mesh">
      <div class="p-8 max-w-7xl mx-auto">
        <header class="mb-12">
          <div class="flex items-center gap-3 mb-2">
            <div class="h-[1px] w-8 bg-red-500"></div>
            <span class="text-[10px] font-black uppercase tracking-[0.4em] text-red-500">Post-Mortem Engine</span>
          </div>
          <h1 class="text-5xl font-black tracking-tighter text-white mb-4 italic">
            FORENSIC_REPLAY
          </h1>
          <p class="text-slate-500 max-w-2xl font-medium leading-relaxed">
            Reconstruct security incidents in high fidelity. Scrub through the mesh timeline to visualize threat propagation, agent responses, and the chain of custody.
          </p>
        </header>

        <div id="replay-island-container">
           {/* ReplayIsland.js will be hydrated here */}
        </div>
      </div>

      <script type="module" dangerouslySetInnerHTML={{ __html: `
        import { render } from 'preact';
        import ReplayIsland from '/pages/forensics/islands/ReplayIsland.js';
        
        const container = document.getElementById('replay-island-container');
        if (container) {
          render(<ReplayIsland />, container);
        }
      `}} />
    </Layout>
  );
}
