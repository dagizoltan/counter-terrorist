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
  listPlugins(): { name: string; status: string; description: string; details?: Record<string, unknown> }[];
}

export interface PluginFactoryPort {
  createPluginsForPlatform(tag: string): Plugin[];
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

export interface NotificationPayload {
  type: string;
  message: string;
  data?: unknown;
}

export interface NotificationPort {
  notify(event: NotificationPayload): Promise<void>;
}

export interface ApplicationStatus {
  os: string;
  isRoot: boolean;
  dependencies: Record<string, boolean>;
  platformTag: string;
  platform?: PlatformInfo;
  plugins: { name: string; status: string; description: string; details?: Record<string, unknown> }[];
}

export interface ServiceLocatorPort {
  register<K extends string, T>(key: K, service: T): void;
  get<T>(key: string): T;
  has(key: string): boolean;
}
