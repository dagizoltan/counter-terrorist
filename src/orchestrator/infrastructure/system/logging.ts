import { LoggingPort, SyslogSeverity } from "@core/ports.ts";

export { SyslogSeverity };

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

        // Validate transport
        if (!["udp", "tcp", "tls"].includes(this.transport)) {
            console.warn(`[LOGGING] Invalid SYSLOG_TRANSPORT '${this.transport}', falling back to 'udp'`);
            this.transport = "udp";
        }

        if (this.remoteHost) {
            console.log(`[LOGGING] Remote syslog enabled: ${this.transport}://${this.remoteHost}:${this.remotePort}`);
            if (this.transport === "tls" && !this.tlsCaCertPath) {
                console.log("[LOGGING] TLS syslog using system CA trust store (no SYSLOG_CA_PATH set)");
            }
            this.startFlushInterval();
        }
    }

    private isIntercepting = false;

    enableGlobalIntercept() {
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;

        console.log = (...args: any[]) => {
            originalLog(...args);
            if (this.isIntercepting) return;
            this.isIntercepting = true;
            this.log(args.map(String).join(" "), SyslogSeverity.INFORMATIONAL).finally(() => this.isIntercepting = false);
        };

        console.warn = (...args: any[]) => {
            originalWarn(...args);
            if (this.isIntercepting) return;
            this.isIntercepting = true;
            this.log(args.map(String).join(" "), SyslogSeverity.WARNING).finally(() => this.isIntercepting = false);
        };

        console.error = (...args: any[]) => {
            originalError(...args);
            if (this.isIntercepting) return;
            this.isIntercepting = true;
            this.log(args.map(String).join(" "), SyslogSeverity.ERROR).finally(() => this.isIntercepting = false);
        };
    }

    private ignoredSources = new Set(["WEB:UI", "METRICS", "HEARTBEAT"]);
    private ignoredKeywords = ["GET /api/ws/events", "GET /api/metrics"];

    async log(message: string, severity: SyslogSeverity = SyslogSeverity.INFORMATIONAL, source: string = "SYSTEM", payload?: any) {
        // Filter out noisy logs
        if (this.ignoredSources.has(source)) return;
        for (const kw of this.ignoredKeywords) {
            if (message.includes(kw)) return;
        }

        const timestamp = new Date().toISOString();
        const hostname = Deno.hostname() || "unknown";
        const appName = "counter-terrorist";
        const procId = Deno.pid;

        // Structured message: [SOURCE] Message {payload?}
        let formattedMsg = `[${source}] ${message}`;
        if (payload) {
            try {
                formattedMsg += ` | PAYLOAD: ${JSON.stringify(payload)}`;
            } catch {
                formattedMsg += ` | PAYLOAD: [Complex Object]`;
            }
        }

        // RFC 5424 format
        // <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG
        const pri = (1 * 8) + severity; // Facility 1 (user-level)
        const syslogMsg = `<${pri}>1 ${timestamp} ${hostname} ${appName} ${procId} - - ${formattedMsg}`;

        // 1. Local File Logging
        this.writeToLocalFile(syslogMsg).catch(() => {});

        if (this.remoteHost) {
            this.bufferLog(syslogMsg);
        } else {
            // Also print to stdout for visibility, formatted for humans
            const color = severity <= SyslogSeverity.ERROR ? "\x1b[31m" : severity <= SyslogSeverity.WARNING ? "\x1b[33m" : "\x1b[0m";
            console.log(`${color}${timestamp} [${source}] [${SyslogSeverity[severity]}] ${message}\x1b[0m`);
        }
    }

    private async writeToLocalFile(msg: string) {
        try {
            await Deno.mkdir("./volume/logs", { recursive: true });
            await Deno.writeTextFile(this.logFilePath, msg + "\n", { append: true });
        } catch {
            // Silently fail to avoid crashing the orchestrator if disk is full
        }
    }

    private bufferLog(msg: string) {
        this.logBuffer.push(msg);
        if (this.logBuffer.length > this.maxBufferSize) {
            this.logBuffer.shift(); // Drop oldest if buffer full
        }
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
                case "udp":
                    await this.sendUdp(logsToSend);
                    break;
                case "tcp":
                    await this.sendTcpOrTls(logsToSend, false);
                    break;
                case "tls":
                    await this.sendTcpOrTls(logsToSend, true);
                    break;
            }
        } catch (_e) {
            // On failure, put logs back at the beginning of the buffer
            this.logBuffer = [...logsToSend, ...this.logBuffer].slice(0, this.maxBufferSize);
            // Close broken persistent connection so it reconnects next flush
            this.closePersistentConn();
            // Don't use console.error here to avoid infinite loops if intercepting
            // We'll just try again next interval
        } finally {
            this.isForwarding = false;
        }
    }

    /**
     * Send logs via UDP (original behavior, unencrypted).
     */
    private async sendUdp(logs: string[]) {
        const conn = await Deno.listenDatagram({
            port: 0,
            transport: "udp",
        });

        const encoder = new TextEncoder();
        for (const log of logs) {
            await conn.send(encoder.encode(log), {
                hostname: this.remoteHost!,
                port: this.remotePort,
                transport: "udp"
            });
        }
        conn.close();
    }

    /**
     * Send logs via TCP or TLS (RFC 5425 for TLS, RFC 6587 for TCP).
     * Uses persistent connections with automatic reconnection on failure.
     * Each message is framed with octet-counting per RFC 6587:
     *   <MSG_LEN> <SP> <MSG>
     */
    private async sendTcpOrTls(logs: string[], useTls: boolean) {
        const conn = await this.getOrCreateConnection(useTls);
        const encoder = new TextEncoder();

        for (const log of logs) {
            // RFC 6587 octet-counting framing: "<length> <message>"
            const msgBytes = encoder.encode(log);
            const frame = encoder.encode(`${msgBytes.length} `);

            const combined = new Uint8Array(frame.length + msgBytes.length);
            combined.set(frame);
            combined.set(msgBytes, frame.length);

            await conn.write(combined);
        }
    }

    /**
     * Gets an existing persistent connection or creates a new one.
     */
    private async getOrCreateConnection(useTls: boolean): Promise<Deno.Conn | Deno.TlsConn> {
        if (this.persistentConn) {
            return this.persistentConn;
        }

        if (useTls) {
            const options: Deno.ConnectTlsOptions = {
                hostname: this.remoteHost!,
                port: this.remotePort,
            };

            // If a custom CA cert path is specified, read and use it
            if (this.tlsCaCertPath) {
                try {
                    const caCert = await Deno.readTextFile(this.tlsCaCertPath);
                    options.caCerts = [caCert];
                } catch (e) {
                    // Fall through to system CA if file can't be read
                    console.warn(`[LOGGING] Failed to read SYSLOG_CA_PATH '${this.tlsCaCertPath}': ${e}`);
                }
            }

            this.persistentConn = await Deno.connectTls(options);
        } else {
            this.persistentConn = await Deno.connect({
                hostname: this.remoteHost!,
                port: this.remotePort,
            });
        }

        return this.persistentConn;
    }

    /**
     * Closes the persistent connection (e.g., on error for reconnection).
     */
    private closePersistentConn() {
        if (this.persistentConn) {
            try {
                this.persistentConn.close();
            } catch {
                // Ignore close errors
            }
            this.persistentConn = null;
        }
    }
}

export const loggingService = new LoggingService();
