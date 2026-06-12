import { LoggingPort, LogSeverity, LogType, LogEntry, SyslogSeverity } from "@core/ports/logging.ts";
import { DiagnosticRepository } from "../persistence/diagnostic_repository.ts";
import { broadcast } from "@interface/ws_handler.ts";
import { SecretRedactor } from "@core/utils/security.ts";
import { PersistentQueue } from "@core/utils/persistent_queue.ts";
import { LogProcessor } from "./logging/LogProcessor.ts";
import { SyslogTransport } from "./logging/SyslogTransport.ts";

export { LogSeverity, LogType, SyslogSeverity };

export class LoggingService implements LoggingPort {
    private transport: SyslogTransport | null = null;
    private processor: LogProcessor;
    private logBuffer: string[] = [];
    private maxBufferSize = 1000;
    private isForwarding = false;
    private diagnosticRepo: DiagnosticRepository | null = null;
    private alertQueue: PersistentQueue<string> | null = null;
    private preInitBuffer: LogEntry[] = [];
    private redactor: SecretRedactor = new SecretRedactor();
    private flushIntervalId: number | null = null;

    constructor(kv?: Deno.Kv) {
        this.processor = new LogProcessor(this.redactor);
        if (kv) {
            this.diagnosticRepo = new DiagnosticRepository(kv);
        }
    }

