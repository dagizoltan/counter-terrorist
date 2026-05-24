import { LoggingPort, LogSeverity, LogType, LogEntry, SyslogSeverity } from "@core/ports.ts";
import { TimelineRepository } from "../persistence/repositories/timeline_repository.ts";
import { DiagnosticRepository } from "../persistence/diagnostic_repository.ts";
import { broadcast } from "@interface/ws_handler.ts";
import { SecretRedactor } from "@core/utils/security.ts";

export { LogSeverity, LogType, SyslogSeverity };

type SyslogTransport = "udp" | "tcp" | "tls";

export class LoggingService implements LoggingPort {
    private remoteHost: string | null = null;
    private remotePort: number = 514;
    private transport: SyslogTransport = "udp";
    private logBuffer: string[] = [];
    private maxBufferSize = 1000;
    private isForwarding = false;
    private tlsCaCertPath: string | null = null;
    private diagnosticRepo: DiagnosticRepository | null = null;
    private preInitBuffer: LogEntry[] = [];
    private redactor: SecretRedactor = new SecretRedactor();

    /** Persistent TCP/TLS or UDP connection, reused across flushes. */
    private persistentConn: Deno.Conn | Deno.TlsConn | Deno.DatagramConn | null = null;
    private flushIntervalId: number | null = null;

    constructor(kv?: Deno.Kv) {
        if (kv) {
            this.diagnosticRepo = new DiagnosticRepository(kv);
        }
    }

