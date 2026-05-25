import { Plugin } from "@domain/orchestration/plugin_manager.ts";
import { PlatformInfo } from "@infrastructure/system/platform.ts";
import { Result } from "./result.ts";
import { z } from "npm:zod";
import type { EventName, EventRegistry } from "@core/event_schema.ts";

export type SystemEventEnvelope<T extends EventName = EventName> = {
  type: T;
  message: string;
  timestamp: string;
  data: z.infer<EventRegistry[T]>;
  correlationId?: string;
  fromAudit?: boolean;
};

export type EventHandler<T extends EventName> = (
  data: z.infer<EventRegistry[T]>,
  event: SystemEventEnvelope<T>
) => void | Promise<void>;

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
  data?: Record<string, any>;
  message?: string;
}

export interface CommandPort {
  sendCommand(sidecar: string, command: Record<string, unknown> | string): Promise<CommandResult>;
  onEvent(sidecar: string, handler: (event: unknown) => void): void;
  emitEvent(sidecar: string, event: unknown): void;
  getPersistentSidecar(sidecar: string): Promise<unknown>;
  isRunning(sidecar: string): boolean;
  restartSidecar(sidecar: string): Promise<void>;
  stopSidecar(sidecar: string): Promise<void>;
  getPID(sidecar: string): number | null;
  getTpm(): TpmPort | undefined;
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
  payload?: unknown;
  formatted?: string; // High-fidelity forensic string [TYPE] [SEVERITY] [CALLER] MESSAGE
  fromAudit?: boolean;
}

export interface LoggingPort {
  enableGlobalIntercept(): void;
  log(entry: LogEntry): Promise<void>;
  getRecentLogs(limit?: number): Promise<LogEntry[]>;
  // Legacy support
  logLegacy(message: string, severity?: LogSeverity | SyslogSeverity, source?: string, payload?: unknown): Promise<void>;
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
  getNodes(): unknown[];
  isolateNode(nodeId: string): import("./result.ts").Result<void>;
  broadcastThreatHash(hash: string, sourceNode: string): Promise<import("./result.ts").Result<void>>;
  broadcastAuditEvent(event: unknown): Promise<void>;
  broadcastAuditVerification(lastHash: string, eventCount: number): Promise<void>;
  requestAuditSync(nodeId: string): Promise<void>;
}

export interface MeshAuthPort {
  getRootCA(): Promise<Result<{ cert: string; key: string }>>;
  getTrustedCerts(): Promise<string[]>;
  generateNodeCert(nodeId: string): Promise<Result<{ cert: string; key: string }>>;
  rotateCert(nodeId: string): Promise<Result<{ cert: string; key: string }>>;
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
  data?: unknown;
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
  data?: unknown;
}

export interface NotificationPort {
  notify(event: NotificationPayload): Promise<void>;
}

export interface EventBusPort {
  publish<T extends EventName>(type: T, message: string, data?: z.infer<EventRegistry[T]>): void;
  emit<T extends EventName>(event: T, data: z.infer<EventRegistry[T]>): void;
  subscribe(handler: (event: SystemEventEnvelope) => void | Promise<void>): () => void;
  unsubscribe(handler: (event: SystemEventEnvelope) => void): void;
  on<T extends EventName>(event: T, callback: EventHandler<T>): () => void;
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

