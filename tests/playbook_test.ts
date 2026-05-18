import { assert, assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { PlaybookService } from "@domain/orchestration/playbook_service.ts";

Deno.test("PlaybookService - Honeypot auto-block", async () => {
  // Mock dependencies
  let blockedIp: string | null = null;
  const mockProtection = {
    firewall: {
      blockIp: async (ip: string) => {
        blockedIp = ip;
      }
    },
    pcap: {
      startCapture: async () => {}
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

  const playbook = new PlaybookService();
  playbook.init(services);

  // Simulate honeypot access
  const event = {
    type: "PortAccess",
    port: 2222,
    source_ip: "10.0.0.5"
  };

  mockEventBus.emit("HONEYPOT", event);

  // Wait a bit for async handler
  await new Promise(r => setTimeout(r, 100));

  assertEquals(blockedIp, "10.0.0.5", "IP should be automatically blocked by playbook");
});
