import { CommandResult } from "@core/ports.ts";

/** One socket the host is accepting connections on. */
export interface ListeningPort {
  port: number;
  protocol: "tcp" | "udp";
  /** Bind address as reported by the OS: 0.0.0.0, ::, 127.0.0.1, … */
  address: string;
  pid?: number;
  process?: string;
}

export interface FirewallProvider {
  /**
   * What this host is actually listening on.
   *
   * Optional: the console can already open and close ports — arming a decoy
   * does exactly that — but nothing could ever report which ports were open,
   * so there was no way to see the result of the control or to spot a listener
   * nobody meant to expose. A provider without a way to enumerate simply has
   * no answer, and the caller degrades rather than inventing one.
   */
  listListeningPorts?(): Promise<ListeningPort[]>;
  blockIp(ip: string): Promise<CommandResult>;
  shadowBanIp(ip: string): Promise<CommandResult>;
  unblockIp(ip: string): Promise<CommandResult>;
  sendCommand?(name: string, cmd: string | Record<string, unknown>): Promise<CommandResult>;
  killProcess(pid: number): Promise<CommandResult>;
  quarantineProcess(pid: number): Promise<CommandResult>;
  enforcePid(pid: number): Promise<CommandResult>;
  unenforcePid(pid: number): Promise<CommandResult>;
  dumpProcessForensics?(pid: number): Promise<CommandResult>;
  getStatus(): Promise<CommandResult>;
  lockdown(): Promise<CommandResult>;
  allowPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult>;
  denyPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult>;
  flushRules(): Promise<CommandResult>;
}

export interface VpnResult {
  success: boolean;
  message: string;
  details?: string;
}

export interface VpnProvider {
  connect(interfaceName: string): Promise<VpnResult>;
  disconnect(interfaceName?: string): Promise<VpnResult>;
  isConnected(interfaceName?: string): Promise<boolean>;
  getStatus(): Promise<any>;
  flushRules(): Promise<VpnResult>;
}

export interface ScanResult {
  success: boolean;
  threatsFound: boolean;
  message: string;
  details?: string;
  timestamp?: string;
}

export interface AntivirusProvider {
  getStatus(): Promise<any>;
  scanPath(path: string): Promise<ScanResult>;
  quarantine(path: string): Promise<{ success: boolean; message: string; target?: string }>;
  syncSignatures(): Promise<CommandResult>;
}

export interface PersistenceAuditResult {
  success: boolean;
  anomalies: any[];
  timestamp: string;
}

export interface PersistenceProvider {
  auditPersistence(): Promise<PersistenceAuditResult>;
}

export interface PcapProvider {
  startCapture(interfaceName: string, duration: number, filename: string, filter?: string): Promise<CommandResult>;
  stopCapture(filename: string): Promise<CommandResult>;
  getStatus(): Promise<CommandResult>;
}
