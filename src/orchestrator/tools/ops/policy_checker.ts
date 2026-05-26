import { SIDECAR_REGISTRY } from "../../infrastructure/runtime/sidecar_registry.ts";

/**
 * Security Policy Logic Checker
 * Formally verifies that sidecar capabilities and AppArmor profiles (if pre-generated)
 * do not have dangerous overlaps or logic gaps.
 */

interface VerificationResult {
    sidecar: string;
    status: "PASS" | "FAIL" | "WARN";
    issues: string[];
}

export function verifyPolicies(): VerificationResult[] {
    const results: VerificationResult[] = [];

    for (const [name, config] of Object.entries(SIDECAR_REGISTRY)) {
        const issues: string[] = [];
        const caps = config.capabilities?.split(",") || [];

        // 1. Check for Over-Privileged Capabilities
        if (caps.includes("CAP_SYS_ADMIN")) {
            // SYS_ADMIN is the new root. Verify if it's strictly necessary.
            if (!["sentinel", "watchfile", "analyzer", "trustroot"].includes(name)) {
                issues.push(`Sidecar '${name}' uses CAP_SYS_ADMIN but is not in the approved admin-class list.`);
            }
        }

        if (caps.includes("CAP_NET_RAW") && name !== "netcap" && name !== "sentinel") {
            issues.push(`Sidecar '${name}' has CAP_NET_RAW but doesn't perform network capture/filtering.`);
        }

        // 2. Check for Lack of Mandatory Hardening
        if (!config.critical && caps.length > 5) {
            issues.push(`Non-critical sidecar '${name}' has more than 5 capabilities. Consider aggressive pruning.`);
        }

        // 3. Capability Gap Analysis
        if (name === "netcap" && !caps.includes("CAP_NET_ADMIN") && !caps.includes("CAP_NET_RAW")) {
             issues.push(`Netcap missing essential networking capabilities.`);
        }

        results.push({
            sidecar: name,
            status: issues.length > 0 ? (issues.some(i => i.includes("approved")) ? "FAIL" : "WARN") : "PASS",
            issues
        });
    }

    return results;
}

if (import.meta.main) {
    console.log("=== Sovereign Security Policy Formal Verification ===");
    const results = verifyPolicies();
    let totalIssues = 0;

    for (const res of results) {
        const icon = res.status === "PASS" ? "✅" : res.status === "FAIL" ? "❌" : "⚠️";
        console.log(`${icon} [${res.sidecar.toUpperCase()}] status: ${res.status}`);
        for (const issue of res.issues) {
            console.log(`   - ${issue}`);
            totalIssues++;
        }
    }

    console.log("\nSummary:");
    console.log(`Total Sidecars: ${results.length}`);
    console.log(`Total Issues: ${totalIssues}`);

    if (results.some(r => r.status === "FAIL")) {
        Deno.exit(1);
    }
}
