import { assertEquals } from "@std/assert";
import { BehavioralAnalyzer } from "@domain/analysis/behavioral_analyzer.ts";

Deno.test("BehavioralAnalyzer - Bayesian Anomaly Scoring and Intent Verdict", async () => {
    const analyzer = new BehavioralAnalyzer();

    // 1. Establish baseline in learning mode
    analyzer.setLearningMode(true);
    for (let i = 0; i < 100; i++) {
        analyzer.trackSyscall(1001, "deno", "read");
        analyzer.trackSyscall(1001, "deno", "write");
    }
    analyzer.setLearningMode(false);

    // 2. Test Anomaly Scoring
    const normalScore = analyzer.getSyscallAnomalyScore("deno", "read");
    const rareScore = analyzer.getSyscallAnomalyScore("deno", "ptrace");

    assertEquals(normalScore < 0.2, true, "Common syscall should have low anomaly score");
    assertEquals(rareScore > 0.8, true, "Rare syscall should have high anomaly score");

    // 3. Test Intent Verdict (Sequence matching)
    analyzer.trackSyscall(2002, "malware", "mmap");
    analyzer.trackSyscall(2002, "malware", "mprotect");
    analyzer.trackSyscall(2002, "malware", "ptrace");

    const verdict = analyzer.getIntentVerdict(2002);
    assertEquals(verdict?.intent, "SHELLCODE_INJECT", "Malicious sequence should trigger SHELLCODE_INJECT intent");
});
