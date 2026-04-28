import { LoggingPort } from "../core/ports.ts";
import { loggingService } from "../services/logging.ts";

export class LoggingAdapter implements LoggingPort {
  enableGlobalIntercept(): void {
    loggingService.enableGlobalIntercept();
  }

  async log(message: string, severity?: number): Promise<void> {
    await loggingService.log(message, severity);
  }
}

export const loggingAdapter = new LoggingAdapter();
