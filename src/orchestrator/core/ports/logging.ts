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

/**
 * One packet-level record in the perimeter traffic ledger.
 *
 * Declared alongside LogEntry because the two travel the same port: a logger
 * that fronts a network-log repository accepts both, and the caller has to be
 * able to say which one it means.
 */
export interface NetworkLogEntry {
  direction: "INBOUND" | "OUTBOUND";
  source: string;
  destination: string;
  protocol: string;
  /** Bytes observed; 0 when the record is an enforcement action, not a packet. */
  length: number;
  action: "ALLOW" | "BLOCK" | "SHADOW";
  timestamp?: string;
  metadata?: unknown;
}

export interface LoggingPort {
  enableGlobalIntercept(): void;
  log(entry: LogEntry): Promise<void>;
  /**
   * Record traffic in the perimeter ledger.
   *
   * This exists because log() used to route by sniffing the entry's shape —
   * `"direction" in entry && entry.source && entry.destination`. Both real
   * callers (blockIp and shadowBanIp) nested those fields under `payload`, so
   * the test was false every time and every enforcement action was silently
   * diverted to the generic log. The traffic panel showed one hardcoded row
   * from seedForensics() and nothing else, for the life of the product.
   *
   * Optional: a plain logger has no ledger behind it, and a caller that only
   * has a LoggingPort should degrade rather than fail.
   */
  logNetwork?(entry: NetworkLogEntry): Promise<void>;
  getRecentLogs(limit?: number): Promise<LogEntry[]>;
  // Legacy support
  logLegacy(message: string, severity?: LogSeverity | SyslogSeverity, source?: string, payload?: unknown): Promise<void>;
  setKv(kv: Deno.Kv): void;
  shutdown(): Promise<void>;
}
