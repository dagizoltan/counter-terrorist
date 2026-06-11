export enum LogSeverity {
  INFO = "info",
  SUCCESS = "success",
  WARNING = "warning",
  ERROR = "error",
  DEBUG = "debug",
  CRITICAL = "critical"
}

export enum SyslogSeverity {
  EMERGENCY = 0,
  ALERT = 1,
  CRITICAL = 2,
  ERROR = 3,
  WARNING = 4,
  NOTICE = 5,
  INFORMATIONAL = 6,
  DEBUG = 7,
}

export enum LogType {
  DEBUG = "debug",
  AUDIT = "audit",
  ACTIVITY = "activity",
  GENERIC = "generic"
}

export interface LogEntry {
  timestamp: string;
  type: LogType;
  severity: LogSeverity;
  caller: string;
  message: string;
  payload?: unknown;
  formatted?: string; // High-fidelity forensic string [TYPE] [SEVERITY] [CALLER] MESSAGE
  fromAudit?: boolean;
}

export interface LoggingPort {
  enableGlobalIntercept(): void;
  log(entry: LogEntry): Promise<void>;
  getRecentLogs(limit?: number): Promise<LogEntry[]>;
  // Legacy support
  logLegacy(message: string, severity?: LogSeverity | SyslogSeverity, source?: string, payload?: unknown): Promise<void>;
  setKv(kv: Deno.Kv): void;
  shutdown(): Promise<void>;
}
