import { Plugin } from "../services/plugin_manager.ts";
import { PlatformInfo } from "../infrastructure/platform.ts";

export interface StartupPort {
  bootstrap(): Promise<{ os: string; isRoot: boolean; dependencies: Record<string, boolean> }>;
}

export interface PlatformPort {
  getPlatformInfo(): Promise<PlatformInfo>;
}

export interface PluginRegistryPort {
  register(plugin: Plugin): void;
  startAll(): Promise<void>;
  listPlugins(): { name: string; status: string }[];
}

export interface PluginFactoryPort {
  createPluginsForPlatform(tag: string): Plugin[];
}

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  data?: any;
}

export interface CommandPort {
  sendCommand(sidecar: string, command: any): Promise<CommandResult>;
  onEvent(sidecar: string, handler: (event: any) => void): void;
  getPersistentSidecar(sidecar: string): Promise<any>;
}

export interface FirewallPort {
  blockIp(ip: string): Promise<CommandResult>;
  unblockIp(ip: string): Promise<CommandResult>;
  getStatus(): Promise<CommandResult>;
}

export interface VpnPort {
  connect(interfaceName: string): Promise<{ success: boolean; message: string; details?: string }>;
  disconnect(): Promise<{ success: boolean; message: string; details?: string }>;
  isConnected(): Promise<boolean>;
  getStatus(): Promise<any>;
}

export interface AntivirusPort {
  getStatus(): Promise<any>;
  scanPath(path: string): Promise<{ success: boolean; threatsFound: boolean; message: string; details?: string }>;
  quarantine(path: string): Promise<{ success: boolean; message: string; target?: string }>;
}

export interface PersistencePort {
  audit(): Promise<{ success: boolean; anomalies: any[]; timestamp: string }>;
}

export interface PcapPort {
  startCapture(interface_name?: string, duration?: number, filename?: string): Promise<CommandResult>;
  stopCapture(): Promise<CommandResult>;
}

export interface RkhunterPort {
  runScan(): Promise<{ success: boolean; exit_code?: number; stdout?: string; stderr?: string; error?: string }>;
}

export interface ProtectionPort {
  firewall: FirewallPort;
  vpn: VpnPort;
  antivirus: AntivirusPort;
  persistence: PersistencePort;
  pcap: PcapPort;
  rkhunter: RkhunterPort;
}

export interface LoggingPort {
  enableGlobalIntercept(): void;
  log(message: string, severity?: number): Promise<void>;
}

export interface BaselinePort {
  startMonitor(): void;
}

export interface MeshPort {
  init(): Promise<void>;
  startDiscovery(): void;
}

export interface MeshAuthPort {
  getRootCACert(): Promise<{ cert: string; timestamp: number }>;
  generateNodeCert(nodeId: string): Promise<{ cert: string; key: string; timestamp: number }>;
  rotateCert(nodeId: string): Promise<{ cert: string; key: string; timestamp: number }>;
}

export interface ConfigurationPort {
  getToken(): string | undefined;
  getEnv(key: string): string | undefined;
}

export interface WebPort {
  start(port?: number): Promise<void>;
}

export interface AuditEvent {
  type: string;
  message: string;
  timestamp?: string;
  data?: any;
}

export interface AuditPort {
  logEvent(event: AuditEvent): Promise<void>;
}

export interface NotificationPayload {
  type: string;
  message: string;
  data?: any;
}

export interface NotificationPort {
  notify(event: NotificationPayload): Promise<void>;
}

export interface EventBusPort {
  publish(type: string, message: string, data?: any): void;
}

export interface ApplicationStatus {
  os: string;
  isRoot: boolean;
  dependencies: Record<string, boolean>;
  platformTag: string;
  plugins: { name: string; status: string }[];
}

