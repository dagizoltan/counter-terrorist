export interface ConnectionTrace {
    timestamp: number;
    delta: number;
}

export class BehavioralAnalyzer {
    private traces: Map<string, ConnectionTrace[]> = new Map();
    private syscallFrequencies: Map<string, Map<string, number>> = new Map(); // comm -> syscall -> frequency
    private slidingWindow: Map<string, number[]> = new Map(); // ip -> window of entropy scores
    private syscallSequences: Map<string, string[]> = new Map(); // pid -> recent syscalls
    private isLearningMode: boolean = false;
    private readonly MAX_MAP_SIZE = 1000;
    private kv?: Deno.Kv;

    // MALICIOUS INTENT PATTERNS
    private static readonly INTENT_SIGNATURES = [
        { name: "SHELLCODE_INJECT", sequence: ["mmap", "mprotect", "ptrace"], weight: 1.0 },
        { name: "CREDENTIAL_HARVEST", sequence: ["openat", "read", "connect"], weight: 0.8 },
        { name: "EXFIL_STAGING", sequence: ["socket", "connect", "write"], weight: 0.7 },
        { name: "RECONNAISSANCE", sequence: ["getuid", "getgid", "uname"], weight: 0.5 },
        { name: "PERSISTENCE_SETUP", sequence: ["openat", "write", "chmod"], weight: 0.6 }
    ];

    track(ip: string) {
        // BUG-55: Prevent Map exhaustion DoS
        if (!this.traces.has(ip) && this.traces.size >= this.MAX_MAP_SIZE) {
            const oldest = this.traces.keys().next().value;
            if (oldest) this.traces.delete(oldest);
        }

        const now = Date.now();
        const trace = this.traces.get(ip) || [];
        const last = trace[trace.length - 1];
        
        const delta = last ? now - last.timestamp : 0;
        trace.push({ timestamp: now, delta });
        
        if (trace.length > 50) trace.shift();
        this.traces.set(ip, trace);
    }

    shutdown() {
        if (this.kv) {
            this.persistBaselines().catch(() => {});
        }
        this.traces.clear();
        this.syscallFrequencies.clear();
        this.slidingWindow.clear();
        this.syscallSequences.clear();
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
        // BUG-55: Evict old entropy windows
        if (!this.slidingWindow.has(ip) && this.slidingWindow.size >= this.MAX_MAP_SIZE) {
            const oldest = this.slidingWindow.keys().next().value;
            if (oldest) this.slidingWindow.delete(oldest);
        }

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
            // BUG-55: Limit syscall baselines
            if (this.syscallFrequencies.size >= this.MAX_MAP_SIZE) {
                const oldest = this.syscallFrequencies.keys().next().value;
                if (oldest) this.syscallFrequencies.delete(oldest);
            }
            this.syscallFrequencies.set(comm, new Map());
        }
        const freqMap = this.syscallFrequencies.get(comm)!;
        freqMap.set(syscall, (freqMap.get(syscall) || 0) + 1);

        // 2. Sequence Tracking (Intent Modeling)
        const pidStr = pid.toString();

        if (!this.syscallSequences.has(pidStr) && this.syscallSequences.size >= this.MAX_MAP_SIZE) {
            const oldest = this.syscallSequences.keys().next().value;
            if (oldest) this.syscallSequences.delete(oldest);
        }

        const sequence = this.syscallSequences.get(pidStr) || [];
        sequence.push(syscall);
        if (sequence.length > 5) sequence.shift();
        this.syscallSequences.set(pidStr, sequence);
    }

    getIntentVerdict(pid: number): { intent: string, score: number } | null {
        const sequence = this.syscallSequences.get(pid.toString());
        if (!sequence) return null;

        for (const sig of BehavioralAnalyzer.INTENT_SIGNATURES) {
            // BUG-24: Use ordered sequence matching instead of simple 'includes' to reduce false positives
            let sigIdx = 0;
            for (const syscall of sequence) {
                if (syscall === sig.sequence[sigIdx]) {
                    sigIdx++;
                }
                if (sigIdx === sig.sequence.length) {
                    return { intent: sig.name, score: sig.weight };
                }
            }
        }
        return null;
    }

    setLearningMode(enabled: boolean) {
        this.isLearningMode = enabled;
        if (!enabled && this.kv) {
            this.persistBaselines();
        }
    }

    async setKv(kv: Deno.Kv) {
        this.kv = kv;
        await this.loadBaselines();
    }

    private async persistBaselines() {
        if (!this.kv) return;
        const serialized: Record<string, Record<string, number>> = {};
        for (const [comm, freqs] of this.syscallFrequencies.entries()) {
            serialized[comm] = Object.fromEntries(freqs);
        }
        await this.kv.set(["behavioral", "baselines", "v1"], {
            syscallFrequencies: serialized,
            updatedAt: Date.now()
        });
    }

    private async loadBaselines() {
        if (!this.kv) return;
        const entry = await this.kv.get<any>(["behavioral", "baselines", "v1"]);
        if (entry.value && entry.value.syscallFrequencies) {
            const data = entry.value.syscallFrequencies;
            for (const [comm, freqs] of Object.entries(data)) {
                this.syscallFrequencies.set(comm, new Map(Object.entries(freqs as any)));
            }
        }
    }

    /**
     * Enhanced Bayesian Anomaly Scoring
     * Calculates the probability that a syscall is anomalous given its historical frequency.
     */
    getSyscallAnomalyScore(comm: string, syscall: string): number {
        if (this.isLearningMode) return 0;

        const freqMap = this.syscallFrequencies.get(comm);
        if (!freqMap) return 0; // New process, no baseline yet

        const total = Array.from(freqMap.values()).reduce((a, b) => a + b, 0);
        const count = freqMap.get(syscall) || 0;

        // Apply Laplacian smoothing (Add-one smoothing) for small samples
        const smoothedProbability = (count + 1) / (total + 10); // Assume 10 possible syscall types in small window

        // P(Anomalous | Syscall) = 1 - P(Normal | Syscall)
        // Highly frequent syscalls (e.g. read/write) will have low anomaly scores.
        // Rare or unseen syscalls in this context (e.g. ptrace by 'deno') will score high.
        const anomalyScore = Math.max(0, 1 - (smoothedProbability * 5)); // Scaled impact

        return Math.min(anomalyScore, 1.0);
    }
}
