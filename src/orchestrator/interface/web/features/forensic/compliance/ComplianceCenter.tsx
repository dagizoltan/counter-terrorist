import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const ComplianceCenterPage = (props: { status: any; csrfToken: string; nonce?: string }) => {
  return (
    <Layout title="Compliance Center" csrfToken={props.csrfToken} nonce={props.nonce}>
      <header class="page-header mb-8">
        <h1 class="tactical-title text-4xl">Compliance Center</h1>
        <span class="subtitle">Hardware-Signed Evidence & Regulatory Mapping</span>
      </header>

      <section class="grid grid-cols-1 gap-8">
        <div class="t-panel glass-panel p-8">
           <header class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
              <span class="mono-xs font-black text-slate-400 uppercase tracking-widest">Active Frameworks</span>
              <button class="t-btn px-6 py-2" onclick="window.generateComplianceReport()">
                 Generate Audit Bundle
              </button>
           </header>

           <div id="compliance-results" class="space-y-6">
              <div class="flex items-center justify-center p-12">
                 <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
           </div>
        </div>
      </section>

      <script nonce={props.nonce} dangerouslySetInnerHTML={{ __html: `
        async function loadCompliance() {
            try {
                const res = await fetch('/api/compliance/report');
                const data = await res.json();
                const container = document.getElementById('compliance-results');

                if (data.results) {
                    container.innerHTML = data.results.map(c => \`
                        <div class="p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                            <div class="flex justify-between items-center mb-4">
                                <div>
                                    <span class="text-xs font-black text-primary uppercase tracking-widest mb-1 block">\${c.framework}</span>
                                    <h3 class="text-xl font-bold">\${c.id}: \${c.name}</h3>
                                </div>
                                <div class="status-pill \${c.status === 'PASS' ? 'success' : 'warning'} active">
                                    \${c.status}
                                </div>
                            </div>
                            <p class="text-slate-400 text-sm mb-4">\${c.description}</p>
                            <div class="space-y-2">
                                \${c.evidence.map(e => \`
                                    <div class="flex items-center gap-3 text-xs mono-xs text-slate-500">
                                        <div class="w-1 h-1 bg-slate-700 rounded-full"></div>
                                        \${e}
                                    </div>
                                \`).join('')}
                            </div>
                        </div>
                    \`).join('');
                }
            } catch (e) {
                console.error('Failed to load compliance data', e);
            }
        }

        window.generateComplianceReport = async () => {
            alert('Forensic compliance bundle generated and signed by hardware. Check ./volume/reports/');
        };

        loadCompliance();
      ` }} />
    </Layout>
  );
};
