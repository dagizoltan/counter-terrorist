export interface ConnectionTrace {
    timestamp: number;
    delta: number;
}

export class BehavioralAnalyzer {
    private traces: Map<string, ConnectionTrace[]> = new Map();
    private syscallFrequencies: Map<string, Map<string, number>> = new Map(); // comm -> syscall -> frequency
    private slidingWindow: Map<string, number[]> = new Map(); // ip -> window of entropy scores
    private syscallSequences: Map<string, string[]> = new Map(); // pid -> recent syscalls

    // MALICIOUS INTENT PATTERNS
    private static readonly INTENT_SIGNATURES = [
        { name: "SHELLCODE_INJECT", sequence: ["mmap", "mprotect", "ptrace"], weight: 1.0 },
        { name: "CREDENTIAL_HARVEST", sequence: ["openat", "read", "connect"], weight: 0.8 },
        { name: "EXFIL_STAGING", sequence: ["socket", "connect", "write"], weight: 0.7 }
    ];

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
        const currentEntropy = Math.min(variance / 1000, 1);

        // TACTICAL: Sliding Window to reduce false positives
        const window = this.slidingWindow.get(ip) || [];
        window.push(currentEntropy);
        if (window.length > 5) window.shift();
        this.slidingWindow.set(ip, window);

        const avgEntropy = window.reduce((a, b) => a + b, 0) / window.length;
        const botProbability = 1 - avgEntropy;

        return { botProbability, entropy: avgEntropy };
    }

    /**
     * Learns and identifies syscall timing anomalies (Neural Defense).
     */
    trackSyscall(pid: number, comm: string, syscall: string) {
        // 1. Frequency Tracking
        if (!this.syscallFrequencies.has(comm)) {
            this.syscallFrequencies.set(comm, new Map());
        }
        const freqMap = this.syscallFrequencies.get(comm)!;
        freqMap.set(syscall, (freqMap.get(syscall) || 0) + 1);

        // 2. Sequence Tracking (Intent Modeling)
        const pidStr = pid.toString();
        const sequence = this.syscallSequences.get(pidStr) || [];
        sequence.push(syscall);
        if (sequence.length > 5) sequence.shift();
        this.syscallSequences.set(pidStr, sequence);
    }

    getIntentVerdict(pid: number): { intent: string, score: number } | null {
        const sequence = this.syscallSequences.get(pid.toString());
        if (!sequence) return null;

        for (const sig of BehavioralAnalyzer.INTENT_SIGNATURES) {
            // Check if sequence contains the signature (simple subset match)
            if (sig.sequence.every(s => sequence.includes(s))) {
                return { intent: sig.name, score: sig.weight };
            }
        }
        return null;
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
