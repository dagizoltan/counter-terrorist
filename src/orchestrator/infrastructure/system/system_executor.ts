import { CommandResult, ExecutorPort } from "@core/ports.ts";
import * as path from "@std/path";
import { validatePath } from "./validation.ts";
import { COMMAND_POLICIES, SYSTEM_JAILS } from "./execution_policy.ts";
import { PLATFORM_TOOLS } from "./platform.ts";

/**
 * Executes one-off system commands with strict security validation.
 */
export class SystemExecutor implements ExecutorPort {
  private static readonly WHITELISTED_COMMANDS = [
    "mkdir", "mv", "chmod", "ls", "sha256sum", "systemctl",
    "crontab", "which", "where", "netsh", "taskkill", "tc", "kill",
    "cp", "gcore", "ufw", "tpm2_nvdefine", "tpm2_nvwrite", "tpm2_nvread",
    "tpm2_pcrread", "wg-quick", "wg", "launchctl", "system_profiler", "ss",
    "unshare", "iptables", "tpm2_sign", "tpm2_hash", "sw_vers", "openssl",
    "pfctl", "ifconfig", "killall", "spctl", "ps", "pktmon", "ip", "sysctl", "nmcli", "ping", "host", "scp", "ssh", "security", "powershell",
    "analyzer", "enforcer", "decoy", "netcap", "sentinel", "watchfile", "tunnel", "sentinel-darwin", "telemetry-win", "enforcer-win", "ebpf",
    "/var/lib/cts/scripts/install_service.sh",
    "/var/lib/cts/scripts/update_crontab.sh",
    "/var/lib/cts/scripts/update_comm.sh",
    "/var/lib/cts/scripts/secure_spawn.sh"
  ];

  private static readonly PRIVILEGED_COMMANDS = [
    "ufw", "tc", "iptables", "wg-quick", "wg", "gcore", "unshare", "systemctl", 
    "tpm2_nvdefine", "tpm2_nvwrite", "tpm2_nvread", "tpm2_pcrread", "setcap",
    "chmod", "mkdir", "cp", "mv", "pfctl", "pktmon", "netsh",
    "/var/lib/cts/scripts/secure_spawn.sh"
  ];

  private static readonly PLATFORM_TOOLS = PLATFORM_TOOLS;

  private static readonly PATH_SENSITIVE_COMMANDS = [
    "openssl", "mkdir", "cp", "mv", "chmod", "ls", "sha256sum",
    "sentinel", "ebpf", "analyzer", "watchfile", "netcap",
    "ssh", "scp"
  ];

  private static readonly SYSTEM_JAILS = [
    "./volume/",
    "/var/lib/cts/",
    "/etc/systemd/system/cts-",
    "/home/",
    "/var/www/",
    "/tmp/"
  ];

