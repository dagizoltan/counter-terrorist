/**
 * The orchestrator's sidecar schemas must validate the parameters the agents actually
 * read, and must still accept every shape the real call sites send.
 *
 * `tunnel` and `trustroot` were the two schemas that checked nothing beyond their
 * command type, while their agents deserialized interface/config_path and
 * index/data/node_id respectively. Neither was exploitable — the tunnel agent spawns
 * `wg` with an argv rather than a shell, and trustroot is a virtual TPM keyed by JSON —
 * but the orchestrator is meant to be the first validator, not the agent's own
 * deny-list. These tests pin both halves: the real shapes keep working, and the
 * out-of-contract ones are refused.
 */
import { assertEquals } from "@std/assert";
import { validateRequest } from "@infrastructure/system/validation.ts";

type Req = Record<string, unknown>;

function accepts(agent: string, req: Req): boolean {
    return validateRequest(agent as never, req);
}

Deno.test("tunnel - the shapes the VPN providers send are accepted", () => {
    // ubuntu/macos/windows VpnProvider all send payload:{interface}.
    assertEquals(accepts("tunnel", { type: "CONNECT", payload: { interface: "wg0" }, id: "x" }), true);
    assertEquals(accepts("tunnel", { type: "DISCONNECT", payload: { interface: "wg0" }, id: "x" }), true);
    assertEquals(accepts("tunnel", { type: "GET_STATUS", id: "x" }), true);
    assertEquals(accepts("tunnel", { type: "GET_STATUS", payload: {}, id: "x" }), true);
});

Deno.test("tunnel - an out-of-contract interface or config path is refused", () => {
    assertEquals(accepts("tunnel", { type: "CONNECT", payload: { interface: "wg0; rm -rf /" }, id: "x" }), false);
    assertEquals(accepts("tunnel", { type: "CONNECT", payload: { interface: "wg 0" }, id: "x" }), false);
    // WireGuard caps interface names at 15 characters.
    assertEquals(accepts("tunnel", { type: "CONNECT", payload: { interface: "a".repeat(16) }, id: "x" }), false);
    assertEquals(
        accepts("tunnel", { type: "CONNECT", payload: { interface: "wg0", config_path: "/etc/shadow" }, id: "x" }),
        false,
        "a config path outside the sidecar jail must not pass",
    );
});

Deno.test("trustroot - every shape TPMManager sends is accepted", () => {
    const shapes: Req[] = [
        { type: "Seal", index: "0x1500001", data: "sealed", auth: "k", pcrs: { "0": "aa" } },
        { type: "Unseal", index: "0x1500002", auth: "k" },
        { type: "NvDefine", index: "0x1500003", size: 64, auth: "k" },
        { type: "NvWrite", index: "0x1500004", data: "d", auth: "k" },
        { type: "NvRead", index: "0x1500001", auth: "k" },
        { type: "GetPcrs", indices: [0, 1, 7] },
        { type: "Sign", data: "payload" },
        { type: "Verify", data: "payload", signature: "sig" },
        { type: "GenerateSelfSignedCA" },
        { type: "IssueNodeCert", node_id: "node-1" },
        { type: "GenerateProxyKey" },
        { type: "SignProxy", keyId: "k1", data: "payload" },
        { type: "QuoteIdentity" },
        { type: "WipeSecrets" },
    ];
    for (const shape of shapes) {
        assertEquals(accepts("trustroot", { ...shape, id: "x" }), true, `TPMManager sends ${shape.type}`);
    }
});

Deno.test("trustroot - an NV index that is not a hex handle is refused", () => {
    for (const index of ["../../etc/passwd", "not-hex", "", "0x", "0xZZZZ"]) {
        assertEquals(
            accepts("trustroot", { type: "NvRead", index, auth: "k", id: "x" }),
            false,
            `${JSON.stringify(index)} must not address the sealed-secret store`,
        );
    }
    assertEquals(accepts("trustroot", { type: "NvRead", index: "0x1500001", auth: "k", id: "x" }), true);
});

Deno.test("trustroot - oversized payloads are refused", () => {
    assertEquals(accepts("trustroot", { type: "NvWrite", index: "0x1500001", data: "x".repeat(70000), id: "x" }), false);
    assertEquals(accepts("trustroot", { type: "NvDefine", index: "0x1500001", size: 1 << 20, auth: "k", id: "x" }), false);
    assertEquals(accepts("trustroot", { type: "GetPcrs", indices: [99], id: "x" }), false);
});

Deno.test("every sidecar the orchestrator can address has a usable schema", async () => {
    // A name in ALLOWED_SIDECARS with no entry in REQUEST_SCHEMAS makes validateRequest
    // return false for every command, silently disabling that agent. Probe each with a
    // command from its own contract — there is no single command they all share.
    const { ALLOWED_SIDECARS } = await import("@infrastructure/system/validation.ts");
    const probe: Record<string, Req> = {
        analyzer: { type: "GetStatus" },
        enforcer: { type: "GetStatus" },
        decoy: { type: "GetStatus" },
        netcap: { type: "GetStatus" },
        watchfile: { type: "GetStatus" },
        trustroot: { type: "QuoteIdentity" },
        tunnel: { type: "GET_STATUS" },
        mesh: { type: "GET_STATUS" },
        firewall: { type: "GetStatus" },
        sentinel: { type: "GET_STATUS" },
        "sentinel-darwin": { type: "GetStatus" },
        "enforcer-win": { type: "GetStatus" },
        "telemetry-win": { type: "GetStatus" },
    };

    const missingProbe = ALLOWED_SIDECARS.filter((n) => !(n in probe));
    assertEquals(missingProbe, [], "a new sidecar was allow-listed without a probe here");

    const unschematized = ALLOWED_SIDECARS.filter((n) => !validateRequest(n, { ...probe[n], id: "x" }));
    assertEquals(unschematized, [], "these sidecars cannot be sent any command");
});
