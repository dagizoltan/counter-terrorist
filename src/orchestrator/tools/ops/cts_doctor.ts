import { SystemExecutor } from "../../infrastructure/system/system_executor.ts";
import { getPlatformInfo } from "../../infrastructure/system/platform.ts";
import * as path from "@std/path";

async function runDoctor() {
    const executor = new SystemExecutor();
    const platform = await getPlatformInfo(executor);

    console.log("🛡️  Sovereign Pilot Diagnostic (cts-doctor)");
    console.log("==========================================");
    console.log(`OS: ${platform.name} ${platform.version} (${platform.tag})`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log("");

    const checks = [
        checkKernel,
        checkPermissions,
        checkTpm,
        checkDependencies,
        checkDeno
    ];

    let allPassed = true;
    for (const check of checks) {
        const passed = await check(executor);
        if (!passed) allPassed = false;
        console.log("");
    }

    if (allPassed) {
        console.log("✅ SYSTEM PILOT READY: No critical issues detected.");
    } else {
        console.log("❌ PILOT BLOCKED: Please resolve the issues highlighted above.");
        Deno.exit(1);
    }
}

async function checkKernel(executor: SystemExecutor): Promise<boolean> {
    console.log("🧠 Checking Kernel Capabilities...");

    if (Deno.build.os !== "linux") {
        console.log("   ⚠️  Non-Linux OS: eBPF/XDP/LSM features will be disabled or emulated.");
        return true;
    }

    const uname = await executor.execute("uname", ["-r"]);
    console.log(`   Kernel Version: ${uname.stdout.trim()}`);

    // Check for BTF
    const hasBtf = await Deno.stat("/sys/kernel/btf/vmlinux").then(() => true).catch(() => false);
    if (hasBtf) {
        console.log("   ✅ BTF (CO-RE) Support: Detected");
    } else {
        console.log("   ❌ BTF (CO-RE) Support: NOT DETECTED. Sentinel sidecar may fail to load.");
        return false;
    }

    // Check for XDP support on default interface
    try {
        const { getDefaultInterface } = await import("../../infrastructure/system/network.ts");
        const iface = await getDefaultInterface();
        console.log(`   Default Interface: ${iface}`);
        const ethtool = await executor.execute("ip", ["link", "show", iface]);
        if (ethtool.stdout.includes("xdp")) {
             console.log("   ✅ XDP Support: Hardware/Driver verified");
        } else {
             console.log("   ⚠️  XDP Support: Not explicitly advertised by driver, will use generic mode.");
        }
    } catch {
        console.log("   ⚠️  Network interface detection failed.");
    }

    return true;
}

async function checkPermissions(_executor: SystemExecutor): Promise<boolean> {
    console.log("📂 Checking File System & Permissions...");
    const paths = ["/var/lib/cts", "./volume/storage", "./bin/agents"];
    let passed = true;

    for (const p of paths) {
        try {
            const stat = await Deno.stat(p).catch(() => null);
            if (!stat) {
                console.log(`   ❌ Path Missing: ${p}`);
                passed = false;
                continue;
            }
            console.log(`   ✅ Path Found: ${p} (Mode: ${stat.mode?.toString(8)})`);
        } catch (e) {
            console.log(`   ❌ Access Denied: ${p} (${(e as Error).message})`);
            passed = false;
        }
    }
    return passed;
}

async function checkTpm(executor: SystemExecutor): Promise<boolean> {
    console.log("🔐 Checking TPM 2.0 State...");

    const hasTpm = await Deno.stat("/dev/tpm0").then(() => true).catch(() => false);
    if (!hasTpm) {
        console.log("   ⚠️  TPM Device (/dev/tpm0) NOT FOUND. Hardware integrity will be emulated.");
        return true; // Not critical for pilot if bypass is allowed
    }

    const tpmTest = await executor.execute("tpm2_pcrread", ["sha256:0"]);
    if (tpmTest.success) {
        console.log("   ✅ TPM 2.0: Operational");
    } else {
        console.log("   ⚠️  TPM 2.0: Found but 'tpm2-tools' not working correctly.");
    }
    return true;
}

async function checkDependencies(executor: SystemExecutor): Promise<boolean> {
    console.log("📦 Checking System Dependencies...");
    const deps = ["wg-quick", "cargo", "ss", "ufw"];
    let passed = true;

    for (const dep of deps) {
        const res = await executor.execute("which", [dep]);
        if (res.success) {
            console.log(`   ✅ ${dep}: ${res.stdout.trim()}`);
        } else {
            console.log(`   ❌ ${dep}: NOT FOUND`);
            if (dep === "wg-quick" || dep === "ss") passed = false;
        }
    }
    return passed;
}

async function checkDeno(_executor: SystemExecutor): Promise<boolean> {
    console.log("🦕 Checking Deno Environment...");
    console.log(`   Version: ${Deno.version.deno}`);

    const perms = await Deno.permissions.query({ name: "run" });
    if (perms.state === "granted") {
        console.log("   ✅ Permissions: Run granted");
    } else {
        console.log("   ❌ Permissions: Run DENIED. Sovereign requires --allow-run.");
        return false;
    }
    return true;
}

if (import.meta.main) {
    runDoctor();
}
