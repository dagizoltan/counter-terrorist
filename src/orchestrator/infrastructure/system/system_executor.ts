import { CommandResult } from "@core/ports.ts";
import * as path from "@std/path";
import { validatePath } from "./validation.ts";
import { z } from "zod";

/**
 * Security Policy for whitelisted commands.
 * Defines regex patterns for allowed arguments to prevent indirect privilege escalation.
 */
interface CommandPolicy {
  allowedArgs?: RegExp[];
  maxArgs?: number;
  blockedStrings?: string[];
  schema?: z.ZodSchema<string[]>;
}

/**
 * Executes one-off system commands with strict security validation.
 */
export class SystemExecutor {
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

  private static readonly PLATFORM_TOOLS = [
    "pfctl", "launchctl", "sw_vers", "spctl", "ifconfig", "killall", "ps",
    "netsh", "taskkill", "pktmon", "powershell", "security"
  ];

  private static readonly SSH_SCHEMA = z.array(z.string()).max(10).superRefine((args, ctx) => {
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "-o") {
            const next = args[i+1];
            if (!next || !/^(StrictHostKeyChecking=(yes|no|accept-new)|UserKnownHostsFile=[a-z0-9/._-]+)$/.test(next)) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid -o value for ssh" });
            }
            i++;
            continue;
        }
        if (/^[a-z0-9/._-]+$/.test(arg)) continue;
        if (/^[a-z0-9]+@[a-z0-9.-]+$/.test(arg)) continue;
        if (/^(deno task start|sudo systemctl (status|start|stop|restart) (cts-.*|ufw|wireguard.*|clamav.*))$/.test(arg)) continue;

        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized argument: ${arg}` });
    }
  });

  private static readonly UFW_SCHEMA = z.array(z.string().regex(/^[0-9a-zA-Z./-]+$/)).max(5).superRefine((args, ctx) => {
      if (args.length > 0 && !/^(status|enable|disable|allow|deny|delete|default|reload|reset)$/.test(args[0])) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid ufw command" });
      }
  });

  private static readonly SENTINEL_SCHEMA = z.array(z.string()).max(1).refine(args => {
      if (args.length === 0) return true;
      try {
          const payload = JSON.parse(args[0]);
          return /^(BLOCK_IP|UNBLOCK_IP|SHADOW_BAN|HIDE_PID|GET_STATUS|ALLOW_PORT|DENY_PORT|FLUSH_RULES|LOCKDOWN|SHUTDOWN|TRUST_COMM|BLOCK_SYSCALL|LSM_POLICY|ENFORCE_PID|UNENFORCE_PID|KillProcess|QuarantineProcess|DumpProcess)$/.test(payload.type);
      } catch {
          return false;
      }
  }, { message: "Invalid sentinel JSON payload" });

  /**
   * Granular policies for sensitive commands.
   */
  private static readonly COMMAND_POLICIES: Record<string, CommandPolicy> = {
    "pfctl": {
        allowedArgs: [/^(-t|-T|-s|-e|-F)$/, /^[a-z_]+$/, /^(add|delete|info|all)$/, /^[0-9a-fA-F.:]+$/],
        maxArgs: 6
    },
    "launchctl": {
        allowedArgs: [/^(list|load|unload|start|stop)$/, /^[a-zA-Z0-9\.\/_ \-]+$/],
        maxArgs: 2
    },
    "spctl": {
        allowedArgs: [/^--assess$/, /^[a-zA-Z0-9.\/_ \-]+$/],
        maxArgs: 2
    },
    "ps": {
        allowedArgs: [/^(-p|-ax|-o)$/, /^[0-9,a-z]+$/],
        maxArgs: 4
    },
    "killall": {
        allowedArgs: [/^[a-z0-9-]+$/],
        maxArgs: 1
    },
    "ifconfig": {
        allowedArgs: [/^[a-z0-9]+$/],
        maxArgs: 1
    },
    "pktmon": {
        allowedArgs: [/^(start|stop)$/, /^--etw$/, /^-p$/, /^\.\/volume\/.*\.pcap$/],
        maxArgs: 4
    },
    "powershell": {
        // SOV-02 FIX: Strictly disallow shell metacharacters in PowerShell parameters
        // Prevents chaining (&, |) and redirection (>, <)
        allowedArgs: [/^-Command$/, /^[a-zA-Z0-9\s\-\.\/_=:'"]+$/],
        blockedStrings: ["&", "|", ";", ">", "<", "`", "$", "(", ")"],
        maxArgs: 2
    },
    "netsh": {
        allowedArgs: [/^(advfirewall|firewall|show|set|add|delete|rule|allprofiles|state)$/, /^[a-zA-Z0-9\s\-\.\/_=:]+$/],
        maxArgs: 10
    },
    "taskkill": {
        allowedArgs: [/^\/F$/, /^\/PID$/, /^[0-9]+$/],
        maxArgs: 3
    },
    "systemctl": {
      allowedArgs: [/^(start|stop|restart|status|is-active)$/, /^(cts-.*|ufw|wireguard.*|clamav.*)$/],
      maxArgs: 2
    },
    "ufw": {
      schema: SystemExecutor.UFW_SCHEMA,
      allowedArgs: [/^(status|enable|disable|allow|deny|delete|default|reload|reset)$/, /^[0-9a-zA-Z./]+$/],
      maxArgs: 5
    },
    "kill": {
      allowedArgs: [/^-?[0-9]+$/, /^[0-9]+$/],
      maxArgs: 2
    },
    "chmod": {
      allowedArgs: [/^[0-7]{3,4}$/, /^(\.\/volume\/.*|\/etc\/systemd\/system\/cts-.*)$/],
      maxArgs: 2
    },
    "mkdir": {
      allowedArgs: [/^-p$/, /^(\.\/volume\/.*|\/var\/lib\/cts\/.*)$/],
      maxArgs: 2
    },
    "tcpdump": {
      allowedArgs: [/^-i$/, /^[a-z0-9]+$/, /^-w$/, /^\.\/volume\/storage\/captures\/[a-zA-Z0-9._-]+\.pcap$/, /^-G$/, /^[0-9]+$/, /^-W$/, /^1$/],
      maxArgs: 8
    },
    "ls": {
      allowedArgs: [/^-la?$/, /^(\.\/volume\/.*|\/var\/lib\/cts\/.*)$/],
      maxArgs: 2
    },
    "cp": {
      allowedArgs: [/^(\.\/volume\/.*|\/var\/lib\/cts\/.*)$/, /^(\.\/volume\/.*|\/var\/lib\/cts\/.*|\/etc\/systemd\/system\/cts-.*)$/],
      maxArgs: 2
    },
    "mv": {
      allowedArgs: [/^(\.\/volume\/.*|\/var\/lib\/cts\/.*)$/, /^(\.\/volume\/.*|\/var\/lib\/cts\/.*|\/etc\/systemd\/system\/cts-.*)$/],
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
    "clamscan": {
        allowedArgs: [/^(-r|--quiet|--no-summary)$/, /^(\.\/volume\/.*|\/var\/lib\/cts\/.*)$/],
        maxArgs: 5
    },
    "sha256sum": {
        allowedArgs: [/^(\.\/volume\/.*|\/var\/lib\/cts\/.*)$/],
        maxArgs: 1
    },
    "crontab": {
        allowedArgs: [/^-l$/, /^-u$/, /^[a-z0-9-]+$/],
        maxArgs: 3
    },
    "where": {
        allowedArgs: [/^[a-z0-9-]+$/],
        maxArgs: 1
    },
    "tc": {
        allowedArgs: [/^(qdisc|class|filter|add|delete|dev|root|handle|parent|classid|htb|rate|ceil|prio|u32|match|ip|src|flowid|default)$/, /^[a-zA-Z0-9\.:\/_\-]+$/, /^[0-9]+(kbps|mbps|gbps|ms|s)$/],
        maxArgs: 20
    },
    "gcore": {
        allowedArgs: [/^-o$/, /^(\.\/volume\/.*)$/, /^[0-9]+$/],
        maxArgs: 3
    },
    "tpm2_nvdefine": {
        allowedArgs: [/^0x[0-9a-fA-F]+$/, /^-s$/, /^[0-9]+$/],
        maxArgs: 3
    },
    "tpm2_nvwrite": {
        allowedArgs: [/^0x[0-9a-fA-F]+$/, /^-i$/, /^[a-zA-Z0-9.\/_=+\-]+$/],
        maxArgs: 3
    },
    "tpm2_nvread": {
        allowedArgs: [/^0x[0-9a-fA-F]+$/],
        maxArgs: 1
    },
    "tpm2_pcrread": {
        allowedArgs: [/^sha256:[0-9,]+$/],
        maxArgs: 1
    },
    "wg-quick": {
        allowedArgs: [/^(up|down)$/, /^(all|[a-z0-9]+)$/],
        maxArgs: 2
    },
    "wg": {
        allowedArgs: [/^(show|set|genkey|pubkey)$/, /^[a-z0-9]+$/, /^[A-Za-z0-9+/=]+$/],
        maxArgs: 10
    },
    "system_profiler": {
        allowedArgs: [/^[A-Z][a-zA-Z0-9]+DataType$/],
        maxArgs: 5
    },
    "ss": {
        allowedArgs: [/^-?[tulnpa]+$/],
        maxArgs: 2
    },
    "unshare": {
        allowedArgs: [/^--[a-z]+$/, /^[a-z0-9/._-]+$/],
        maxArgs: 10
    },
    "iptables": {
        allowedArgs: [/^(-A|-D|-I|-L|-F|-X|-P|-N|--append|--delete|--insert|--list|--flush|--new-chain|--policy)$/, /^[A-Z]+$/, /^[a-zA-Z0-9\.\+\-_]+$/, /^-p$/, /^(tcp|udp|icmp)$/, /^--dport$/, /^[0-9]+$/, /^-j$/, /^(ACCEPT|DROP|REJECT|LOG)$/, /^[0-9a-fA-F\.:\/]+$/],
        maxArgs: 20
    },
    "tpm2_sign": {
        allowedArgs: [/^-c$/, /^[0-9a-fx]+$/, /^-g$/, /^(sha256|sha384)$/, /^-o$/, /^[a-z0-9/._-]+$/],
        maxArgs: 10
    },
    "tpm2_hash": {
        allowedArgs: [/^-g$/, /^(sha256|sha384)$/, /^-o$/, /^[a-z0-9/._-]+$/],
        maxArgs: 10
    },
    "rkhunter": {
        allowedArgs: [/^--check$/, /^--sk$/, /^--nocolor$/, /^--report-warnings-only$/],
        maxArgs: 5
    },
    "security": {
        allowedArgs: [/^(cms|find-identity|unlock-keychain)$/, /^-?[a-zA-Z]+$/, /^[a-zA-Z0-9/._-]+$/],
        maxArgs: 10
    },
    "ip": {
        allowedArgs: [/^(addr|link|route|neigh|show|dev|default|add|del|list)$/, /^[a-zA-Z0-9\._\-]+$/, /^[0-9a-fA-F\.:\/]+$/],
        maxArgs: 10
    },
    "sysctl": {
        allowedArgs: [/^(-w|-n)$/, /^[a-z0-9._-]+(=[0-9]+)?$/],
        maxArgs: 2
    },
    "nmcli": {
        allowedArgs: [/^(-t|-f)$/, /^[A-Z,]+$/, /^(dev|wifi|list)$/],
        maxArgs: 10
    },
    "ping": {
        allowedArgs: [/^-c$/, /^[0-9]+$/, /^-W$/, /^[0-9]+$/, /^-p$/, /^[0-9a-fA-F]+$/, /^[a-z0-9.-]+$/, /^[0-9a-fA-F.:]+$/],
        maxArgs: 10
    },
    "host": {
        allowedArgs: [/^-t$/, /^(A|AAAA|TXT|MX)$/, /^[a-zA-Z0-9.-]+$/],
        maxArgs: 3
    },
    "scp": {
        allowedArgs: [/^-o$/, /^(StrictHostKeyChecking=(yes|no|accept-new)|UserKnownHostsFile=[a-z0-9/._-]+)$/, /^[a-z0-9/._-]+$/, /^[a-z0-9]+@[a-z0-9.-]+:.*$/],
        maxArgs: 10
    },
    "ssh": {
        schema: SystemExecutor.SSH_SCHEMA,
        // SOV-02 FIX: Disallow complex shell chaining and redirection in SSH commands
        allowedArgs: [
            /^-o$/,
            /^(StrictHostKeyChecking=(yes|no|accept-new)|UserKnownHostsFile=[a-z0-9/._-]+)$/,
            /^[a-z0-9/._-]+$/,
            /^[a-z0-9]+@[a-z0-9.-]+$/,
            /^(deno task start|sudo systemctl (status|start|stop|restart) (cts-.*|ufw|wireguard.*|clamav.*))$/
        ],
        blockedStrings: ["&&", "||", "|", ";", ">", "<", "`", "$", "(", ")", "!"],
        maxArgs: 10
    },
    "/var/lib/cts/scripts/install_service.sh": {
      allowedArgs: [/^\/etc\/systemd\/system\/cts-?.*\.service$/, /^[a-zA-Z0-9.\/_ \-]+$/],
      maxArgs: 2
    },
    "/var/lib/cts/scripts/update_crontab.sh": {
      allowedArgs: [/^[a-zA-Z0-9.\/_ \-\*]+$/],
      maxArgs: 1
    },
    "/var/lib/cts/scripts/update_comm.sh": {
      allowedArgs: [/^\[[a-z0-9/:]+\]$/, /^[0-9]+$/],
      maxArgs: 2
    },
    "/var/lib/cts/scripts/secure_spawn.sh": {
      allowedArgs: [/^[a-z0-9-]+$/, /^[a-zA-Z0-9./_-]+$/, /^[a-z0-9,._+]*$/],
      maxArgs: 3
    },
    "openssl": {
      allowedArgs: [/^(dgst|genrsa|rsa|req|x509)$/, /^-sha256$/, /^(-sign|-r)$/, /^-out$/, /^[a-zA-Z0-9./_-]+(\.(bin|pem|crt|key|csr|pub|sig))?$/],
      maxArgs: 10
    },
    "analyzer": { maxArgs: 10 },
    "enforcer": { maxArgs: 10 },
    "decoy": { maxArgs: 10 },
    "netcap": { maxArgs: 10 },
    "ebpf": {
      allowedArgs: [/^\{.*"type":\s*"(BLOCK_IP|UNBLOCK_IP|SHADOW_BAN|HIDE_PID|GET_STATUS|ALLOW_PORT|DENY_PORT|FLUSH_RULES|LOCKDOWN|SHUTDOWN|TRUST_COMM|BLOCK_SYSCALL|LSM_POLICY|ENFORCE_PID|UNENFORCE_PID|KillProcess|QuarantineProcess|DumpProcess)".*\}$/],
      maxArgs: 1
    },
    "sentinel": { 
      schema: SystemExecutor.SENTINEL_SCHEMA,
      allowedArgs: [/^\{.*"type":\s*"(BLOCK_IP|UNBLOCK_IP|SHADOW_BAN|HIDE_PID|GET_STATUS|ALLOW_PORT|DENY_PORT|FLUSH_RULES|LOCKDOWN|SHUTDOWN|TRUST_COMM|BLOCK_SYSCALL|LSM_POLICY|ENFORCE_PID|UNENFORCE_PID|KillProcess|QuarantineProcess|DumpProcess)".*\}$/],
      maxArgs: 1 
    },
    "watchfile": { maxArgs: 10 },
    "tunnel": { maxArgs: 10 },
    "sentinel-darwin": { maxArgs: 10 },
    "telemetry-win": { maxArgs: 10 },
    "enforcer-win": { maxArgs: 10 }
  };



  private static readonly PATH_SENSITIVE_COMMANDS = [
    "openssl", "mkdir", "cp", "mv", "chmod", "ls", "sha256sum",
    "sentinel", "ebpf", "analyzer", "watchfile", "netcap"
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
    const policy = SystemExecutor.COMMAND_POLICIES[cmd] || SystemExecutor.COMMAND_POLICIES[baseCmd];
    
    // 1. Policy Existence Check
    if (!policy) {
      return { valid: false, reason: `No security policy defined for whitelisted command '${cmd}'. Blocking for safety.` };
    }

    // 2. Structured Schema Validation (Priority)
    if (policy.schema) {
        const result = policy.schema.safeParse(args);
        if (!result.success) {
            return {
                valid: false,
                reason: `Structured validation failed for '${baseCmd}': ${result.error.issues.map(e => e.message).join(", ")}`
            };
        }
    }

    // 3. Argument Length Check
    if (policy.maxArgs !== undefined && args.length > policy.maxArgs) {
      return { valid: false, reason: `Too many arguments for '${baseCmd}' (max: ${policy.maxArgs})` };
    }

    // 4. Command Context
    const isPathSensitive = SystemExecutor.PATH_SENSITIVE_COMMANDS.includes(baseCmd) ||
                            SystemExecutor.PATH_SENSITIVE_COMMANDS.includes(cmd);

    // 5. Individual Argument Validation
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        // A. Pattern Matching (Regex Whitelist)
        if (policy.allowedArgs) {
            const matchesAny = policy.allowedArgs.some(pattern => pattern.test(arg));
            if (!matchesAny) {
                return { valid: false, reason: `Argument '${arg}' at index ${i} is not allowed for '${baseCmd}' (no matching pattern)` };
            }
        }

        // B. Structured Content Validation (Jail Enforcement)
        if (isPathSensitive) {
            const validation = this.validateSensitiveArgument(arg, baseCmd);
            if (!validation.valid) return validation;
        }

        if (this.isPotentiallyDangerous(arg)) {
            // Fallback traversal check for all commands (even non-sensitive ones)
            if (!validatePath(arg)) {
                return { valid: false, reason: `Security Violation: Path traversal or prefix bypass detected in argument '${arg}'` };
            }
        }

        // C. Blocklist Check
        // SOV-P3: Explicit enforcement of blocked strings
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
    }

    return { valid: true };
  }

  private isPotentiallyDangerous(arg: string): boolean {
      return arg.includes("/") || arg.includes("\\") || arg.includes("..") ||
             arg.includes("%") || arg.includes("{") || arg.includes("$") ||
             arg.includes("&") || arg.includes("|") || arg.includes(";") ||
             arg.includes(">") || arg.includes("<") || arg.includes("`") ||
             arg.includes("(") || arg.includes(")");
  }

  private validateSensitiveArgument(arg: string, baseCmd: string): { valid: boolean; reason?: string } {
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
                  if (!validatePath(p, SystemExecutor.SYSTEM_JAILS)) {
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
          if (!validatePath(arg, SystemExecutor.SYSTEM_JAILS)) {
              return { valid: false, reason: `Security Violation: Unauthorized path or traversal detected in argument '${arg}' for sensitive command '${baseCmd}'` };
          }
      } else {
          if (!validatePath(arg)) {
              return { valid: false, reason: `Security Violation: Path traversal detected in argument '${arg}' for sensitive command '${baseCmd}'` };
          }
      }

      return { valid: true };
  }

  private extractPathsFromJson(obj: any): string[] {
      const paths: string[] = [];
      if (!obj || typeof obj !== "object") return paths;

      const pathKeys = ["path", "target", "exe_path", "log_path", "source", "destination", "output"];

      for (const [key, value] of Object.entries(obj)) {
          if (pathKeys.includes(key) && typeof value === "string") {
              paths.push(value);
          } else if (key === "paths" && Array.isArray(value)) {
              paths.push(...value.filter(v => typeof v === "string"));
          } else if (typeof value === "object") {
              paths.push(...this.extractPathsFromJson(value));
          }
      }
      return paths;
  }

  async executeAsync(cmd: string, args: string[] = []): Promise<void> {
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
  }

  async execute(cmd: string, args: string[] = [], timeoutMs: number = 30000): Promise<CommandResult> {
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
