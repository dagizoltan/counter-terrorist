import { loggingService, LogSeverity, LogType } from "../src/orchestrator/infrastructure/system/logging.ts";

console.log("Test: enableGlobalIntercept");
loggingService.enableGlobalIntercept();

console.log("Test: loggingService.log");
await loggingService.log({
    timestamp: new Date().toISOString(),
    type: LogType.GENERIC,
    severity: LogSeverity.INFO,
    caller: "TEST",
    message: "Test message"
});

console.log("Test: Done");
