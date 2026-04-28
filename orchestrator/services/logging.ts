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

export class LoggingService {
    private remoteHost: string | null = null;
    private remotePort: number = 514;

    constructor() {
        this.remoteHost = Deno.env.get("SYSLOG_HOST") || null;
        this.remotePort = Number(Deno.env.get("SYSLOG_PORT")) || 514;
    }

    private isLogging = false;

    /**
     * Intercepts console methods to automatically forward logs to syslog.
     */
    enableGlobalIntercept() {
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;

        console.log = (...args: any[]) => {
            originalLog(...args);
            if (this.isLogging) return;
            this.isLogging = true;
            this.log(args.map(String).join(" "), SyslogSeverity.INFORMATIONAL).finally(() => this.isLogging = false);
        };

        console.warn = (...args: any[]) => {
            originalWarn(...args);
            if (this.isLogging) return;
            this.isLogging = true;
            this.log(args.map(String).join(" "), SyslogSeverity.WARNING).finally(() => this.isLogging = false);
        };

        console.error = (...args: any[]) => {
            originalError(...args);
            if (this.isLogging) return;
            this.isLogging = true;
            this.log(args.map(String).join(" "), SyslogSeverity.ERROR).finally(() => this.isLogging = false);
        };
    }

    async log(message: string, severity: SyslogSeverity = SyslogSeverity.INFORMATIONAL) {
        const timestamp = new Date().toISOString();
        const hostname = Deno.hostname() || "unknown";
        const appName = "counter-terrorist";

        // RFC 5424 format (simplified)
        // <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG
        const pri = (1 * 8) + severity; // Facility 1 (user-level)
        const syslogMsg = `<${pri}>1 ${timestamp} ${hostname} ${appName} - - - ${message}`;

        console.log(`[SYSLOG] ${syslogMsg}`);

        if (this.remoteHost) {
            try {
                const conn = await Deno.listenDatagram({
                    port: 0,
                    transport: "udp",
                });
                await conn.send(new TextEncoder().encode(syslogMsg), { hostname: this.remoteHost, port: this.remotePort, transport: "udp" });
                conn.close();
            } catch (e) {
                console.error("[SYSLOG] Failed to send remote log:", e);
            }
        }
    }
}

export const loggingService = new LoggingService();
