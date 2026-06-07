import { ServiceMap } from "./service_locator.ts";

/**
 * ServiceContainer is now a type-safe projection of the ServiceLocator.
 * This avoids the God Object anti-pattern while maintaining backward compatibility
 * for components that expect a container-like interface.
 */
import { PlatformName } from "@infrastructure/system/platform.ts";

export interface PlatformInfo {
  name: PlatformName;
  version: string;
  tag: string;
  isRoot: boolean;
  tpm?: { available: boolean; pcrs: Record<number, string> };
  metrics?: Record<string, unknown>;
}

export type ServiceContainer = {
  [K in keyof ServiceMap]: ServiceMap[K];
} & {
  platformInfo: PlatformInfo;
};
