import { LoggingPort } from "../core/ports.ts";
import { LoggingService } from "../infrastructure/logging.ts";

export class LoggingAdapter implements LoggingPort {
  constructor(private service: LoggingService) {}
  enableGlobalIntercept(): void {
    this.service.enableGlobalIntercept();
  }

  async log(message: string, severity?: number): Promise<void> {
    await this.service.log(message, severity);
  }
}

