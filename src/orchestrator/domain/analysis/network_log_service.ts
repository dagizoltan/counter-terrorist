import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { NetworkLogRepository, NetworkLogEntry } from "../repositories/network_log_repository.ts";
import { BaseService } from "@core/base_service.ts";
import { Result, ok } from "../../core/result.ts";

export class NetworkLogService extends BaseService implements LoggingPort {
  constructor(
    private repo: NetworkLogRepository,
    private logging: LoggingPort
  ) {
    super();
  }

  enableGlobalIntercept(): void {
    this.logging.enableGlobalIntercept();
  }

  getRecentLogs(limit?: number): Promise<import("../../core/ports/logging.ts").LogEntry[]> {
    return this.logging.getRecentLogs(limit);
  }

  logLegacy(message: string, severity?: LogSeverity | import("../../core/ports/logging.ts").SyslogSeverity, source?: string, payload?: unknown): Promise<void> {
    return this.logging.logLegacy(message, severity, source, payload);
  }

  setKv(kv: Deno.Kv): void {
    this.logging.setKv(kv);
  }

  /**
   * Record traffic in the perimeter ledger.
   *
   * Callers say what they mean here. log() used to decide by sniffing the
   * entry — `"direction" in entry && entry.source && entry.destination` — and
   * both firewall writers nested those fields under `payload`, so the test was
   * false every time and every block and shadow-ban was quietly filed as a
   * generic log line instead. The traffic panel showed a single seeded row.
   */
  async logNetwork(entry: NetworkLogEntry) {
    await this.repo.save(entry);
  }

  /**
   * Diagnostic logging, plus the legacy flat-shaped network entry.
   *
   * The shape check stays for callers that still hand a bare NetworkLogEntry
   * to log(); new callers should use logNetwork().
   */
  async log(entry: import("@core/ports/logging.ts").LogEntry | NetworkLogEntry) {
    if ("direction" in entry && entry.source && entry.destination) {
        await this.repo.save(entry as NetworkLogEntry);
    } else {
        await this.logging.log(entry as import("@core/ports/logging.ts").LogEntry);
    }
  }

  protected override async onInit(): Promise<Result<void>> {
    return ok(undefined);
  }

  protected override async onShutdown(): Promise<Result<void>> {
    return ok(undefined);
  }

  override async shutdown(): Promise<any> {
    await super.shutdown();
    return ok(undefined);
  }

  async getRecent(limit: number = 100) {
    return await this.repo.getLatest(limit);
  }
}
