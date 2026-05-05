import { loggingService, LogType, LogSeverity } from "./src/orchestrator/infrastructure/system/logging.ts";
import { initBroadcaster, broadcast } from "./src/orchestrator/interface/web/api/ws.ts";

const mockAudit = {
    logEvent: async (event: any) => {
        // console.log(`[MOCK AUDIT] ${event.type}: ${event.message} | Severity: ${event.severity}`);
    }
};

initBroadcaster({
    notificationService: { notify: async () => {} } as any,
    auditService: mockAudit as any,
    eventBus: { 
        publish: (type: string, message: string, data?: any) => {
            // This is just a mock to see if broadcast calls it
        }
    } as any,
    loggingService: loggingService
});

console.log("--- Testing BLOCK broadcast ---");
// This will trigger the loggingService.log call inside broadcast
await broadcast({ type: "BLOCK", message: "Blocking malicious IP: 1.2.3.4", data: { ip: "1.2.3.4" } });
