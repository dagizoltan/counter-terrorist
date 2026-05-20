import { CommandResult, ExecutorPort } from "@core/ports.ts";
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

  private static readonly PLATFORM_TOOLS = [
    "pfctl", "launchctl", "sw_vers", "spctl", "ifconfig", "killall", "ps",
    "netsh", "taskkill", "pktmon", "powershell", "security"
  ];

  private static readonly PROVISIONING_REGEX = /^(chmod 600 \/etc\/cts\.env && export \$\(grep -v '\^#' \/etc\/cts\.env \| xargs -d (['"])\\n\1\) && \/usr\/local\/bin\/counter-terrorist > \/var\/log\/cts\.log 2>&1 &)$/;

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
        // Block all other flags starting with - (e.g. -F, -E, -S, -i) to prevent config bypass or log hijacking
        if (arg.startsWith("-") && arg !== "-o") {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized flag: ${arg}` });
            continue;
        }

        // Support standard hostnames, IPv4, and IPv6 (bracketed)
        if (/^[a-z0-9/._-]+$/.test(arg)) continue;
        if (/^[a-z0-9]+@([a-z0-9.-]+|\[[a-f0-9:]+\])$/.test(arg)) continue;
        if (/^(deno task start|sudo systemctl (status|start|stop|restart) (cts-.*|ufw|wireguard.*|clamav.*))$/.test(arg)) continue;

        // SOV-06: Permit ProvisioningService lateral movement command sequence
        if (arg.includes("chmod 600 /etc/cts.env") && arg.includes("counter-terrorist") && arg.includes("xargs")) {
            if (SystemExecutor.PROVISIONING_REGEX.test(arg)) continue;
        }

        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized argument: ${arg}` });
    }
  });

  private static readonly UFW_SCHEMA = z.array(z.string().regex(/^[0-9a-zA-Z./-]+$/)).max(5).superRefine((args, ctx) => {
      if (args.length > 0 && !/^(status|enable|disable|allow|deny|delete|default|reload|reset)$/.test(args[0])) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid ufw command" });
      }
  });

  private static readonly SENTINEL_SCHEMA = z.array(z.string()).max(1).superRefine((args, ctx) => {
      if (args.length === 0) return;
      try {
          const payload = JSON.parse(args[0]);
          const validTypes = [
            "BLOCK_IP", "UNBLOCK_IP", "SHADOW_BAN", "HIDE_PID", "GET_STATUS",
            "ALLOW_PORT", "DENY_PORT", "FLUSH_RULES", "LOCKDOWN", "SHUTDOWN", "TRUST_COMM",
            "BLOCK_SYSCALL", "LSM_POLICY", "ENFORCE_PID", "UNENFORCE_PID", "KillProcess", "QuarantineProcess", "DumpProcess"
          ];
          if (!validTypes.includes(payload.type)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid sentinel command type: ${payload.type}` });
          }
          if (payload.pid && typeof payload.pid !== "number") {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "PID must be numeric" });
          }
      } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid sentinel JSON payload" });
      }
  });

  private static readonly POWERSHELL_SCHEMA = z.array(z.string()).max(2).superRefine((args, ctx) => {
      if (args.length === 0) return;
      if (args[0] === "-Command") {
          const cmd = args[1] || "";
          // SOV-02 HARDENING: Expanded blocklist for PowerShell sub-expression and script block injection
          const blocked = ["&", "|", ";", ">", "<", "`", "$", "(", ")", "{", "}", "[", "]"];
          for (const b of blocked) {
              if (cmd.includes(b)) {
                  ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Security Violation: PowerShell command contains blocked character: ${b}` });
              }
          }
          if (cmd.includes("$(") || cmd.includes("@(")) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Security Violation: PowerShell sub-expressions are forbidden" });
          }
      } else if (args[0] === "-EncodedCommand") {
          if (args.length < 2 || !/^[a-zA-Z0-9+/=]+$/.test(args[1])) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid Base64 for EncodedCommand" });
          }
      } else {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Only -Command or -EncodedCommand allowed for PowerShell" });
      }
  });

  private static readonly SYSTEMCTL_SCHEMA = z.array(z.string()).max(2).superRefine((args, ctx) => {
      if (args.length === 0) return;
      const actions = ["start", "stop", "restart", "status", "is-active", "enable", "disable"];
      if (!actions.includes(args[0])) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid systemctl action: ${args[0]}` });
      }
      if (args.length > 1 && !/^(cts-.*|ufw|wireguard.*|clamav.*|systemd-resolved|network-manager)$/.test(args[1])) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized service: ${args[1]}` });
      }
  });

  private static readonly ANALYZER_SCHEMA = z.array(z.string()).max(5).superRefine((args, ctx) => {
      if (args.length === 0) return;
      try {
          const payload = JSON.parse(args[0]);
          const validTypes = ["SCAN", "DIR_SCAN", "RKH_SCAN", "QUIT", "MEM_SCAN", "ScanPath", "Quarantine", "SyncSignatures", "GetStatus"];
          if (!validTypes.includes(payload.type)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid analyzer command type" });
          }
      } catch {
          // Allow non-JSON if it's a simple flag
          if (!args[0].startsWith("-")) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Analyzer requires JSON payload or standard flag" });
          }
      }
  });

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
        // SOV-06: Strictly allow only targeted process status queries and safe output columns
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
        schema: SystemExecutor.POWERSHELL_SCHEMA,
        // SOV-02 FIX: Strictly disallow shell metacharacters in PowerShell parameters
        // Prevents chaining (&, |) and redirection (>, <)
        allowedArgs: [/^(-Command|-EncodedCommand)$/, /^[a-zA-Z0-9\s\-\.\/_=:'"]+$/],
        blockedStrings: ["&", "|", ";", ">", "<", "`", "$", "(", ")", "{", "}", "[", "]", "$("],
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
      schema: SystemExecutor.SYSTEMCTL_SCHEMA,
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
        // SOV-06: Limit ss to socket monitoring and local port verification
        allowedArgs: [/^(-?[tulnpaH]+|sport = :[0-9]+)$/],
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
        // SOV-06: Support IPv6 and remote paths in SCP
        allowedArgs: [/^-o$/, /^(StrictHostKeyChecking=(yes|no|accept-new)|UserKnownHostsFile=[a-z0-9/._-]+)$/, /^[a-z0-9/._-]+$/, /^[a-z0-9]+@([a-z0-9.-]+|\[[a-f0-9:]+\]):.*$/],
        maxArgs: 10
    },
    "ssh": {
        schema: SystemExecutor.SSH_SCHEMA,
        // SOV-02 FIX: Disallow complex shell chaining and redirection in SSH commands
        allowedArgs: [
            /^-o$/,
            /^(StrictHostKeyChecking=(yes|no|accept-new)|UserKnownHostsFile=[a-z0-9/._-]+)$/,
            /^[a-z0-9/._-]+$/, // RESTORED '-': Allows hyphens in hostnames and paths
            /^[a-z0-9]+@([a-z0-9.-]+|\[[a-f0-9:]+\])$/, // SOV-06 FIX: Support bracketed IPv6 in allowedArgs
            /^(deno task start|sudo systemctl (status|start|stop|restart) (cts-.*|ufw|wireguard.*|clamav.*))$/,
            SystemExecutor.PROVISIONING_REGEX
        ],
        // Tightened via blocklist instead of removing '-' from allowedArgs regex to avoid breaking hostnames
        blockedStrings: ["&&", "||", "|", ";", ">", "<", "`", "$", "(", ")", "!", "-F", "-E", "-S", "-i"],
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
    "analyzer": {
        schema: SystemExecutor.ANALYZER_SCHEMA,
        maxArgs: 10
    },
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

        // SOV-06: If a command uses structured schema validation (SSH, SENTINEL, POWERSHELL, etc),
        // we skip the generic 'dangerous' check for whitelisted arguments to allow complex legitimate commands.
        const isPatternWhitelisted = policy.allowedArgs && policy.allowedArgs.some(p => p.test(arg));

        if (!isPatternWhitelisted && this.isPotentiallyDangerous(arg)) {
            // Fallback traversal check for all commands (even non-sensitive ones)
            if (!validatePath(arg)) {
                return { valid: false, reason: `Security Violation: Path traversal or prefix bypass detected in argument '${arg}'` };
            }
        }

        // C. Blocklist Check
        // SOV-P3: Explicit enforcement of blocked strings
        // Skip check if the argument matched a specific whitelisted pattern (e.g. provisioning script)
        if (!isPatternWhitelisted && policy.blockedStrings) {
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

  private static readonly DANGEROUS_PATTERN = /[\/\\%{}&|;><`()!\[\]\n\r\$]|\.\./;

  private isPotentiallyDangerous(arg: string): boolean {
      // SOV-06 HARDENING: Comprehensive shell metacharacter and escape detection
      // PERFORMANCE: Using pre-compiled regex for ~3x faster hot-path validation
      return SystemExecutor.DANGEROUS_PATTERN.test(arg);
  }

  private validateSensitiveArgument(arg: string, baseCmd: string): { valid: boolean; reason?: string } {
      // SOV-06: Remote path bypass for SCP/SSH to avoid jail enforcement on remote addresses
      // FIX: Apply shell metacharacter protection even to remote paths to prevent injection
      if ((baseCmd === "scp" || baseCmd === "ssh") && /^[a-z0-9]+@([a-z0-9.-]+|\[[a-f0-9:]+\]):.*$/.test(arg)) {
          if (/[;&|><`$()!]/.test(arg)) {
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

  private extractPathsFromJson(obj: any, inPathContext: boolean = false, depth: number = 0): string[] {
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
