import { LoggingPort, SyslogSeverity } from "./ports.ts";
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
      logging.log(`[SERVICE:${name}] Success in ${duration}ms`, SyslogSeverity.DEBUG);
      return ok(data);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      logging.log(`[SERVICE:${name}] FAILED: ${error.message}`, SyslogSeverity.ERROR);
      return err(error);
    }
  };
}
