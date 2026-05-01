import { CommandResult } from "@core/ports.ts";

export interface FirewallProvider {
  blockIp(ip: string): Promise<CommandResult>;
  shadowBanIp(ip: string): Promise<CommandResult>;
  unblockIp(ip: string): Promise<CommandResult>;
  killProcess(pid: number): Promise<CommandResult>;
  dumpProcessForensics?(pid: number): Promise<CommandResult>;
  getStatus(): Promise<CommandResult>;
  lockdown(): Promise<CommandResult>;
  flushRules(): Promise<CommandResult>;
}

export interface VpnResult {
  success: boolean;
  message: string;
  details?: string;
}

export interface VpnProvider {
  connect(interfaceName: string): Promise<VpnResult>;
  disconnect(): Promise<VpnResult>;
  isConnected(): Promise<boolean>;
  getStatus(): Promise<any>;
  flushRules(): Promise<VpnResult>;
}

export interface ScanResult {
  success: boolean;
  threatsFound: boolean;
  message: string;
  details?: string;
}

export interface AntivirusProvider {
  getStatus(): Promise<any>;
  scanPath(path: string): Promise<ScanResult>;
  quarantine(path: string): Promise<{ success: boolean; message: string; target?: string }>;
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
