import { LoggingPort } from "@core/ports.ts";
import { NetworkLogRepository, NetworkLogEntry } from "../repositories/network_log_repository.ts";

export class NetworkLogService {
  constructor(
    private repo: NetworkLogRepository,
    private logging: LoggingPort
  ) {}

  async log(entry: NetworkLogEntry) {
    await this.repo.save(entry);
  }

  async getRecent(limit: number = 100) {
    return await this.repo.getLatest(limit);
  }
}
