import { assert, assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { PlaybookService } from "@domain/orchestration/playbook_service.ts";

Deno.test("PlaybookService - Honeypot auto-block", async () => {
  // Mock dependencies
  let blockedIp: string | null = null;
  const mockProtection = {
    firewall: {
      blockIp: async (ip: string) => {
        blockedIp = ip;
        return { success: true, stdout: "", stderr: "" };
      }
    },
    pcap: {
      startCapture: async () => ({ success: true, stdout: "", stderr: "" })
    }
  } as any;

  const mockNotifications = {
    notify: async () => {}
  } as any;

  const mockMeshManager = {
    isolateNode: () => {}
  } as any;

  const eventHandlers: Record<string, (data: any) => void> = {};
  const mockEventBus = {
    on: (name: string, handler: (data: any) => void) => {
      eventHandlers[name] = handler;
    },
    emit: (name: string, data: any) => {
        if (eventHandlers[name]) eventHandlers[name](data);
    }
  };

  const services = {
    protection: mockProtection,
    notifications: mockNotifications,
    mesh: mockMeshManager,
    eventBus: mockEventBus,
    shadowProtocol: {} as any,
    logging: { log: async () => {} }
  } as any;

  const { ServiceLocator } = await import("../src/orchestrator/core/service_locator.ts");
  const locator = new ServiceLocator();
  locator.register("eventBus", mockEventBus);
  locator.register("protection", mockProtection);
  locator.register("notifications", mockNotifications);
  locator.register("mesh", mockMeshManager);

  // SEC-03: Register behavioral and shadowProtocol as well for completeness in test
  locator.register("behavioral", { checkSyscallAnomalies: async () => "PASS" });
  locator.register("shadowProtocol", { activate: async () => {} });

  const playbook = new PlaybookService();
  playbook.setLocator(locator);
  playbook.setEventBus(mockEventBus as any);
  await playbook.init();

  // Simulate honeypot access
  const event = {
    type: "PortAccess",
    port: 2222,
    source_ip: "10.0.0.5"
  };

  mockEventBus.emit("HONEYPOT", event);

  // Wait a bit for async handler
  await new Promise(r => setTimeout(r, 200));

  assertEquals(blockedIp, "10.0.0.5", "IP should be automatically blocked by playbook");
});
