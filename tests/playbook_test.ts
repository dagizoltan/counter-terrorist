import { assert, assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { SidecarManager } from "../orchestrator/infrastructure/sidecar_manager.ts";
import { PlaybookService } from "../orchestrator/services/playbook_service.ts";
import { NotificationService } from "../orchestrator/services/alerts.ts";
import { loggingService } from "../orchestrator/infrastructure/logging.ts";

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

  const mockSidecarManager = {
    handlers: new Map<string, ((data: any) => void)[]>(),
    onEvent(name: string, handler: (data: any) => void) {
      if (!this.handlers.has(name)) this.handlers.set(name, []);
      this.handlers.get(name)!.push(handler);
    },
    emit(name: string, data: any) {
      const h = this.handlers.get(name) || [];
      h.forEach((fn: (d: any) => void) => fn(data));
    }
  } as any;

  const playbook = new PlaybookService(mockSidecarManager, mockProtection, mockNotifications, mockMeshManager);
  await playbook.init();

  // Simulate honeypot access
  const event = {
    event: {
      type: "PortAccess",
      payload: {
        port: 2222,
        source_ip: "10.0.0.5"
      }
    }
  };

  mockSidecarManager.emit("honeypot", event);

  // Wait a bit for async handler
  await new Promise(r => setTimeout(r, 100));

  assertEquals(blockedIp, "10.0.0.5", "IP should be automatically blocked by playbook");
});
