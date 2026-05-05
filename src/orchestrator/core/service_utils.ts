import { LoggingPort, LogSeverity, LogType } from "./ports.ts";
import { Result, err, ok } from "./result.ts";

/**
 * Wraps a service method with automatic logging and error handling.
 */
export function withTelemetry<T extends any[], R>(
  name: string,
  fn: (...args: T) => Promise<R>,
  logging: LoggingPort
): (...args: T) => Promise<Result<R>> {
  return async (...args: T): Promise<Result<R>> => {
    const start = performance.now();
    try {
      const data = await fn(...args);
      const duration = (performance.now() - start).toFixed(2);
      logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.DEBUG,
          severity: LogSeverity.INFO,
          caller: `SERVICE:${name}`,
          message: `Success in ${duration}ms`
      });
      return ok(data);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.ERROR,
          caller: `SERVICE:${name}`,
          message: `FAILED: ${error.message}`
      });
      return err(error);
    }
  };
}
