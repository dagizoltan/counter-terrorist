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

  protected override async onInit(): Promise<Result<void>> {
    return ok(undefined);
  }

  protected override async onShutdown(): Promise<Result<void>> {
    return ok(undefined);
  }

  async log(entry: NetworkLogEntry) {
    await this.repo.save(entry);
  }

  async getRecent(limit: number = 100) {
    return await this.repo.getLatest(limit);
  }
}