    public setConfig(config: { host?: string, port?: number, transport?: string, caPath?: string, secrets?: Record<string, string | undefined> }) {
        if (config.secrets) {
            this.redactor.updateSecrets(config.secrets);
        }

        if (config.host) {
            this.transport = new SyslogTransport(config.host, config.port || 514, (config.transport as "udp" | "tcp" | "tls") || "udp", config.caPath || null);
            this.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.INFO,
                caller: "orchestrator:infra:system:logging",
                message: `Remote syslog enabled: ${config.transport}://${config.host}:${config.port || 514}`
            }).catch(() => {});
            this.startFlushInterval();
        }
    }

    setKv(kv: Deno.Kv) {
        this.diagnosticRepo = new DiagnosticRepository(kv);
        this.alertQueue = new PersistentQueue<string>(kv, "syslog_alerts");

        // Flush pre-init buffer to KV
        if (this.preInitBuffer.length > 0) {
            const logs = [...this.preInitBuffer];
            this.preInitBuffer = [];
            for (const entry of logs) {
                this.diagnosticRepo.addLog(entry).catch(() => {});
            }
        }
    }

    async getRecentLogs(limit: number = 100) {
        if (!this.diagnosticRepo) return [];
        return await this.diagnosticRepo.getRecent(limit);
    }

    private isIntercepting = false;
    private isLogging = false; // Re-entrancy guard
    private originalLog = console.log;
    private originalWarn = console.warn;
    private originalError = console.error;

    enableGlobalIntercept() {
        console.log = (...args: unknown[]) => {
            this.originalLog(...args);
            if (this.isIntercepting) return;
            this.isIntercepting = true;
            this.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.INFO,
                caller: "orchestrator:infra:system:logging:intercept",
                message: args.map(String).join(" ")
            }).finally(() => this.isIntercepting = false);
        };

        console.warn = (...args: unknown[]) => {
            this.originalWarn(...args);
            if (this.isIntercepting) return;
            this.isIntercepting = true;
            this.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:infra:system:logging:intercept",
                message: args.map(String).join(" ")
            }).finally(() => this.isIntercepting = false);
        };

        console.error = (...args: unknown[]) => {
            this.originalError(...args);
            if (this.isIntercepting) return;
            this.isIntercepting = true;
            this.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:infra:system:logging:intercept",
                message: args.map(String).join(" ")
            }).finally(() => this.isIntercepting = false);
        };
    }

    private ignoredSources = new Set(["WEB:UI", "HEARTBEAT"]);
    private ignoredKeywords = ["GET /api/ws/events", "GET /api/metrics"];

    /**
     * Sanitizes a string by removing ANSI escape codes and normalizing line breaks.
     * Prevents log injection and terminal manipulation while preserving UTF-8 support.
     */
    private sanitize(str: string): string {
        if (typeof str !== "string") return String(str);
        // 1. Remove ANSI escape sequences
        const noAnsi = str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
        // 2. Normalize line breaks and remove control characters (except tab)
        // Preserves printable ASCII and all non-ASCII (UTF-8) characters
        return noAnsi.replace(/[\r\n]+/g, " ").replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "").trim();
    }

    async log(entry: LogEntry) {
        if (!entry || typeof entry !== "object") return;
        if (!entry.message) return;

        if (this.isLogging) {
            this.originalLog(`[LOG_RECURSION_DROPPED] ${entry.message}`);
            return;
        }
        this.isLogging = true;

        try {
            const { formattedMsg, syslogMsg } = this.processor.process(entry);
            const { type, severity = LogSeverity.INFO, caller, message } = entry;

            if (this.ignoredSources.has(caller)) return;
            for (const kw of this.ignoredKeywords) {
                if (message.includes(kw)) return;
            }

            await this.writeToKv(entry);

            if (this.transport) {
                this.bufferLog(syslogMsg);
            } else {
                const colors: Record<LogSeverity, string> = {
                    [LogSeverity.INFO]: "\x1b[36m",
                    [LogSeverity.SUCCESS]: "\x1b[32m",
                    [LogSeverity.WARNING]: "\x1b[33m",
                    [LogSeverity.ERROR]: "\x1b[31m",
                    [LogSeverity.DEBUG]: "\x1b[90m",
                    [LogSeverity.CRITICAL]: "\x1b[41m\x1b[37m"
                };
                const c = colors[severity] || "\x1b[0m";
                const reset = "\x1b[0m";

                // Console format: TIMESTAMP [TYPE] [SEVERITY] [CALLER] MESSAGE
                this.originalLog(`${entry.timestamp} ${c}[${type.toUpperCase()}] [${severity.toLowerCase()}] [${caller}]${reset} ${message}`);
            }

            // 4. Real-time Broadcast: Sink to connected UI consoles
            broadcast({
                type: "AUDIT_EVENT",
                data: entry
            });
        } finally {
            this.isLogging = false;
        }
    }

    logLegacy(message: string, severity: LogSeverity | SyslogSeverity = LogSeverity.INFO, source: string = "SYSTEM", payload?: unknown) {
        let mappedSeverity = LogSeverity.INFO;
        
        if (typeof severity === "number") {
            const map: Record<number, LogSeverity> = {
                [SyslogSeverity.EMERGENCY]: LogSeverity.ERROR,
                [SyslogSeverity.ALERT]: LogSeverity.ERROR,
                [SyslogSeverity.CRITICAL]: LogSeverity.ERROR,
                [SyslogSeverity.ERROR]: LogSeverity.ERROR,
                [SyslogSeverity.WARNING]: LogSeverity.WARNING,
                [SyslogSeverity.NOTICE]: LogSeverity.SUCCESS,
                [SyslogSeverity.INFORMATIONAL]: LogSeverity.INFO,
                [SyslogSeverity.DEBUG]: LogSeverity.INFO
            };
            mappedSeverity = map[severity] || LogSeverity.INFO;
        } else {
            mappedSeverity = severity;
        }

        return this.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: mappedSeverity,
            caller: source,
            message,
            payload
        });
    }

    private async writeToKv(entry: LogEntry) {
        if (this.diagnosticRepo) {
            // SOV-06 PERFORMANCE: Implement batching for log writes to KV
            this.kvBuffer.push(entry);
            if (this.kvBuffer.length >= 50) {
                await this.flushKvBuffer();
            }
        } else {
            // Buffer logs until KV is available
            this.preInitBuffer.push(entry);
            if (this.preInitBuffer.length > 500) this.preInitBuffer.shift();
        }
    }

    private kvBuffer: LogEntry[] = [];
    private isFlushingKv = false;

    private async flushKvBuffer() {
        if (!this.diagnosticRepo || this.kvBuffer.length === 0 || this.isFlushingKv) return;
        this.isFlushingKv = true;
        const toFlush = [...this.kvBuffer];
        this.kvBuffer = [];
        try {
            await this.diagnosticRepo.saveMany(toFlush);
        } catch {
            this.kvBuffer = [...toFlush, ...this.kvBuffer].slice(0, 1000);
        } finally {
            this.isFlushingKv = false;
        }
    }

    private bufferLog(msg: string) {
        this.logBuffer.push(msg);
        if (this.logBuffer.length > this.maxBufferSize) this.logBuffer.shift();
    }

    private startFlushInterval() {
        this.flushIntervalId = setInterval(() => {
            this.flushLogs();
            this.flushKvBuffer().catch(() => {});
        }, 5000);
    }

    async shutdown() {
        if (this.flushIntervalId) {
            clearInterval(this.flushIntervalId);
            this.flushIntervalId = null;
        }
        await this.flushLogs();
        await this.flushKvBuffer();
        if (this.transport) this.transport.close();

        if (this.isIntercepting || this.isLogging) {
            console.log = this.originalLog;
            console.warn = this.originalWarn;
            console.error = this.originalError;
        }
    }

    private async flushLogs() {
        if (this.isForwarding || !this.transport) return;

        if (this.alertQueue) {
            await this.alertQueue.process(async (msg) => {
                try {
                    await this.transport!.send([msg]);
                    return true;
                } catch {
                    return false;
                }
            });
        }

        if (this.logBuffer.length === 0) return;
        this.isForwarding = true;
        const logsToSend = [...this.logBuffer];
        this.logBuffer = [];
        try {
            for (const log of logsToSend) {
                try {
                    await this.transport.send([log]);
                } catch (e) {
                    if (this.alertQueue) {
                        await this.alertQueue.enqueue(log);
                    } else {
                        this.logBuffer.push(log);
                    }
                }
            }
        } finally {
            this.isForwarding = false;
        }
    }
}

export const loggingService = new LoggingService();
