import { LoggingPort, SyslogSeverity } from "../core/ports.ts";

export { SyslogSeverity };

export class LoggingService implements LoggingPort {
    private remoteHost: string | null = null;
    private remotePort: number = 514;
    private logBuffer: string[] = [];
    private maxBufferSize = 1000;
    private isForwarding = false;

    constructor() {
        this.remoteHost = Deno.env.get("SYSLOG_HOST") || null;
        this.remotePort = Number(Deno.env.get("SYSLOG_PORT")) || 514;

        if (this.remoteHost) {
            console.log(`[LOGGING] Remote syslog enabled: ${this.remoteHost}:${this.remotePort}`);
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

    async log(message: string, severity: SyslogSeverity = SyslogSeverity.INFORMATIONAL) {
        const timestamp = new Date().toISOString();
        const hostname = Deno.hostname() || "unknown";
        const appName = "counter-terrorist";
        const procId = Deno.pid;

        // RFC 5424 format
        // <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG
        const pri = (1 * 8) + severity; // Facility 1 (user-level)
        const syslogMsg = `<${pri}>1 ${timestamp} ${hostname} ${appName} ${procId} - - ${message}`;

        if (this.remoteHost) {
            this.bufferLog(syslogMsg);
        } else {
            // If no remote host, we still print to stdout but it's already done by console interception
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
            const conn = await Deno.listenDatagram({
                port: 0,
                transport: "udp",
            });

            const encoder = new TextEncoder();
            for (const log of logsToSend) {
                await conn.send(encoder.encode(log), {
                    hostname: this.remoteHost!,
                    port: this.remotePort,
                    transport: "udp"
                });
            }
            conn.close();
        } catch (e) {
            // On failure, put logs back at the beginning of the buffer
            this.logBuffer = [...logsToSend, ...this.logBuffer].slice(0, this.maxBufferSize);
            // Don't use console.error here to avoid infinite loops if intercepting
            // We'll just try again next interval
        } finally {
            this.isForwarding = false;
        }
    }
}

export const loggingService = new LoggingService();
