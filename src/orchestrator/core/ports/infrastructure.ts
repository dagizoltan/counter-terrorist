export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  data?: Record<string, unknown>;
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

export interface TpmPort {
  sealSecret(secretName: string, data: string, pcrs?: Record<number, string>): Promise<void>;
  unsealSecret(secretName: string): Promise<string | null>;
  getPcrs(indices?: number[]): Promise<Record<number, string>>;
  verifyIntegrity(goldenPcrs?: Record<number, string>): Promise<boolean>;
  isHardwareVerified(): boolean;
  sign(data: string): Promise<string>;
  verify(data: string, signature: string): Promise<boolean>;
  generateSelfSignedCA(commonName: string): Promise<CommandResult>;
  issueNodeCert(nodeId: string, caCert?: string, caKey?: string): Promise<CommandResult>;
  generateProxyKey(keyId: string): Promise<CommandResult>;
  signProxy(keyId: string, data: string): Promise<CommandResult>;
  wipeSecrets(): Promise<CommandResult>;
}

export interface ExecutorPort {
  execute(cmd: string, args?: string[], timeoutMs?: number): Promise<CommandResult>;
  executeAsync(cmd: string, args?: string[]): Promise<void>;
}
