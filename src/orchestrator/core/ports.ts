import { Plugin } from "@domain/orchestration/plugin_manager.ts";
import { PlatformInfo } from "@infrastructure/system/platform.ts";

export interface StartupPort {
  bootstrap(): Promise<{ os: string; isRoot: boolean; dependencies: Record<string, boolean> }>;
}

export interface PlatformPort {
  getPlatformInfo(): Promise<PlatformInfo>;
}

export interface PluginRegistryPort {
  register(plugin: Plugin): void;
  startAll(): Promise<void>;
  listPlugins(): { name: string; status: string; description: string; details?: any }[];
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
  emitEvent(sidecar: string, event: any): void;
  getPersistentSidecar(sidecar: string): Promise<any>;
  isRunning(sidecar: string): boolean;
  restartSidecar(sidecar: string): Promise<void>;
  stopSidecar(sidecar: string): Promise<void>;
  getPID(sidecar: string): number | null;
  getTpm(): TpmPort | null;
  getExecutor(): ExecutorPort;
}

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
  getStatus(): Promise<any>;
}

export interface AntivirusPort {
  getStatus(): Promise<any>;
  scanPath(path: string): Promise<{ success: boolean; threatsFound: boolean; message: string; details?: string }>;
  quarantine(path: string): Promise<{ success: boolean; message: string; target?: string }>;
  syncSignatures(): Promise<CommandResult>;
}

export interface PersistencePort {
  audit(): Promise<{ success: boolean; anomalies: any[]; timestamp: string }>;
}

export interface PcapPort {
  startCapture(interface_name?: string, duration?: number, filename?: string, filter?: string): Promise<CommandResult>;
  stopCapture(filename: string): Promise<CommandResult>;
}

export interface RkhunterPort {
  runScan(): Promise<{ success: boolean; exit_code?: number; stdout?: string; stderr?: string; error?: string }>;
  getLastResult(): any;
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

export enum LogSeverity {
  INFO = "info",
  SUCCESS = "success",
  WARNING = "warning",
  ERROR = "error",
  DEBUG = "debug"
}

export enum SyslogSeverity {
  EMERGENCY = 0,
  ALERT = 1,
  CRITICAL = 2,
  ERROR = 3,
  WARNING = 4,
  NOTICE = 5,
  INFORMATIONAL = 6,
  DEBUG = 7,
}

export enum LogType {
  DEBUG = "debug",
  AUDIT = "audit",
  ACTIVITY = "activity",
  GENERIC = "generic"
}

export interface LogEntry {
  timestamp: string;
  type: LogType;
  severity: LogSeverity;
  caller: string;
  message: string;
  payload?: any;
  formatted?: string; // High-fidelity forensic string [TYPE] [SEVERITY] [CALLER] MESSAGE
}

export interface LoggingPort {
  enableGlobalIntercept(): void;
  log(entry: LogEntry): Promise<void>;
  getRecentLogs(limit?: number): Promise<LogEntry[]>;
  // Legacy support
  logLegacy(message: string, severity?: LogSeverity | SyslogSeverity, source?: string, payload?: any): Promise<void>;
  setKv(kv: Deno.Kv): void;
  shutdown(): Promise<void>;
}

export interface BaselinePort {
  startMonitor(): void;
}

export interface MeshPort {
  init(): Promise<import("./result.ts").Result<void>>;
  shutdown(): Promise<import("./result.ts").Result<void>>;
  startDiscovery(): void;
  getNodeId(): string;
  getActiveNodeCount(): number;
  getNodes(): any[];
  isolateNode(nodeId: string): import("./result.ts").Result<void>;
  broadcastThreatHash(hash: string, sourceNode: string): Promise<import("./result.ts").Result<void>>;
  broadcastAuditEvent(event: any): Promise<void>;
  broadcastAuditVerification(lastHash: string, eventCount: number): Promise<void>;
  requestAuditSync(nodeId: string): Promise<void>;
}

export interface MeshAuthPort {
  getRootCA(): Promise<any>; // Returns CertPair
  getTrustedCerts(): Promise<string[]>;
  generateNodeCert(nodeId: string): Promise<any>;
  rotateCert(nodeId: string): Promise<any>;
}

export interface ConfigurationPort {
  getToken(): string | undefined;
  getMeshSecret(): string | undefined;
  getEnv(key: string): string | undefined;
  getNumber(key: string, defaultValue: number): number;
  getBoolean(key: string, defaultValue: boolean): boolean;
}

export interface WebPort {
  start(port?: number): Promise<void>;
  stop(): Promise<void>;
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

export interface TpmPort {
  sealSecret(secretName: string, data: string): Promise<void>;
  unsealSecret(secretName: string): Promise<string | null>;
  getPcrs(indices?: number[]): Promise<Record<number, string>>;
  verifyIntegrity(goldenPcrs?: Record<number, string>): Promise<boolean>;
  isHardwareVerified(): boolean;
  sign(data: string): Promise<string>;
  verify(data: string, signature: string): Promise<boolean>;
  generateSelfSignedCA(commonName: string): Promise<CommandResult>;
  issueNodeCert(nodeId: string, caCert: string, caKey: string): Promise<CommandResult>;
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
  emit(event: string, data: any): void;
  subscribe(handler: (event: { type: string; message: string; timestamp: string; data?: any }) => void): () => void;
  unsubscribe(handler: (event: any) => void): void;
  on(event: string, callback: (data: any) => void): () => void;
}

export interface ExecutorPort {
  execute(cmd: string, args?: string[], timeoutMs?: number): Promise<CommandResult>;
  executeAsync(cmd: string, args?: string[]): Promise<void>;
}

export interface ApplicationStatus {
  os: string;
  isRoot: boolean;
  dependencies: Record<string, boolean>;
  platformTag: string;
  platform?: PlatformInfo;
  plugins: { name: string; status: string; description: string; details?: any }[];
}

