export interface ConnectionTrace {
    timestamp: number;
    delta: number;
}

export class BehavioralAnalyzer {
    private traces: Map<string, ConnectionTrace[]> = new Map();
    private syscallFrequencies: Map<string, Map<string, number>> = new Map(); // comm -> syscall -> frequency

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

    /**
     * Learns and identifies syscall timing anomalies (Neural Defense).
     */
    trackSyscall(comm: string, syscall: string) {
        if (!this.syscallFrequencies.has(comm)) {
            this.syscallFrequencies.set(comm, new Map());
        }
        const freqMap = this.syscallFrequencies.get(comm)!;
        freqMap.set(syscall, (freqMap.get(syscall) || 0) + 1);
    }

    getSyscallAnomalyScore(comm: string, syscall: string): number {
        const freqMap = this.syscallFrequencies.get(comm);
        if (!freqMap) return 0; // New process, no baseline yet

        const total = Array.from(freqMap.values()).reduce((a, b) => a + b, 0);
        const count = freqMap.get(syscall) || 0;

        const probability = count / total;
        // Low probability events are more anomalous
        return probability < 0.01 ? 1.0 : 0;
    }
}