  private validateArguments(cmd: string, args: string[]): { valid: boolean; reason?: string } {
    const baseCmd = path.basename(cmd);
    const policy = COMMAND_POLICIES[cmd] || COMMAND_POLICIES[baseCmd];

    if (!policy || !policy.schema) {
      return { valid: false, reason: `No exhaustive Zod security policy defined for whitelisted command '${cmd}'. Blocking for safety.` };
    }

    const result = policy.schema.safeParse(args);
    if (!result.success) {
        return {
            valid: false,
            reason: `Structured validation failed for '${baseCmd}': ${result.error.issues.map(e => e.message).join(", ")}`
        };
    }

    const isPathSensitive = SystemExecutor.PATH_SENSITIVE_COMMANDS.includes(baseCmd) ||
                            SystemExecutor.PATH_SENSITIVE_COMMANDS.includes(cmd);

    for (const arg of args) {
        if (isPathSensitive) {
            const validation = this.validateSensitiveArgument(arg, baseCmd);
            if (!validation.valid) return validation;
        }

        if (policy.blockedStrings) {
            for (const blocked of policy.blockedStrings) {
                if (arg.includes(blocked)) {
                    return {
                        valid: false,
                        reason: `Security Violation: Argument '${arg}' contains blocked sequence: '${blocked}'`
                    };
                }
            }
        }

        if (!((baseCmd === "sentinel" || baseCmd === "ebpf" || baseCmd === "analyzer") && arg.startsWith("{"))) {
            if (/[;&|><`$!]/.test(arg)) {
                return { valid: false, reason: `Security Violation: Shell metacharacter detected in command arguments.` };
            }
        }
    }

    return { valid: true };
  }

  private static readonly DANGEROUS_PATTERN = /[\/\\%{}&|;><`()!\n\r\$]|\.\./;

  private isPotentiallyDangerous(arg: string): boolean {
      // SOV-06 HARDENING: Comprehensive shell metacharacter and escape detection
      // PERFORMANCE: Using pre-compiled regex for ~3x faster hot-path validation
      return SystemExecutor.DANGEROUS_PATTERN.test(arg);
  }

  private validateSensitiveArgument(arg: string, baseCmd: string): { valid: boolean; reason?: string } {
      // SOV-06: Remote path bypass for SCP/SSH to avoid jail enforcement on remote addresses
      // FIX: Apply shell metacharacter protection even to remote paths to prevent injection
      if ((baseCmd === "scp" || baseCmd === "ssh") && /^[a-z0-9]+@([a-z0-9.-]+|\[[a-f0-9:]+\]):.*$/.test(arg)) {
          // SOV-06 HARDENING: Ensure remote paths do not contain shell metacharacters that could enable command injection
          if (/[;&|><`$()!\n\r\t]/.test(arg)) {
              return { valid: false, reason: `Security Violation: Shell metacharacters detected in remote path for '${baseCmd}'` };
          }
          return { valid: true };
      }

      // Security: Check for path traversal and restricted characters first
      if (this.isPotentiallyDangerous(arg)) {
          // Explicitly block shell metacharacters in paths
          if (/[;&|><`$()!]/.test(arg)) {
              // Allow $ and () in specific JSON structures if it matches sidecar IPC
              if (!(arg.startsWith("{") && arg.endsWith("}"))) {
                  return { valid: false, reason: `Security Violation: Shell metacharacters detected in path-sensitive argument for '${baseCmd}'` };
              }
          }

          if (!validatePath(arg)) {
              return { valid: false, reason: `Security Violation: Path traversal or prefix bypass detected in argument '${arg}' for sensitive command '${baseCmd}'` };
          }
      }

      // Special case: openssl dgst -sha256 -r
      if (baseCmd === "openssl" && (arg === "dgst" || arg === "-sha256" || arg === "-r")) {
          return { valid: true };
      }

      // Handle JSON-embedded paths (Sidecar IPC)
      if (arg.startsWith("{")) {
          try {
              const parsed = JSON.parse(arg);
              // Recursively check for path-related keys in the JSON structure
              const paths = this.extractPathsFromJson(parsed);
              for (const p of paths) {
                  if (!validatePath(p, SYSTEM_JAILS)) {
                      return { valid: false, reason: `Security Violation: Unauthorized path '${p}' in JSON payload for sensitive command '${baseCmd}'` };
                  }
              }
              return { valid: true }; // If it was JSON and all paths were valid, we're done
          } catch {
              // Not valid JSON, continue to raw string validation
          }
      }

      // Raw String Validation
      // For sensitive commands, if it's NOT a path-like string (e.g. "dgst", "-sha256"),
      // we only check for basic traversal. If it IS path-like, we enforce the jail.
      const isPathLike = arg.includes("/") || arg.includes("\\") || arg.startsWith("./") || arg.startsWith("/");

      if (isPathLike) {
          if (!validatePath(arg, SYSTEM_JAILS)) {
              return { valid: false, reason: `Security Violation: Unauthorized path or traversal detected in argument '${arg}' for sensitive command '${baseCmd}'` };
          }
      } else {
          if (!validatePath(arg)) {
              return { valid: false, reason: `Security Violation: Path traversal detected in argument '${arg}' for sensitive command '${baseCmd}'` };
          }
      }

      return { valid: true };
  }

  private extractPathsFromJson(obj: unknown, inPathContext: boolean = false, depth: number = 0): string[] {
      const paths: string[] = [];
      if (!obj || obj === null) return paths;

      // SOV-P2: Recursion depth limit to prevent stack overflow attacks
      const MAX_DEPTH = 10;
      if (depth > MAX_DEPTH) return paths;

      // SOV-03 HARDENING: Hybrid key-based and content-aware path extraction.
      if (Array.isArray(obj)) {
          for (const item of obj) {
              paths.push(...this.extractPathsFromJson(item, inPathContext, depth + 1));
          }
          return paths;
      }

      if (typeof obj !== "object") return paths;

      const pathKeys = ["path", "target", "exe_path", "log_path", "source", "destination", "output", "file", "paths"];

      // We inspect all string values and recurse into objects.
      for (const [key, value] of Object.entries(obj)) {
          const isPathKey = pathKeys.includes(key);
          if (typeof value === "string") {
              // Extract if it's a known path key, if we're inside a path-related structure,
              // or if the content looks like a path (contains separators).
              if (inPathContext || isPathKey || value.includes("/") || value.includes("\\")) {
                  paths.push(value);
              }
          } else if (typeof value === "object" && value !== null) {
              paths.push(...this.extractPathsFromJson(value, inPathContext || isPathKey, depth + 1));
          }
      }
      return paths;
  }

  executeAsync(cmd: string, args: string[] = []): Promise<void> {
    const baseCmd = path.basename(cmd);
    if (!SystemExecutor.WHITELISTED_COMMANDS.includes(baseCmd) && !SystemExecutor.WHITELISTED_COMMANDS.includes(cmd)) {
        throw new Error(`Security Violation: Command '${cmd}' is not in the system whitelist.`);
    }

    const validation = this.validateArguments(cmd, args);
    if (!validation.valid) {
        throw new Error(`Security Violation: ${validation.reason}`);
    }

    let finalCmd = cmd;
    let finalArgs = [...args];

    if ((SystemExecutor.PRIVILEGED_COMMANDS.includes(baseCmd) || SystemExecutor.PRIVILEGED_COMMANDS.includes(cmd)) && Deno.uid() !== 0) {
        finalCmd = "sudo";
        finalArgs = ["-n", cmd, ...args];
    }

    const command = new Deno.Command(finalCmd, {
        args: finalArgs,
        stdout: "null",
        stderr: "null",
    });
    const child = command.spawn();
    child.unref();

    return Promise.resolve();
  }

  async execute(cmd: string, args: string[] = [], timeoutMs: number = 30000): Promise<CommandResult & { stdout: string; stderr: string }> {
    const baseCmd = path.basename(cmd);
    // Security: Whitelist validation
    if (!SystemExecutor.WHITELISTED_COMMANDS.includes(baseCmd) && !SystemExecutor.WHITELISTED_COMMANDS.includes(cmd)) {
        return {
            success: false,
            stdout: "",
            stderr: `Security Violation: Command '${cmd}' is not in the system whitelist.`,
        };
    }

    // Security: Granular Argument Validation
    const validation = this.validateArguments(cmd, args);
    if (!validation.valid) {
        return {
            success: false,
            stdout: "",
            stderr: `Security Violation: ${validation.reason}`,
        };
    }

    let finalCmd = cmd;
    let finalArgs = [...args];

    // Privilege Elevation: Automatically use sudo for privileged commands if not already root
    if ((SystemExecutor.PRIVILEGED_COMMANDS.includes(baseCmd) || SystemExecutor.PRIVILEGED_COMMANDS.includes(cmd)) && Deno.uid() !== 0) {
        finalCmd = "sudo";
        finalArgs = ["-n", cmd, ...args];
    }

    let timeoutId: any;
    let child: Deno.ChildProcess | undefined;

    try {
      const command = new Deno.Command(finalCmd, {
        args: finalArgs,
        stdout: "piped",
        stderr: "piped",
      });

      child = command.spawn();

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          if (child) {
            try {
              child.kill();
            } catch {
              // Ignore
            }
          }
          reject(new Error(`Command '${cmd} ${args.join(" ")}' timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const result = await Promise.race([
        child.output(),
        timeoutPromise
      ]);

      if (timeoutId) clearTimeout(timeoutId);

      const { code, stdout, stderr } = result;
      const stdoutStr = new TextDecoder().decode(stdout);
      const stderrStr = new TextDecoder().decode(stderr);

      let data;
      if (stdoutStr.trim().startsWith("{") || stdoutStr.trim().startsWith("[")) {
        try {
          data = JSON.parse(stdoutStr);
        } catch {
          // Not valid JSON
        }
      }

      return {
        success: code === 0,
        stdout: stdoutStr,
        stderr: stderrStr,
        data,
      };
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      return {
        success: false,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
