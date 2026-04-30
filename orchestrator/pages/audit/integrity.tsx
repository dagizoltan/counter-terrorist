import { Layout } from "../Layout.tsx";

export default function AuditIntegrity() {
  return (
    <Layout title="Mesh Integrity // Autonomous Defense Mesh">
      <div class="p-8 max-w-7xl mx-auto">
        <header class="mb-12">
          <div class="flex items-center gap-3 mb-2">
            <div class="h-[1px] w-8 bg-blue-500"></div>
            <span class="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500">System Security</span>
          </div>
          <h1 class="text-5xl font-black tracking-tighter text-white mb-4 italic">
            MESH_INTEGRITY
          </h1>
          <p class="text-slate-500 max-w-2xl font-medium leading-relaxed">
            Decentralized audit verification. The defense mesh uses a tamper-evident SHA-256 hash chain to ensure all security events are immutable and verified across the cluster.
          </p>
        </header>

        <div id="integrity-island-container">
           {/* IntegrityIsland.js will be hydrated here */}
        </div>
      </div>

      <script type="module" dangerouslySetInnerHTML={{ __html: `
        import { render } from 'preact';
        import IntegrityIsland from '/pages/audit/islands/IntegrityIsland.js';
        
        const container = document.getElementById('integrity-island-container');
        if (container) {
          render(<IntegrityIsland />, container);
        }
      `}} />
    </Layout>
  );
}
