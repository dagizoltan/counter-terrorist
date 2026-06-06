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

  async log(entry: any) {
    if (entry.direction && entry.source && entry.destination) {
        await this.repo.save(entry as NetworkLogEntry);
    } else {
        await this.logging.log(entry);
    }
  }

  protected override async onInit(): Promise<Result<void>> {
    return ok(undefined);
  }

  protected override async onShutdown(): Promise<Result<void>> {
    return ok(undefined);
  }

  override async shutdown(): Promise<Result<void>> {
    return await super.shutdown();
  }

  async getRecent(limit: number = 100) {
    return await this.repo.getLatest(limit);
  }
}