    public setConfig(config: { host?: string, port?: number, transport?: string, caPath?: string, secrets?: Record<string, string | undefined> }) {
        if (config.secrets) {
            this.redactor.updateSecrets(config.secrets);
        }
        this.remoteHost = config.host || null;
        this.remotePort = config.port || 514;
        this.transport = (config.transport as SyslogTransport) || "udp";
        this.tlsCaCertPath = config.caPath || null;

        if (this.remoteHost) {
            this.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.INFO,
                caller: "orchestrator:infra:system:logging",
                message: `Remote syslog enabled: ${this.transport}://${this.remoteHost}:${this.remotePort}`
            }).catch(() => {});
            this.startFlushInterval();
        }
    }

    setKv(kv: Deno.Kv) {
        this.diagnosticRepo = new DiagnosticRepository(kv);
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
        console.log = (...args: any[]) => {
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

        console.warn = (...args: any[]) => {
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

        console.error = (...args: any[]) => {
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

        // SOV-06 SECURITY: Redact sensitive secrets from all logs before they hit any sink
        entry.message = this.redactor.redact(entry.message);
        if (entry.payload) {
            entry.payload = this.redactor.redactObject(entry.payload);
        }

        // SOV-05 STABILITY: Re-entrancy guard to prevent stack overflow from recursive logging
        if (this.isLogging) {
            this.originalLog(`[LOG_RECURSION_DROPPED] ${entry.message}`);
            return;
        }
        this.isLogging = true;

        try {
            // Sanitize core fields
        entry.message = this.sanitize(entry.message);
        if (entry.caller) entry.caller = this.sanitize(entry.caller);
        
        if (this.ignoredSources.has(entry.caller)) return;
        for (const kw of this.ignoredKeywords) {
            if (entry.message.includes(kw)) return;
        }

        const hostname = Deno.hostname() || "unknown";
        const appName = "ct-orch";
        const procId = Deno.pid;

        // 3. Structured Sink: Deno KV (Diagnostic Buffer)
        await this.writeToKv(entry);

        const { timestamp, type, severity = LogSeverity.INFO, caller, message, payload } = entry;

        let formattedMsg = `[${(type || LogType.GENERIC).toUpperCase()}] [${(severity || LogSeverity.INFO).toLowerCase()}] [${caller || "UNKNOWN"}] ${message}`;
        entry.formatted = formattedMsg; // Attach to entry for downstream consumption (Audit, WS)

        if (payload) {
            try {
                formattedMsg += ` | PAYLOAD: ${JSON.stringify(payload)}`;
            } catch {
                formattedMsg += ` | PAYLOAD: [Complex Object]`;
            }
        }

        const severityMap: Record<LogSeverity, number> = {
            [LogSeverity.INFO]: 6,
            [LogSeverity.SUCCESS]: 5,
            [LogSeverity.WARNING]: 4,
            [LogSeverity.ERROR]: 3,
            [LogSeverity.DEBUG]: 7
        };

        const pri = (1 * 8) + (severityMap[severity] || 6);
        const syslogMsg = `<${pri}>1 ${timestamp} ${hostname} ${appName} ${procId} - - ${formattedMsg}`;

        if (this.remoteHost) {
            this.bufferLog(syslogMsg);
        } else {
            const colors: Record<LogSeverity, string> = {
                [LogSeverity.INFO]: "\x1b[36m",    
                [LogSeverity.SUCCESS]: "\x1b[32m", 
                [LogSeverity.WARNING]: "\x1b[33m", 
                [LogSeverity.ERROR]: "\x1b[31m",
                [LogSeverity.DEBUG]: "\x1b[90m"
            };
            const c = colors[severity] || "\x1b[0m";
            const reset = "\x1b[0m";
            
            // Console format: TIMESTAMP [TYPE] [SEVERITY] [CALLER] MESSAGE
            this.originalLog(`${timestamp} ${c}[${type.toUpperCase()}] [${severity.toLowerCase()}] [${caller}]${reset} ${message}`);
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
            await this.diagnosticRepo.addLog(entry).catch(() => {});
        } else {
            // Buffer logs until KV is available
            this.preInitBuffer.push(entry);
            if (this.preInitBuffer.length > 500) this.preInitBuffer.shift();
        }
    }

    private bufferLog(msg: string) {
        this.logBuffer.push(msg);
        if (this.logBuffer.length > this.maxBufferSize) this.logBuffer.shift();
    }

    private startFlushInterval() {
        this.flushIntervalId = setInterval(() => this.flushLogs(), 5000);
    }

    /**
     * Terminate background intervals and close connections.
     */
    async shutdown() {
        if (this.flushIntervalId) {
            clearInterval(this.flushIntervalId);
            this.flushIntervalId = null;
        }
        await this.flushLogs();
        this.closePersistentConn();

        // Restore original console if intercepted
        if (this.isIntercepting || this.isLogging) {
            console.log = this.originalLog;
            console.warn = this.originalWarn;
            console.error = this.originalError;
        }
    }

    private async flushLogs() {
        if (this.isForwarding || this.logBuffer.length === 0 || !this.remoteHost) return;
        this.isForwarding = true;
        const logsToSend = [...this.logBuffer];
        this.logBuffer = [];
        try {
            switch (this.transport) {
                case "udp": await this.sendUdp(logsToSend); break;
                case "tcp": await this.sendTcpOrTls(logsToSend, false); break;
                case "tls": await this.sendTcpOrTls(logsToSend, true); break;
            }
        } catch {
            this.logBuffer = [...logsToSend, ...this.logBuffer].slice(0, this.maxBufferSize);
            this.closePersistentConn();
        } finally {
            this.isForwarding = false;
        }
    }

    private async sendUdp(logs: string[]) {
        const conn = await this.getOrCreateUdpConnection();
        const encoder = new TextEncoder();
        for (const log of logs) {
            await conn.send(encoder.encode(log), { hostname: this.remoteHost!, port: this.remotePort, transport: "udp" });
        }
    }

    private getOrCreateUdpConnection(): Deno.DatagramConn {
        if (this.persistentConn && "send" in this.persistentConn) {
            return this.persistentConn;
        }
        this.closePersistentConn();
        this.persistentConn = Deno.listenDatagram({ port: 0, transport: "udp" });
        return this.persistentConn as Deno.DatagramConn;
    }

    private async sendTcpOrTls(logs: string[], useTls: boolean) {
        const conn = await this.getOrCreateConnection(useTls);
        const encoder = new TextEncoder();
        for (const log of logs) {
            const msgBytes = encoder.encode(log);
            const frame = encoder.encode(`${msgBytes.length} `);
            const combined = new Uint8Array(frame.length + msgBytes.length);
            combined.set(frame);
            combined.set(msgBytes, frame.length);
            await conn.write(combined);
        }
    }

    private async getOrCreateConnection(useTls: boolean): Promise<Deno.Conn | Deno.TlsConn> {
        if (this.persistentConn && "write" in this.persistentConn) {
            return this.persistentConn;
        }
        this.closePersistentConn();
        if (useTls) {
            const options: Deno.ConnectTlsOptions = { hostname: this.remoteHost!, port: this.remotePort };
            if (this.tlsCaCertPath) {
                try {
                    const caCert = await Deno.readTextFile(this.tlsCaCertPath);
                    options.caCerts = [caCert];
                } catch (err) {
                    this.originalError(`Failed to read CA cert for TLS logging: ${err}`);
                }
            }
            this.persistentConn = await Deno.connectTls(options);
        } else {
            this.persistentConn = await Deno.connect({ hostname: this.remoteHost!, port: this.remotePort });
        }
        return this.persistentConn as Deno.Conn | Deno.TlsConn;
    }

    private closePersistentConn() {
        if (this.persistentConn) {
            try { this.persistentConn.close(); } catch (err) {
                // Ignore error during close
                void err;
            }
            this.persistentConn = null;
        }
    }
}

export const loggingService = new LoggingService();
