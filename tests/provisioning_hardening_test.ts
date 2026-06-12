import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { ProvisioningService } from "../src/orchestrator/domain/orchestration/provisioning_service.ts";

Deno.test("Provisioning Hardening - JIT token registration and SSH options", async () => {
    let registeredToken: { id: string, token: string } | null = null;
    const mockMesh = {
        registerProvisioningToken: (id: string, token: string) => {
            registeredToken = { id, token };
        }
    };

    const sshCalls: string[][] = [];
    const mockExecutor = {
        execute: async (cmd: string, args: string[]) => {
            sshCalls.push([cmd, ...args]);
            return { success: true, stdout: "", stderr: "" };
        }
    };

    const mockLogging = { log: () => Promise.resolve() };

    // Test Production Mode
    const mockConfigProd = {
        getEnv: (k: string) => {
            if (k === "ENVIRONMENT") return "production";
            if (k === "MESH_SECRET") return "secret";
            if (k === "PROVISIONING_USER") return "cts-deploy";
            return undefined;
        },
        getToken: () => "api-token",
        getBoolean: () => false
    };

    const serviceProd = new ProvisioningService({ findBinary: () => Promise.resolve("/bin/cts") } as any, mockMesh as any, mockExecutor as any, mockLogging as any, mockConfigProd as any);

    // Stub makeTempFile and chmod
    const tempStub = stub(Deno, "makeTempFile", () => Promise.resolve("/tmp/mock-env"));
    const chmodStub = stub(Deno, "chmod", () => Promise.resolve());
    const writeStub = stub(Deno, "writeTextFile", () => Promise.resolve());
    const removeStub = stub(Deno, "remove", () => Promise.resolve());

    // Manually add a target
    (serviceProd as any).targets.set("1.2.3.4", { address: "1.2.3.4", os: "linux", status: "DISCOVERED" });

    await serviceProd.provisionTarget("1.2.3.4");
    console.log("SSH Calls:", JSON.stringify(sshCalls, null, 2));

    tempStub.restore();
    chmodStub.restore();
    writeStub.restore();
    removeStub.restore();

    assert(registeredToken !== null, "Should have registered a JIT token");
    assertEquals(registeredToken?.id, "1.2.3.4");

    const prodSshCall = sshCalls.find(c => c[0] === "scp" && c.some(arg => arg.includes("1.2.3.4:/tmp/cts.env")));
    assert(prodSshCall !== undefined, "Should have called scp for env file");
    assert(prodSshCall.includes("StrictHostKeyChecking=yes"), "Production should use StrictHostKeyChecking=yes");

    // Test Dev Mode
    sshCalls.length = 0;
    const mockConfigDev = {
        getEnv: (k: string) => {
            if (k === "ENVIRONMENT") return "development";
            if (k === "MESH_SECRET") return "secret";
            return undefined;
        },
        getToken: () => "api-token",
        getBoolean: () => false
    };

    const serviceDev = new ProvisioningService({ findBinary: () => Promise.resolve("/bin/cts") } as any, mockMesh as any, mockExecutor as any, mockLogging as any, mockConfigDev as any);

    const tempStub2 = stub(Deno, "makeTempFile", () => Promise.resolve("/tmp/mock-env"));
    const chmodStub2 = stub(Deno, "chmod", () => Promise.resolve());
    const writeStub2 = stub(Deno, "writeTextFile", () => Promise.resolve());
    const removeStub2 = stub(Deno, "remove", () => Promise.resolve());

    (serviceDev as any).targets.set("5.6.7.8", { address: "5.6.7.8", os: "linux", status: "DISCOVERED" });

    await serviceDev.provisionTarget("5.6.7.8");

    tempStub2.restore();
    chmodStub2.restore();
    writeStub2.restore();
    removeStub2.restore();

    const devSshCall = sshCalls.find(c => c[0] === "scp" && c.some(arg => arg.includes("5.6.7.8:/tmp/cts.env")));
    assert(devSshCall !== undefined && devSshCall.includes("StrictHostKeyChecking=accept-new"), "Development should use StrictHostKeyChecking=accept-new");
});
