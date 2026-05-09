import { assert, assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { PlaybookService } from "@domain/orchestration/playbook_service.ts";
import { NotificationService } from "@domain/analysis/notifications.ts";
import { loggingService } from "@infrastructure/system/logging.ts";

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

  const mockSidecarManager = {} as any;

  const handlers: Record<string, ((data: any) => void)> = {};
  const mockEventBus = {
    on: (name: string, handler: (data: any) => void) => {
      handlers[name] = handler;
    },
    emit: (name: string, data: any) => {
      if (handlers[name]) handlers[name](data);
    }
  } as any;

  const playbook = new PlaybookService(mockSidecarManager, mockProtection, mockNotifications, mockMeshManager, {} as any, mockEventBus);
  await playbook.init();

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
