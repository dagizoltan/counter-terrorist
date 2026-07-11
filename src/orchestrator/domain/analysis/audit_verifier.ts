import { LoggingPort, LogSeverity, LogType, TpmPort } from "@core/ports.ts";
import { AuditRepository } from "../repositories/audit_repository.ts";
import { AuditEvent } from "./audit.ts";
import { computeHash } from "@core/crypto_utils.ts";
import { MerkleTree } from "@core/merkle.ts";

/**
 * AuditVerifier
 * Specialized component for ledger integrity verification and forensic proofs.
 */
export class AuditVerifier {
    constructor(
        private repo: AuditRepository,
        private logging: LoggingPort,
        private tpm?: TpmPort
    ) {}

    public setTpm(tpm: TpmPort) {
        this.tpm = tpm;
    }

    /**
     * Comprehensive forensic verification of the entire audit ledger.
     */
    public async verifyFullChain(): Promise<{
        valid: boolean;
        eventsChecked: number;
        brokenAt?: { eventId: string; expected: string; actual: string; type: string };
    }> {
        return await this.verifyChain(-1);
    }

    /**
     * Verifies the integrity of the audit chain up to a specified limit.
     */
    async verifyChain(limit: number = 1000): Promise<{
        valid: boolean;
        eventsChecked: number;
        brokenAt?: { eventId: string; expected: string; actual: string; type: string };
    }> {
        const stream = limit === -1 ? this.repo.getStream(Number.MAX_SAFE_INTEGER, true) : this.repo.getStream(limit, true);

        let eventsChecked = 0;
        let prevEvent: AuditEvent | null = null;

        for await (const event of stream) {
            eventsChecked++;

            if (event.type === "CHECKPOINT") {
                if (event.hwSignature && this.tpm) {
                    const isValidCheckpoint = await this.tpm.verify(event.hash, event.hwSignature);
                    if (!isValidCheckpoint) {
                        return {
                            valid: false,
                            eventsChecked,
                            brokenAt: { eventId: event.id, expected: "VALID_TPM_SIG", actual: "INVALID_SIG", type: "CHECKPOINT_TAMPER" },
                        };
                    }
                } else if (event.prevHash !== "TRUNCATED") {
                    return {
                        valid: false,
                        eventsChecked,
                        brokenAt: { eventId: event.id, expected: "TPM_SIGNATURE", actual: "UNSIGNED", type: "UNSIGNED_CHECKPOINT" },
                    };
                }
                prevEvent = event;
                continue;
            }

            const hashInput = {
                id: event.id, timestamp: event.timestamp, type: event.type, severity: event.severity,
                caller: event.caller, message: event.message,
                actor: event.actor, data: event.data,
                correlationId: event.correlationId, prevHash: event.prevHash,
            };
            const expectedHash = await computeHash(hashInput);

            if (event.hash !== expectedHash) {
                return {
                    valid: false,
                    eventsChecked,
                    brokenAt: { eventId: event.id, expected: expectedHash, actual: event.hash, type: "HASH_MISMATCH" },
                };
            }

            // AUDIT-FIX: Chain verification logic fix for reverse streams (newest to oldest)
            if (prevEvent && prevEvent.prevHash !== event.hash && prevEvent.prevHash !== "TRUNCATED") {
                return {
                    valid: false,
                    eventsChecked,
                    brokenAt: { eventId: prevEvent.id, expected: event.hash, actual: prevEvent.prevHash, type: "CHAIN_BREAK" },
                };
            }

            prevEvent = event;
        }

        return { valid: true, eventsChecked };
    }

    /**
     * Generates a Merkle proof for a specific event.
     */
    public async getMerkleProof(eventHash: string, recentEvents: AuditEvent[]): Promise<{ leaf: string, index: number, proof: string[], root: string } | null> {
        const hashes = recentEvents.map(e => e.hash).reverse();
        const index = hashes.indexOf(eventHash);

        if (index === -1) return null;

        const tree = new MerkleTree(hashes);
        const proof = await tree.getProof(index);
        const root = await tree.getRoot();

        return { leaf: eventHash, index, proof, root };
    }
}
