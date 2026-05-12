import { SovereignApp } from "../src/orchestrator/app/sovereign_app.ts";
import { ServiceContainer } from "../src/orchestrator/core/container.ts";
import { LoggingPort, LogSeverity, LogType } from "../src/orchestrator/core/ports.ts";

// This script simulates a honeypot hit by directly calling the service logic.
// It ensures that TACTICAL_TRIGGER events are broadcasted to the UI.

async function simulate() {
    console.log("🚀 Initiating simulated brute-force attack against RDP Decoy...");
    
    // We need to bypass the boot sequence but get access to the services
    const app = new SovereignApp();
    // We'll manually trigger the boot to initialize the container
    // But we'll try to just grab the services if we can.
    
    // Since SovereignApp keeps container private, we'll use a hack or just mock the broadcast.
    
    // Better: Connect to the WebSocket as a client and wait for the message? 
    // No, we want to TRIGGER the message.
    
    // Let's use the actual HoneypotService if we can import it.
    const { HoneypotService } = await import("../src/orchestrator/domain/protection/honeypot_service.ts");
    
    const mockLogging: LoggingPort = {
        log: (entry) => console.log(`[LOG] ${entry.severity} - ${entry.message}`)
    };
    
    const mockBroadcast = (data: any) => {
        console.log("📡 BROADCAST EMITTED:", JSON.stringify(data, null, 2));
    };
    
    const mockSidecar = {
        sendCommand: async () => ({ success: true }),
        getPersistentSidecar: async () => ({})
    } as any;
    
    const mockFirewall = {
        allowPort: async () => {},
        denyPort: async () => {},
        blockIp: async () => {},
        shadowBanIp: async () => {}
    } as any;
    
    const mockPcap = {
        startCapture: async () => {}
    } as any;

    const honeypot = new HoneypotService(
        mockSidecar,
        mockFirewall,
        mockPcap,
        mockBroadcast,
        mockLogging
    );

    console.log("⚔️ Triggering RDP Decoy (Port 3389)...");
    
    // Simulate a PortAccess event as if it came from the decoy sidecar
    await (honeypot as any).handleEvent({
        data: {
            type: "PortAccess",
            source_ip: "192.168.1.105",
            port: 3389
        }
    });

    console.log("\n🌐 Triggering Web Decoy (/admin)...");
    await honeypot.onWebTrigger("/admin", "45.12.33.190");

    console.log("\n✅ Simulation complete. Verify that TACTICAL_TRIGGER appeared in the UI.");
}

simulate().catch(console.error);
