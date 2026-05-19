import { assertEquals, assertExists } from "@std/assert";
import { BehavioralAnalyzer } from "@domain/analysis/behavioral_analyzer.ts";

Deno.test("BehavioralAnalyzer - Bot probability and entropy", () => {
    const analyzer = new BehavioralAnalyzer();
    const ip = "1.1.1.1";

    // 1. Setup regular traffic (Low variance -> Bot)
    const trace = Array.from({ length: 10 }, (_, j) => ({
        timestamp: Date.now() + j * 1000,
        delta: 1000
    }));
    (analyzer as any).traces.set(ip, trace);

    const result1 = analyzer.analyze(ip);
    // Regular traffic with 1000ms delta: variance is 0.
    // entropy = 0, botProbability = 1.
    console.log("Result 1:", result1);
    assertEquals(result1.botProbability >= 0.9, true);
    assertEquals(result1.entropy <= 0.1, true);

    // 2. Setup irregular traffic (High variance -> Human)
    const ip2 = "2.2.2.2";
    const deltas = [100, 2000, 50, 5000, 10, 1000, 300, 200, 1500, 400];
    let currentTs = Date.now();
    (analyzer as any).traces.set(ip2, []);
    for (const d of deltas) {
        currentTs += d;
        const trace = (analyzer as any).traces.get(ip2);
        trace.push({ timestamp: currentTs, delta: d });
    }

    const result2 = analyzer.analyze(ip2);
    assertEquals(result2.botProbability < 0.5, true);
    assertEquals(result2.entropy > 0.5, true);
});

Deno.test("BehavioralAnalyzer - Syscall Intent Modeling", () => {
    const analyzer = new BehavioralAnalyzer();
    const pid = 1234;

    // Sequence for SHELLCODE_INJECT: ["mmap", "mprotect", "ptrace"]
    analyzer.trackSyscall(pid, "exploit", "mmap");
    analyzer.trackSyscall(pid, "exploit", "mprotect");
    analyzer.trackSyscall(pid, "exploit", "ptrace");

    const verdict = analyzer.getIntentVerdict(pid);
    assertExists(verdict);
    assertEquals(verdict.intent, "SHELLCODE_INJECT");
    assertEquals(verdict.score, 1.0);
});

Deno.test("BehavioralAnalyzer - Bayesian Anomaly Scoring", () => {
    const analyzer = new BehavioralAnalyzer();
    const comm = "nginx";

    // Train with normal syscalls
    for (let i = 0; i < 100; i++) {
        analyzer.trackSyscall(1, comm, "read");
        analyzer.trackSyscall(1, comm, "write");
    }

    // Low score for frequent syscalls
    const scoreNormal = analyzer.getSyscallAnomalyScore(comm, "read");
    assertEquals(scoreNormal < 0.3, true);

    // High score for rare/unseen syscall
    const scoreRare = analyzer.getSyscallAnomalyScore(comm, "ptrace");
    assertEquals(scoreRare > 0.8, true);
});
