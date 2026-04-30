export interface ConnectionTrace {
    timestamp: number;
    delta: number;
}

export class BehavioralAnalyzer {
    private traces: Map<string, ConnectionTrace[]> = new Map();

    track(ip: string) {
        const now = Date.now();
        const trace = this.traces.get(ip) || [];
        const last = trace[trace.length - 1];
        
        const delta = last ? now - last.timestamp : 0;
        trace.push({ timestamp: now, delta });
        
        if (trace.length > 50) trace.shift();
        this.traces.set(ip, trace);
    }

    analyze(ip: string): { botProbability: number, entropy: number } {
        const trace = this.traces.get(ip);
        if (!trace || trace.length < 5) return { botProbability: 0, entropy: 1 };

        // Calculate variance of deltas (Bots have very low variance/high regularity)
        const deltas = trace.slice(1).map(t => t.delta);
        const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        const variance = deltas.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / deltas.length;
        
        // Normalize entropy (higher variance = higher entropy = more human)
        const entropy = Math.min(variance / 1000, 1); 
        const botProbability = 1 - entropy;

        return { botProbability, entropy };
    }
}
