import { CommandResult } from "@core/ports.ts";
import * as path from "@std/path";

/**
 * Security Policy for whitelisted commands.
 * Defines regex patterns for allowed arguments to prevent indirect privilege escalation.
 */
interface CommandPolicy {
  allowedArgs?: RegExp[];
  maxArgs?: number;
  blockedStrings?: string[];
}

/**
 * Executes one-off system commands with strict security validation.
 */
export class SystemExecutor {
  private static readonly WHITELISTED_COMMANDS = [
    "clamscan", "mkdir", "mv", "chmod", "ls", "sha256sum", "bash", "systemctl",
    "crontab", "which", "where", "powershell", "netsh", "taskkill", "tc", "kill",
    "cp", "gcore", "ufw", "tpm2_nvdefine", "tpm2_nvwrite", "tpm2_nvread",
    "tpm2_pcrread", "wg-quick", "wg", "launchctl", "system_profiler", "ss", "cargo",
    "unshare", "iptables", "tpm2_sign", "tpm2_hash", "sudo", "tcpdump", "rkhunter", "sw_vers", "openssl",
    "scanner", "blocker", "honeypot", "pcap", "ebpf", "fim", "vpn"
  ];

  private static readonly PRIVILEGED_COMMANDS = [
    "ufw", "tc", "iptables", "wg-quick", "wg", "gcore", "unshare", "systemctl", 
    "tpm2_nvdefine", "tpm2_nvwrite", "tpm2_nvread", "tpm2_pcrread", "tcpdump", "setcap"
  ];

  /**
   * Granular policies for sensitive commands.
   */
  private static readonly COMMAND_POLICIES: Record<string, CommandPolicy> = {
    "systemctl": {
      allowedArgs: [/^(start|stop|restart|status|is-active)$/, /^(cts-.*|ufw|wireguard.*|clamav.*)$/],
      maxArgs: 2
    },
    "ufw": {
      allowedArgs: [/^(status|enable|disable|allow|deny|delete|default|reload|reset)$/, /^[0-9a-zA-Z./]+$/],
      maxArgs: 5
    },
    "kill": {
      allowedArgs: [/^-?[0-9]+$/, /^[0-9]+$/],
      maxArgs: 2
    },
    "chmod": {
      allowedArgs: [/^[0-7]{3,4}$/, /^\.\/volume\/.*$/],
      maxArgs: 2
    },
    "mkdir": {
      allowedArgs: [/^-p$/, /^\.\/volume\/.*$/],
      maxArgs: 2
    },
    "bash": {
      allowedArgs: [/^\.\/scripts\/[a-z0-9_-]+\.sh$/], 
      maxArgs: 1
    },
    "tcpdump": {
      allowedArgs: [/^-i$/, /^[a-z0-9]+$/, /^-w$/, /^\.\/volume\/storage\/captures\/[a-zA-Z0-9._-]+\.pcap$/, /^-G$/, /^[0-9]+$/, /^-W$/, /^1$/],
      maxArgs: 8
    },
    "powershell": {
      allowedArgs: [/^-Command$/, /^([A-Za-z0-9_-]+ VPNConnection -Name '[a-zA-Z0-9_-]+'|Get-VpnConnection)$/],
      maxArgs: 2
    },
    "ls": {
      allowedArgs: [/^-la?$/, /^\.\/volume\/.*$/],
      maxArgs: 2
    },
    "cp": {
      allowedArgs: [/^\.\/volume\/.*$/, /^\.\/volume\/.*$/],
      maxArgs: 2
    },
    "mv": {
      allowedArgs: [/^\.\/volume\/.*$/, /^\.\/volume\/.*$/],
      maxArgs: 2
    },
    "sw_vers": {
      allowedArgs: [/^-productVersion$/],
      maxArgs: 1
    },
    "which": {
      allowedArgs: [/^[a-z0-9-]+$/],
      maxArgs: 1
    },
    "sudo": {
      allowedArgs: [/^-n$/, /^(setcap|ufw|tc|iptables|systemctl)$/, /.+/],
      maxArgs: 10
    },
    "openssl": {
      allowedArgs: [/^(dgst|genrsa|rsa|req|x509)$/, /^-sha256$/, /^(-sign|-r)$/, /.+/, /^-out$/, /.+/, /.+/],
      maxArgs: 10
    },
    "cargo": {
      allowedArgs: [/^(build|run|test)$/, /^--release$/, /^--package$/, /^[a-z0-9_-]+$/],
      maxArgs: 5
    },
    "scanner": { maxArgs: 10 },
    "blocker": { maxArgs: 10 },
    "honeypot": { maxArgs: 10 },
    "pcap": { maxArgs: 10 },
    "ebpf": { 
      allowedArgs: [/^\{.*"type":\s*"(BLOCK_IP|UNBLOCK_IP|SHADOW_BAN|HIDE_PID|GET_STATUS|ALLOW_PORT|DENY_PORT|FLUSH_RULES|LOCKDOWN|SHUTDOWN|TRUST_COMM)".*\}$/],
      maxArgs: 1 
    },
    "fim": { maxArgs: 10 },
    "vpn": { maxArgs: 10 }
  };


