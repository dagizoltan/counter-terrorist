import { LoggingPort } from "@core/ports.ts";
import { NetworkLogRepository, NetworkLogEntry } from "../repositories/network_log_repository.ts";
import { BaseService } from "@core/base_service.ts";
import { Result, ok } from "../../core/result.ts";

export class NetworkLogService extends BaseService {
  constructor(
    private repo: NetworkLogRepository,
    private logging: LoggingPort
  ) {
    super();
  }

  override async init(): Promise<Result<void>> {
    if (this.initialized) return ok(undefined);
    this.initialized = true;
    return ok(undefined);
  }

  override async shutdown(): Promise<Result<void>> {
    this.initialized = false;
    return await super.shutdown();
  }

  async log(entry: NetworkLogEntry) {
    await this.repo.save(entry);
  }

  async getRecent(limit: number = 100) {
    return await this.repo.getLatest(limit);
  }
}
