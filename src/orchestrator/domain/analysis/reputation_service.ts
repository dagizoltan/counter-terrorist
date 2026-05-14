import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";

/**
 * ReputationService: Persistent Behavioral Scoring for Security Subjects.
 *
 * Tracks historical threat activity for IPs and PIDs across system reboots
 * using Deno KV as a persistent state store.
 */
export class ReputationService {
    private readonly REPUTATION_PREFIX = ["behavioral", "reputation"];

    constructor(private kv: Deno.Kv, private logging: LoggingPort) {}

    /**
     * Retrieves the current risk score for a subject.
     */
    async getScore(subject: string): Promise<number> {
        const entry = await this.kv.get<number>([...this.REPUTATION_PREFIX, subject]);
        return entry.value || 0;
    }

    /**
     * Increments the risk score for a subject based on a threat event.
     */
    async incrementRisk(subject: string, increment: number) {
        const current = await this.getScore(subject);
        const newScore = current + increment;
        await this.kv.set([...this.REPUTATION_PREFIX, subject], newScore);

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: newScore > 50 ? LogSeverity.WARNING : LogSeverity.INFO,
            caller: "analysis:reputation",
            message: `Risk profile updated for ${subject}: ${newScore} points.`
        });
    }

    /**
     * Decays risk scores globally to allow recovery over time.
     */
    async decayReputations() {
        const iter = this.kv.list<number>({ prefix: this.REPUTATION_PREFIX });
        for await (const entry of iter) {
            const current = entry.value;
            if (current <= 0) continue;

            const subject = entry.key[entry.key.length - 1] as string;
            const newScore = Math.max(0, current - 1);
            await this.kv.set(entry.key, newScore);
        }
    }
}
