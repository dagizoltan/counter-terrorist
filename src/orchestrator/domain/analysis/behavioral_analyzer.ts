import { ok } from "@core/result.ts";
import { BaseService } from "@core/base_service.ts";

export interface ConnectionTrace {
    timestamp: number;
    delta: number;
}

export interface BehavioralBaseline {
    syscallFrequencies: Record<string, Record<string, number>>;
    updatedAt: number;
}

export class BehavioralAnalyzer extends BaseService {
    private traces: Map<string, ConnectionTrace[]> = new Map();
    private syscallFrequencies: Map<string, Map<string, number>> = new Map(); // comm -> syscall -> frequency
    private slidingWindow: Map<string, number[]> = new Map(); // ip -> window of entropy scores
    private syscallSequences: Map<string, string[]> = new Map(); // pid -> recent syscalls
    private isLearningMode: boolean = false;
    private kv?: Deno.Kv;
    private purgeInterval?: number;

    // MALICIOUS INTENT PATTERNS
    private static readonly INTENT_SIGNATURES = [
        { name: "SHELLCODE_INJECT", sequence: ["mmap", "mprotect", "ptrace"], weight: 1.0 },
        { name: "CREDENTIAL_HARVEST", sequence: ["openat", "read", "connect"], weight: 0.8 },
        { name: "EXFIL_STAGING", sequence: ["socket", "connect", "write"], weight: 0.7 },
        { name: "RECONNAISSANCE", sequence: ["getuid", "getgid", "uname"], weight: 0.5 },
        { name: "PERSISTENCE_SETUP", sequence: ["openat", "write", "chmod"], weight: 0.6 }
    ];

    constructor() {
        super();
    }

    protected override async onInit(): Promise<import("../../core/result.ts").Result<void>> {
        // SOV-06: Background cleanup for stale behavioral data
        this.purgeInterval = setInterval(() => this.purgeStaleData(), 300000); // 5 Minutes
        return { success: true, data: undefined };
    }

    private purgeStaleData() {
        const now = Date.now();
        const STALE_THRESHOLD = 3600000; // 1 Hour

        // Purge network traces
        for (const [ip, trace] of this.traces.entries()) {
            const last = trace[trace.length - 1];
            if (last && (now - last.timestamp > STALE_THRESHOLD)) {
                this.traces.delete(ip);
                this.slidingWindow.delete(ip);
            }
        }

        // Purge syscall sequences (PID reuse mitigation)
        // Since we can't easily know if a PID is still active without system access
        // (and this service is platform-agnostic), we use a shorter TTL for sequences.
        const SEQUENCE_TTL = 900000; // 15 Minutes
        // (traces already purged above)

        // For syscall sequences, we don't have timestamps per syscall,
        // so we just clear everything that hasn't been updated if we had timestamps.
        // As a fallback, we clear sequences if the corresponding comm frequency map is tiny
        // or just periodically flush all sequences to prevent stale intent matching on reused PIDs.
        if (now % 3600000 < 300000) { // Once an hour
            this.syscallSequences.clear();
        }
    }

    track(ip: string) {
        const now = Date.now();
        const trace = this.traces.get(ip) || [];
        const last = trace[trace.length - 1];
        
        const delta = last ? now - last.timestamp : 0;
        trace.push({ timestamp: now, delta });
        
        if (trace.length > 50) trace.shift();
        this.traces.set(ip, trace);
    }

    protected override async onShutdown(): Promise<import("@core/result.ts").Result<void>> {
        const { ok } = await import("@core/result.ts");
        if (this.purgeInterval) {
            clearInterval(this.purgeInterval);
            this.purgeInterval = undefined;
        }
        if (this.kv) {
            await this.persistBaselines().catch(() => {});
        }
        this.traces.clear();
        this.syscallFrequencies.clear();
        this.slidingWindow.clear();
        this.syscallSequences.clear();
        return ok(undefined);
    }

    analyze(ip: string): { botProbability: number, entropy: number } {
        const trace = this.traces.get(ip);
        if (!trace || trace.length < 5) return { botProbability: 0, entropy: 1 };

        // Calculate variance of deltas (Bots have very low variance/high regularity)
        const deltas = trace.slice(1).map(t => t.delta);
        const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        const variance = deltas.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / deltas.length;
        
        // BUG-2.3 FIX: Refined entropy heuristic
        // Use a more dynamic normalization based on mean delta to handle high-latency human traffic.
        // Guard against zero variance for perfect regular traffic
        const normalizationFactor = Math.max(1000, mean * 2);
        let currentEntropy = variance === 0 ? 0 : Math.min(variance / normalizationFactor, 1);

        // SOV-05 STABILITY: Guard against NaN/Infinity in calculations
        if (isNaN(currentEntropy) || !isFinite(currentEntropy)) {
            currentEntropy = 1.0; // Assume normal/high entropy on calculation failure
        }

        // TACTICAL: Sliding Window to reduce false positives
        const window = this.slidingWindow.get(ip) || [];
        window.push(currentEntropy);
        if (window.length > 5) window.shift();
        this.slidingWindow.set(ip, window);

        const avgEntropy = window.reduce((a, b) => a + b, 0) / window.length;
        const botProbability = Math.max(0, Math.min(1, 1 - avgEntropy));

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
        if (sequence.length > 10) sequence.shift();
        this.syscallSequences.set(pidStr, sequence);
    }

    getIntentVerdict(pid: number): { intent: string, score: number } | null {
        const sequence = this.syscallSequences.get(pid.toString());
        if (!sequence) return null;

        const MAX_NOISE = 2;

        for (const sig of BehavioralAnalyzer.INTENT_SIGNATURES) {
            // MATCHING WITH NOISE TOLERANCE
            let sigIdx = 0;
            let noiseCount = 0;

            for (const syscall of sequence) {
                if (syscall === sig.sequence[sigIdx]) {
                    sigIdx++;
                    // Reset noise count on match? Or keep it global?
                    // Let's keep it global for the whole sequence to prevent loose matches.
                } else if (sigIdx > 0) {
                    noiseCount++;
                }

                if (noiseCount > MAX_NOISE) {
                    // Too much noise, reset match attempt for this signature
                    sigIdx = 0;
                    noiseCount = 0;
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
        const entry = await this.kv.get<BehavioralBaseline>(["behavioral", "baselines", "v1"]);
        if (entry.value && entry.value.syscallFrequencies) {
            const data = entry.value.syscallFrequencies;
            for (const [comm, freqs] of Object.entries(data)) {
                this.syscallFrequencies.set(comm, new Map(Object.entries(freqs)));
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

        // SOV-05 STABILITY: Guard against division by zero
        if (total === 0) return 0;

        // Apply Laplacian smoothing (Add-one smoothing) for small samples
        const smoothedProbability = (count + 1) / (total + 10); // Assume 10 possible syscall types in small window

        // P(Anomalous | Syscall) = 1 - P(Normal | Syscall)
        // Highly frequent syscalls (e.g. read/write) will have low anomaly scores.
        // Rare or unseen syscalls in this context (e.g. ptrace by 'deno') will score high.
        const anomalyScore = Math.max(0, 1 - (smoothedProbability * 5)); // Scaled impact

        const finalScore = Math.min(anomalyScore, 1.0);
        return isNaN(finalScore) ? 0 : finalScore;
    }
}
