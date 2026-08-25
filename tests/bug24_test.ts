import { assertEquals } from "@std/assert";
import { BehavioralAnalyzer } from "../src/orchestrator/domain/analysis/behavioral_analyzer.ts";

Deno.test("BehavioralAnalyzer - BUG-24: Ordered Sequence Matching", async () => {
    const analyzer = new BehavioralAnalyzer();
    try {
    const pid = 1234;

    // Pattern: ["mmap", "mprotect", "ptrace"]

    // Test 1: Correct order
    analyzer.trackSyscall(pid, "test", "mmap");
    analyzer.trackSyscall(pid, "test", "mprotect");
    analyzer.trackSyscall(pid, "test", "ptrace");

    let verdict = analyzer.getIntentVerdict(pid);
    assertEquals(verdict?.intent, "SHELLCODE_INJECT", "Should match correct order");

    // Test 2: Incorrect order (but all present)
    const pid2 = 5678;
    analyzer.trackSyscall(pid2, "test", "ptrace");
    analyzer.trackSyscall(pid2, "test", "mprotect");
    analyzer.trackSyscall(pid2, "test", "mmap");

    verdict = analyzer.getIntentVerdict(pid2);
    assertEquals(verdict, null, "Should NOT match incorrect order");

    // Test 3: Correct order with noise
    const pid3 = 9999;
    analyzer.trackSyscall(pid3, "test", "mmap");
    analyzer.trackSyscall(pid3, "test", "read"); // noise
    analyzer.trackSyscall(pid3, "test", "mprotect");
    analyzer.trackSyscall(pid3, "test", "write"); // noise
    analyzer.trackSyscall(pid3, "test", "ptrace");

    verdict = analyzer.getIntentVerdict(pid3);
    assertEquals(verdict?.intent, "SHELLCODE_INJECT", "Should match correct order with noise");
    } finally {
        await analyzer.shutdown();
    }
});
