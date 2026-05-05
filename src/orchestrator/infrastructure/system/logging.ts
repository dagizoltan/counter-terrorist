import { LoggingPort, LogSeverity, LogType, LogEntry, SyslogSeverity } from "@core/ports.ts";

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
    private logFilePath = "./volume/logs/orchestrator.log";

    /** Persistent TCP/TLS connection, reused across flushes. */
    private persistentConn: Deno.Conn | Deno.TlsConn | null = null;

    constructor() {
        this.remoteHost = Deno.env.get("SYSLOG_HOST") || null;
        this.remotePort = Number(Deno.env.get("SYSLOG_PORT")) || 514;
        this.transport = (Deno.env.get("SYSLOG_TRANSPORT") as SyslogTransport) || "udp";
        this.tlsCaCertPath = Deno.env.get("SYSLOG_CA_PATH") || null;

        if (this.remoteHost) {
            this.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.INFO,
                caller: "LOGGING",
                message: `Remote syslog enabled: ${this.transport}://${this.remoteHost}:${this.remotePort}`
            }).catch(() => {});
            this.startFlushInterval();
        }
    }

    private isIntercepting = false;
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
                caller: "CONSOLE",
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
                caller: "CONSOLE",
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
                caller: "CONSOLE",
                message: args.map(String).join(" ")
            }).finally(() => this.isIntercepting = false);
        };
    }

    private ignoredSources = new Set(["WEB:UI", "HEARTBEAT"]);
    private ignoredKeywords = ["GET /api/ws/events", "GET /api/metrics"];

    async log(entry: LogEntry) {
        if (!entry || typeof entry !== "object") return;
        if (!entry.message) return;
        
        if (this.ignoredSources.has(entry.caller)) return;
        for (const kw of this.ignoredKeywords) {
            if (entry.message.includes(kw)) return;
        }

        const hostname = Deno.hostname() || "unknown";
        const appName = "ct-orch";
        const procId = Deno.pid;

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
            [LogSeverity.ERROR]: 3
        };

        const pri = (1 * 8) + (severityMap[severity] || 6);
        const syslogMsg = `<${pri}>1 ${timestamp} ${hostname} ${appName} ${procId} - - ${formattedMsg}`;

        this.writeToLocalFile(syslogMsg).catch(() => {});

        if (this.remoteHost) {
            this.bufferLog(syslogMsg);
        } else {
            const colors: Record<LogSeverity, string> = {
                [LogSeverity.INFO]: "\x1b[36m",    
                [LogSeverity.SUCCESS]: "\x1b[32m", 
                [LogSeverity.WARNING]: "\x1b[33m", 
                [LogSeverity.ERROR]: "\x1b[31m"
            };
            const c = colors[severity] || "\x1b[0m";
            const reset = "\x1b[0m";
            
            // Console format: TIMESTAMP [TYPE] [SEVERITY] [CALLER] MESSAGE
            this.originalLog(`${timestamp} ${c}[${type.toUpperCase()}] [${severity.toLowerCase()}] [${caller}]${reset} ${message}`);
        }
    }

    async logLegacy(message: string, severity: LogSeverity | SyslogSeverity = LogSeverity.INFO, source: string = "SYSTEM", payload?: any) {
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

    private async writeToLocalFile(msg: string) {
        try {
            await Deno.mkdir("./volume/logs", { recursive: true });
            await Deno.writeTextFile(this.logFilePath, msg + "\n", { append: true });
        } catch {}
    }

    private bufferLog(msg: string) {
        this.logBuffer.push(msg);
        if (this.logBuffer.length > this.maxBufferSize) this.logBuffer.shift();
    }

    private startFlushInterval() {
        setInterval(() => this.flushLogs(), 5000);
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
        const conn = await Deno.listenDatagram({ port: 0, transport: "udp" });
        const encoder = new TextEncoder();
        for (const log of logs) {
            await conn.send(encoder.encode(log), { hostname: this.remoteHost!, port: this.remotePort, transport: "udp" });
        }
        conn.close();
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
        if (this.persistentConn) return this.persistentConn;
        if (useTls) {
            const options: Deno.ConnectTlsOptions = { hostname: this.remoteHost!, port: this.remotePort };
            if (this.tlsCaCertPath) {
                try {
                    const caCert = await Deno.readTextFile(this.tlsCaCertPath);
                    options.caCerts = [caCert];
                } catch {}
            }
            this.persistentConn = await Deno.connectTls(options);
        } else {
            this.persistentConn = await Deno.connect({ hostname: this.remoteHost!, port: this.remotePort });
        }
        return this.persistentConn;
    }

    private closePersistentConn() {
        if (this.persistentConn) {
            try { this.persistentConn.close(); } catch {}
            this.persistentConn = null;
        }
    }
}

export const loggingService = new LoggingService();
