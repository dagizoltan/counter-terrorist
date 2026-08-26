import { CommandResult, TpmPort, ExecutorPort } from "./infrastructure.ts";

export interface FirewallPort {
  blockIp(ip: string): Promise<CommandResult>;
  unblockIp(ip: string): Promise<CommandResult>;
  isBlocked(ip: string): Promise<boolean>;
  shadowBanIp(ip: string): Promise<CommandResult>;
  lockdown(): Promise<CommandResult>;
  killProcess(pid: number): Promise<CommandResult>;
  quarantineProcess(pid: number): Promise<CommandResult>;
  enforcePid(pid: number): Promise<CommandResult>;
  unenforcePid(pid: number): Promise<CommandResult>;
  getStatus(): Promise<CommandResult>;
  flushRules(): Promise<CommandResult>;
  sendCommand?(name: string, cmd: string | Record<string, unknown>): Promise<CommandResult>;
  getBlockedIps(): Promise<string[]>;
  /**
   * Active blocks with the enforcement record behind each one: why it was
   * committed, when, and when its TTL lapses. Optional so the many test
   * doubles implementing this port stay valid — a provider without it simply
   * has no ledger to read, and callers fall back to getBlockedIps().
   */
  getEnforcementLedger?(): Promise<Array<{
    ip: string;
    reason: string | null;
    committedAt: number | null;
    expiresAt: number | null;
    persisted: boolean;
  }>>;
  allowPort(port: number, protocol?: "tcp" | "udp"): Promise<CommandResult>;
  denyPort(port: number, protocol?: "tcp" | "udp"): Promise<CommandResult>;
  /**
   * Sockets this host is accepting connections on. Optional for the same
   * reason as getEnforcementLedger: the test doubles implementing this port
   * stay valid, and a provider that cannot enumerate reports nothing rather
   * than something made up.
   */
  listListeningPorts?(): Promise<Array<{
    port: number;
    protocol: "tcp" | "udp";
    address: string;
    pid?: number;
    process?: string;
  }>>;
  setKv(kv: Deno.Kv): Promise<void>;
}

export interface VpnPort {
  connect(interfaceName: string): Promise<{ success: boolean; message: string; details?: string }>;
  disconnect(): Promise<{ success: boolean; message: string; details?: string }>;
  isConnected(): Promise<boolean>;
  getStatus(): Promise<unknown>;
}

import { Result } from "../result.ts";

export interface AntivirusPort {
  getStatus(): Promise<unknown>;
  scanPath(path: string): Promise<Result<{ success: boolean; threatsFound: boolean; message: string; details?: string }>>;
  quarantine(path: string): Promise<Result<{ success: boolean; message: string; target?: string }>>;
  syncSignatures(): Promise<Result<CommandResult>>;
}

export interface PersistencePort {
  audit(): Promise<{ success: boolean; anomalies: unknown[]; timestamp: string }>;
}

export interface PcapPort {
  startCapture(interface_name?: string, duration?: number, filename?: string, filter?: string): Promise<CommandResult>;
  stopCapture(filename: string): Promise<CommandResult>;
}

export interface RkhunterPort {
  runScan(): Promise<Result<{ success: boolean; exit_code?: number; stdout?: string; stderr?: string; error?: string }>>;
  getLastResult(): unknown;
}

export interface ProtectionPort {
  firewall: FirewallPort;
  vpn: VpnPort;
  antivirus: AntivirusPort;
  persistence: PersistencePort;
  pcap: PcapPort;
  rkhunter: RkhunterPort;
  lockdown(): Promise<CommandResult>;
}

export interface BaselinePort {
  startMonitor(): void;
}
