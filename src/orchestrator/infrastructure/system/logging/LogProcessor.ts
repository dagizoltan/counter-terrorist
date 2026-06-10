import { LogEntry, LogSeverity, LogType } from "@core/ports.ts";
import { SecretRedactor } from "@core/utils/security.ts";

export class LogProcessor {
    constructor(private redactor: SecretRedactor) {}

    process(entry: LogEntry): { formattedMsg: string, syslogMsg: string, pri: number } {
        entry.message = this.redactor.redact(entry.message);
        if (entry.payload) {
            entry.payload = this.redactor.redactObject(entry.payload);
        }

        entry.message = this.sanitize(entry.message);
        if (entry.caller) entry.caller = this.sanitize(entry.caller);

        const { timestamp, type, severity = LogSeverity.INFO, caller, message, payload } = entry;
        let formattedMsg = `[${(type || LogType.GENERIC).toUpperCase()}] [${(severity || LogSeverity.INFO).toLowerCase()}] [${caller || "UNKNOWN"}] ${message}`;
        entry.formatted = formattedMsg;

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
            [LogSeverity.DEBUG]: 7,
            [LogSeverity.CRITICAL]: 2
        };

        const pri = (1 * 8) + (severityMap[severity] || 6);
        const hostname = Deno.hostname() || "unknown";
        const appName = "ct-orch";
        const procId = Deno.pid;
        const syslogMsg = `<${pri}>1 ${timestamp} ${hostname} ${appName} ${procId} - - ${formattedMsg}`;

        return { formattedMsg, syslogMsg, pri };
    }

    private sanitize(str: string): string {
        if (typeof str !== "string") return String(str);
        const noAnsi = str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
        return noAnsi.replace(/[\r\n]+/g, " ").replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "").trim();
    }
}
