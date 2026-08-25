import { h, render } from '../../../vendor/preact.js';
import { useState, useEffect } from '../../../vendor/preact-hooks.js';
import htm from '../../../vendor/htm.js';

const html = htm.bind(h);

/**
 * CausalLineageIsland
 * SOV-P5: Reactive graph-based visualization of threat lineage.
 */
function CausalLineageIsland() {
    const [graph, setGraph] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchGraph();
    }, []);

    const fetchGraph = async () => {
        setLoading(true);
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
            const res = await fetch("/api/forensics/graph", {
                headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
            });
            const data = await res.json();
            setGraph(data);
        } catch (e) {
            console.error("[CAUSAL] Failed to fetch graph", e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return html`<div class="animate-pulse flex flex-col gap-4">
        <div class="h-4 bg-white/5 rounded w-3/4"></div>
        <div class="h-32 bg-white/5 rounded w-full"></div>
    </div>`;

    if (!graph || Object.keys(graph).length === 0) {
        return html`<div class="flex flex-col items-center justify-center py-5 text-slate-600">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mb-4 opacity-20"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            <span class="eyebrow">No_Causal_Nodes_Identified</span>
        </div>`;
    }

    return html`
        <div class="flex flex-col gap-4">
            <div class="flex justify-between items-center mb-4">
                <div class="flex items-center gap-4">
                    <div class="indicator" data-state="info" data-pulse="" aria-hidden="true"></div>
                    <span class="eyebrow" data-tone="primary">Lineage_Map_Active</span>
                </div>
                <button onClick=${fetchGraph} class="eyebrow hover:text-white transition-colors flex items-center gap-2">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                    Refresh
                </button>
            </div>

            <div class="space-y-4">
                ${Object.values(graph).slice(0, 10).map(node => html`
                    <div class="p-4 bg-black/40 border border-white/5 rounded-lg hover:border-primary/30 transition-all group">
                        <div class="flex justify-between items-start mb-3">
                            <div class="flex items-center gap-4">
                                <div class=${`px-3 py-1 rounded text-[9px] font-black tracking-widest uppercase ${node.type === 'PROCESS' ? 'bg-primary/10 text-primary' : node.type === 'NETWORK' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
                                    ${node.type}
                                </div>
                                <span class="mono-xs font-black text-white uppercase tracking-tight">${node.label}</span>
                            </div>
                            <span class="mono-xs text-slate-600 font-bold">${new Date(node.timestamp).toLocaleTimeString()}</span>
                        </div>

                        ${node.children.length > 0 && html`
                            <div class="mt-4 pt-4 border-t border-white/[0.03] flex flex-col gap-2">
                                <span class="eyebrow">Downstream_Effects:</span>
                                <div class="flex flex-wrap gap-2">
                                    ${node.children.map(childId => html`
                                        <div class="px-3 py-1 bg-white/5 rounded mono-xs text-slate-400 border border-white/5 truncate max-w-[200px]">
                                            ${childId.split('-')[0]}
                                        </div>
                                    `)}
                                </div>
                            </div>
                        `}
                    </div>
                `)}
            </div>

            ${Object.keys(graph).length > 10 && html`
                <div class="text-center py-4">
                    <span class="eyebrow italic">+ ${Object.keys(graph).length - 10} additional nodes in causality chain</span>
                </div>
            `}
        </div>
    `;
}

const root = document.getElementById('causal-lineage-root');
if (root) {
    render(h(CausalLineageIsland), root);
}
