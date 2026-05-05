import { loggingService, LogType, LogSeverity } from "./src/orchestrator/infrastructure/system/logging.ts";
import { EventBus } from "./src/orchestrator/domain/analysis/events.ts";

const eventBus = new EventBus(loggingService);

console.log("--- Testing BLOCK EventBus publish ---");
eventBus.publish("BLOCK", "Blocking malicious IP: 1.2.3.4", { ip: "1.2.3.4" });