  /**
   * Prevents Directory Traversal by normalizing and checking for '..' or absolute paths.
   */
  private validatePath(filePath: string): boolean {
    // Basic string check for obvious traversal
    if (filePath.includes("..")) {
        return false;
    }

    const normalized = path.normalize(filePath);
    // After normalization, ensure it doesn't escape
    if (normalized.includes("..")) {
        return false;
    }
    
    return true;
  }

  private validateArguments(cmd: string, args: string[]): { valid: boolean; reason?: string } {
    const baseCmd = path.basename(cmd);
    const policy = SystemExecutor.COMMAND_POLICIES[baseCmd];
    
    // SECURITY: Deny by default if no policy exists for a whitelisted command
    if (!policy) {
      return { valid: false, reason: `No security policy defined for whitelisted command '${baseCmd}'. Blocking for safety.` };
    }

    if (policy.maxArgs !== undefined && args.length > policy.maxArgs) {
      return { valid: false, reason: `Too many arguments for '${baseCmd}' (max: ${policy.maxArgs})` };
    }

    if (policy.allowedArgs) {
      for (let i = 0; i < args.length; i++) {
        const pattern = policy.allowedArgs[i];
        if (pattern) {
          if (!pattern.test(args[i])) {
            return { valid: false, reason: `Argument '${args[i]}' at index ${i} is not allowed for '${baseCmd}'` };
          }
          
          // If the pattern looks like a path (starts with ./volume/ or ./scripts/), validate it against traversal
          if (args[i].startsWith("./volume/") || args[i].startsWith("./scripts/")) {
            if (!this.validatePath(args[i])) {
              return { valid: false, reason: `Security Violation: Path traversal detected in argument '${args[i]}'` };
            }
          }
        }
      }
    }

    if (policy.blockedStrings) {
      for (const arg of args) {
        for (const blocked of policy.blockedStrings) {
          if (arg.includes(blocked)) {
            return { valid: false, reason: `Argument contains blocked sequence: '${blocked}'` };
          }
        }
      }
    }

    return { valid: true };
  }

  async executeAsync(cmd: string, args: string[] = []): Promise<void> {
    const baseCmd = path.basename(cmd);
    if (!SystemExecutor.WHITELISTED_COMMANDS.includes(baseCmd)) {
        throw new Error(`Security Violation: Command '${baseCmd}' is not in the system whitelist.`);
    }

    const validation = this.validateArguments(cmd, args);
    if (!validation.valid) {
        throw new Error(`Security Violation: ${validation.reason}`);
    }

    let finalCmd = cmd;
    let finalArgs = [...args];

    if (SystemExecutor.PRIVILEGED_COMMANDS.includes(baseCmd) && Deno.uid() !== 0) {
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
  }

  async execute(cmd: string, args: string[] = [], timeoutMs: number = 30000): Promise<CommandResult> {
    const baseCmd = path.basename(cmd);
    // Security: Whitelist validation
    if (!SystemExecutor.WHITELISTED_COMMANDS.includes(baseCmd)) {
        return {
            success: false,
            stdout: "",
            stderr: `Security Violation: Command '${baseCmd}' is not in the system whitelist.`,
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
    if (SystemExecutor.PRIVILEGED_COMMANDS.includes(baseCmd) && Deno.uid() !== 0) {
        finalCmd = "sudo";
        finalArgs = ["-n", cmd, ...args];
    }

    let timeoutId: number | undefined;
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

