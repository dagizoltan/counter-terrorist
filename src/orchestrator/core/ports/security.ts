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
  getBlockedIps(): Promise<string[]>;
  allowPort(port: number, protocol?: "tcp" | "udp"): Promise<CommandResult>;
  denyPort(port: number, protocol?: "tcp" | "udp"): Promise<CommandResult>;
  setKv(kv: Deno.Kv): Promise<void>;
}

export interface VpnPort {
  connect(interfaceName: string): Promise<{ success: boolean; message: string; details?: string }>;
  disconnect(): Promise<{ success: boolean; message: string; details?: string }>;
  isConnected(): Promise<boolean>;
  getStatus(): Promise<unknown>;
}

export interface AntivirusPort {
  getStatus(): Promise<unknown>;
  scanPath(path: string): Promise<{ success: boolean; threatsFound: boolean; message: string; details?: string }>;
  quarantine(path: string): Promise<{ success: boolean; message: string; target?: string }>;
  syncSignatures(): Promise<CommandResult>;
}

export interface PersistencePort {
  audit(): Promise<{ success: boolean; anomalies: unknown[]; timestamp: string }>;
}

export interface PcapPort {
  startCapture(interface_name?: string, duration?: number, filename?: string, filter?: string): Promise<CommandResult>;
  stopCapture(filename: string): Promise<CommandResult>;
}

export interface RkhunterPort {
  runScan(): Promise<{ success: boolean; exit_code?: number; stdout?: string; stderr?: string; error?: string }>;
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
