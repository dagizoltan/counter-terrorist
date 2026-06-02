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
        if (arg.startsWith("-") && arg !== "-o") {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized flag: ${arg}` });
            continue;
        }

        if (/^[a-z0-9/._-]+$/.test(arg)) continue;
        if (/^[a-z0-9]+@([a-z0-9.-]+|\[[a-f0-9:]+\])$/.test(arg)) continue;
        if (/^(deno task start|sudo systemctl (status|start|stop|restart) (cts-.*|ufw|wireguard.*|clamav.*))$/.test(arg)) continue;

        if (arg.includes("chmod 600 /etc/cts.env") && arg.includes("counter-terrorist") && arg.includes("xargs")) {
            if (SystemExecutor.PROVISIONING_REGEX.test(arg)) continue;
        }

        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized argument: ${arg}` });
    }
  });

  private static readonly SCP_SCHEMA = z.array(z.string()).max(10).superRefine((args, ctx) => {
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "-o") {
            const next = args[i+1];
            if (!next || !/^(StrictHostKeyChecking=(yes|no|accept-new)|UserKnownHostsFile=[a-z0-9/._-]+)$/.test(next)) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid -o value for scp" });
            }
            i++;
            continue;
        }
        if (arg.startsWith("-") && arg !== "-o") {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized flag: ${arg}` });
            continue;
        }

        if (/^[a-z0-9/._-]+$/.test(arg)) continue;
        if (/^[a-z0-9]+@([a-z0-9.-]+|\[[a-f0-9:]+\])(:.*)?$/.test(arg)) {
            if (arg.includes(":") && /[;&|><`$()!]/.test(arg.split(":")[1])) {
                 ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Security Violation: Shell metacharacters in remote path" });
            }
            continue;
        }
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized argument: ${arg}` });
    }
  });

  private static readonly PFCTL_SCHEMA = z.array(z.string().regex(/^[a-zA-Z0-9.:_-]+$/)).max(6).superRefine((args, ctx) => {
    const validFlags = /^(-t|-T|-s|-e|-F)$/;
    const validActions = /^(add|delete|info|all)$/;
    for (const arg of args) {
        if (!validFlags.test(arg) && !validActions.test(arg) && !/^[a-z_]+$/.test(arg) && !/^[0-9a-fA-F.:]+$/.test(arg)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized pfctl argument: ${arg}` });
        }
    }
  });

  private static readonly LAUNCHCTL_SCHEMA = z.array(z.string().regex(/^[a-zA-Z0-9.\/_-]+$/)).max(2).superRefine((args, ctx) => {
      if (args.length > 0 && !/^(list|load|unload|start|stop)$/.test(args[0])) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid launchctl action" });
      }
  });

  private static readonly SPCTL_SCHEMA = z.array(z.string().regex(/^[a-zA-Z0-9.\/_-]+$/)).max(2).superRefine((args, ctx) => {
      if (args.length > 0 && args[0] !== "--assess") {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Only --assess allowed for spctl" });
      }
  });

  private static readonly PS_SCHEMA = z.array(z.string().regex(/^[0-9,a-z\-]+$/)).max(4).superRefine((args, ctx) => {
      for (const arg of args) {
          if (arg.startsWith("-") && !/^(-p|-ax|-o)$/.test(arg)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized ps flag: ${arg}` });
          }
      }
  });

  private static readonly PKTMON_SCHEMA = z.array(z.string()).max(4).superRefine((args, ctx) => {
      for (const arg of args) {
          if (!/^(start|stop|--etw|-p)$/.test(arg) && !/^\.\/volume\/.*\.pcap$/.test(arg)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized pktmon argument: ${arg}` });
          }
      }
  });

  private static readonly NETSH_SCHEMA = z.array(z.string().regex(/^[a-zA-Z0-9\-\.\/_=:]+$/)).max(10).superRefine((args, ctx) => {
      const validActions = /^(advfirewall|firewall|show|set|add|delete|rule|allprofiles|state)$/;
      if (args.length > 0 && !validActions.test(args[0])) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized netsh action: ${args[0]}` });
      }
  });

  private static readonly KILL_SCHEMA = z.array(z.string().regex(/^-?[0-9]+$/)).max(2);

  private static readonly TCPDUMP_SCHEMA = z.array(z.string()).max(8).superRefine((args, ctx) => {
      for (let i = 0; i < args.length; i++) {
          const arg = args[i];
          if (arg === "-i" && !/^[a-z0-9]+$/.test(args[i+1] || "")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid interface" });
          if (arg === "-w" && !/^\.\/volume\/storage\/captures\/[a-zA-Z0-9._-]+\.pcap$/.test(args[i+1] || "")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid output file" });
          if (arg === "-G" && !/^[0-9]+$/.test(args[i+1] || "")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid interval" });
          if (arg === "-W" && args[i+1] !== "1") ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid rotation count" });
      }
  });

  private static readonly CLAMSCAN_SCHEMA = z.array(z.string()).max(5).superRefine((args, ctx) => {
      for (const arg of args) {
          if (arg.startsWith("-") && !/^(-r|--quiet|--no-summary)$/.test(arg)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized clamscan flag: ${arg}` });
          if (!arg.startsWith("-") && !validatePath(arg, SystemExecutor.SYSTEM_JAILS)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized path: ${arg}` });
      }
  });

  private static readonly CRONTAB_SCHEMA = z.array(z.string()).max(3).superRefine((args, ctx) => {
      for (let i = 0; i < args.length; i++) {
          if (args[i] === "-u" && !/^[a-z0-9-]+$/.test(args[i+1] || "")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid user" });
          if (args[i].startsWith("-") && !/^(-l|-u)$/.test(args[i])) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized flag: ${args[i]}` });
      }
  });

  private static readonly TC_SCHEMA = z.array(z.string().regex(/^[a-zA-Z0-9\.:\/_-]+$/)).max(20);

  private static readonly WG_QUICK_SCHEMA = z.array(z.string()).max(2).superRefine((args, ctx) => {
      if (args.length > 0 && !/^(up|down)$/.test(args[0])) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid action" });
      if (args.length > 1 && !/^(all|[a-z0-9]+)$/.test(args[1])) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid interface" });
  });

  private static readonly WG_SCHEMA = z.array(z.string().regex(/^[a-zA-Z0-9+/=._-]+$/)).max(10);

  private static readonly SS_SCHEMA = z.array(z.string()).max(2).superRefine((args, ctx) => {
      for (const arg of args) {
          if (!/^(-?[tulnpaH]+|sport = :[0-9]+)$/.test(arg)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized ss argument: ${arg}` });
      }
  });

  private static readonly IPTABLES_SCHEMA = z.array(z.string().regex(/^[a-zA-Z0-9\.\+\-_:\/]+$/)).max(20);

  private static readonly TPM2_SIGN_SCHEMA = z.array(z.string()).max(10).superRefine((args, ctx) => {
      for (let i = 0; i < args.length; i++) {
          if (args[i] === "-c" && !/^0x[0-9a-fx]+$/.test(args[i+1] || "")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid handle" });
          if (args[i] === "-g" && !/^(sha256|sha384)$/.test(args[i+1] || "")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid algorithm" });
      }
  });

  private static readonly IP_SCHEMA = z.array(z.string().regex(/^[a-zA-Z0-9\._\-:\/]+$/)).max(10);

  private static readonly SYSCTL_SCHEMA = z.array(z.string().regex(/^[a-z0-9._-]+(=[0-9]+)?$/)).max(2).superRefine((args, ctx) => {
      if (args.length > 0 && !/^(-w|-n)$/.test(args[0]) && !args[0].includes("=")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid sysctl argument" });
  });

  private static readonly OPENSSL_SCHEMA = z.array(z.string()).max(10).superRefine((args, ctx) => {
      const validActions = /^(dgst|genrsa|rsa|req|x509)$/;
      if (args.length > 0 && !validActions.test(args[0])) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid openssl action" });
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
            "BLOCK_SYSCALL", "LSM_POLICY", "ENFORCE_PID", "UNENFORCE_PID", "KillProcess", "QuarantineProcess", "DumpProcess",
            "LSM_SYSCALL_ALLOWLIST", "UPDATE_HOOK_CONTROL", "ADD_REDIRECTION", "REMOVE_REDIRECTION", "SET_LEARNING_MODE"
          ];
          if (!validTypes.includes(payload.type)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid sentinel command type: ${payload.type}` });
          }
          if (payload.pid && typeof payload.pid !== "number") {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "PID must be numeric" });
          }
          if (payload.allowed_syscalls && !Array.isArray(payload.allowed_syscalls)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "allowed_syscalls must be an array" });
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

  private static readonly CP_SCHEMA = z.array(z.string()).max(3).superRefine((args, ctx) => {
      const paths = args.filter(a => !a.startsWith("-"));
      const flags = args.filter(a => a.startsWith("-"));

      if (paths.length !== 2) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Exactly 2 paths required" });
          return;
      }

      for (const flag of flags) {
          if (!/^--reflink=(always|auto|never)$/.test(flag) && flag !== "-p") {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized flag: ${flag}` });
          }
      }

      for (const arg of paths) {
          if (!validatePath(arg, SystemExecutor.SYSTEM_JAILS)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized path: ${arg}` });
          }
      }
  });

  private static readonly MV_SCHEMA = SystemExecutor.CP_SCHEMA;

  private static readonly CHMOD_SCHEMA = z.array(z.string()).max(2).superRefine((args, ctx) => {
      if (args.length !== 2) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Exactly 2 arguments required" });
          return;
      }
      if (!/^[0-7]{3,4}$/.test(args[0])) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid mode" });
      }
      if (!validatePath(args[1], SystemExecutor.SYSTEM_JAILS)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized path: ${args[1]}` });
      }
  });

  private static readonly MKDIR_SCHEMA = z.array(z.string()).min(1).max(2).superRefine((args, ctx) => {
      let pathArg = args[0];
      if (args.length === 2) {
          if (args[0] !== "-p") {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid flag for mkdir" });
          }
          pathArg = args[1];
      }
      if (!validatePath(pathArg, SystemExecutor.SYSTEM_JAILS)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized path: ${pathArg}` });
      }
  });

  private static readonly LS_SCHEMA = z.array(z.string()).max(2).superRefine((args, ctx) => {
      for (const arg of args) {
          if (arg.startsWith("-")) {
              if (!/^-la?$/.test(arg)) {
                  ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized flag: ${arg}` });
              }
          } else {
              if (!validatePath(arg, SystemExecutor.SYSTEM_JAILS)) {
                  ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized path: ${arg}` });
              }
          }
      }
  });

  private static readonly SHA256SUM_SCHEMA = z.array(z.string()).max(1).superRefine((args, ctx) => {
      if (args.length === 1 && !validatePath(args[0], SystemExecutor.SYSTEM_JAILS)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized path: ${args[0]}` });
      }
  });

  /**
   * Exhaustive Zod schemas for whitelisted commands.
   */
  private static readonly COMMAND_POLICIES: Record<string, CommandPolicy> = {
    "pfctl": { schema: SystemExecutor.PFCTL_SCHEMA },
    "launchctl": { schema: SystemExecutor.LAUNCHCTL_SCHEMA },
    "spctl": { schema: SystemExecutor.SPCTL_SCHEMA },
    "ps": { schema: SystemExecutor.PS_SCHEMA },
    "killall": { schema: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(1) },
    "ifconfig": { schema: z.array(z.string().regex(/^[a-z0-9]+$/)).max(1) },
    "pktmon": { schema: SystemExecutor.PKTMON_SCHEMA },
    "powershell": {
        schema: SystemExecutor.POWERSHELL_SCHEMA,
        blockedStrings: ["&", "|", ";", ">", "<", "`", "$", "(", ")", "{", "}", "[", "]", "$("]
    },
    "netsh": { schema: SystemExecutor.NETSH_SCHEMA },
    "taskkill": { schema: z.array(z.string().regex(/^(\/F|\/PID|[0-9]+)$/)).max(3) },
    "systemctl": { schema: SystemExecutor.SYSTEMCTL_SCHEMA },
    "ufw": { schema: SystemExecutor.UFW_SCHEMA },
    "kill": { schema: SystemExecutor.KILL_SCHEMA },
    "chmod": { schema: SystemExecutor.CHMOD_SCHEMA },
    "mkdir": { schema: SystemExecutor.MKDIR_SCHEMA },
    "tcpdump": { schema: SystemExecutor.TCPDUMP_SCHEMA },
    "ls": { schema: SystemExecutor.LS_SCHEMA },
    "cp": { schema: SystemExecutor.CP_SCHEMA },
    "mv": { schema: SystemExecutor.MV_SCHEMA },
    "sw_vers": { schema: z.array(z.string().regex(/^-productVersion$/)).max(1) },
    "which": { schema: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(1) },
    "clamscan": { schema: SystemExecutor.CLAMSCAN_SCHEMA },
    "sha256sum": { schema: SystemExecutor.SHA256SUM_SCHEMA },
    "crontab": { schema: SystemExecutor.CRONTAB_SCHEMA },
    "where": { schema: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(1) },
    "tc": { schema: SystemExecutor.TC_SCHEMA },
    "gcore": { schema: z.array(z.string()).max(3).superRefine((args, ctx) => {
        if (args.length > 0 && args[0] !== "-o") ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid gcore flag" });
    }) },
    "tpm2_nvdefine": { schema: z.array(z.string().regex(/^(0x[0-9a-fA-F]+|-s|[0-9]+)$/)).max(3) },
    "tpm2_nvwrite": { schema: z.array(z.string().regex(/^(0x[0-9a-fA-F]+|-i|[a-zA-Z0-9.\/_=+\-]+)$/)).max(3) },
    "tpm2_nvread": { schema: z.array(z.string().regex(/^0x[0-9a-fA-F]+$/)).max(1) },
    "tpm2_pcrread": { schema: z.array(z.string().regex(/^sha256:[0-9,]+$/)).max(1) },
    "wg-quick": { schema: SystemExecutor.WG_QUICK_SCHEMA },
    "wg": { schema: SystemExecutor.WG_SCHEMA },
    "system_profiler": { schema: z.array(z.string().regex(/^[A-Z][a-zA-Z0-9]+DataType$/)).max(5) },
    "ss": { schema: SystemExecutor.SS_SCHEMA },
    "unshare": { schema: z.array(z.string().regex(/^(--[a-z]+|[a-z0-9/._-]+)$/)).max(10) },
    "iptables": { schema: SystemExecutor.IPTABLES_SCHEMA },
    "tpm2_sign": { schema: SystemExecutor.TPM2_SIGN_SCHEMA },
    "tpm2_hash": { schema: z.array(z.string().regex(/^(-g|sha256|sha384|-o|[a-z0-9/._-]+)$/)).max(10) },
    "rkhunter": { schema: z.array(z.string().regex(/^(--check|--sk|--nocolor|--report-warnings-only)$/)).max(5) },
    "security": { schema: z.array(z.string().regex(/^(cms|find-identity|unlock-keychain|-?[a-zA-Z]+|[a-z0-9/._-]+)$/i)).max(10) },
    "ip": { schema: SystemExecutor.IP_SCHEMA },
    "sysctl": { schema: SystemExecutor.SYSCTL_SCHEMA },
    "nmcli": { schema: z.array(z.string().regex(/^(-t|-f|[A-Z,]+|dev|wifi|list)$/)).max(10) },
    "ping": { schema: z.array(z.string().regex(/^(-c|[0-9]+|-W|-p|[0-9a-fA-F]+|[a-z0-9.-]+|[0-9a-fA-F.:]+)$/)).max(10) },
    "host": { schema: z.array(z.string().regex(/^(-t|A|AAAA|TXT|MX|[a-z0-9.-]+)$/i)).max(3) },
    "scp": { schema: SystemExecutor.SCP_SCHEMA },
    "ssh": {
        schema: SystemExecutor.SSH_SCHEMA,
        blockedStrings: ["&&", "||", "|", ";", ">", "<", "`", "$", "(", ")", "!", "-F", "-E", "-S", "-i"]
    },
    "/var/lib/cts/scripts/install_service.sh": { schema: z.array(z.string().regex(/^(\/etc\/systemd\/system\/cts-?.*\.service|[a-zA-Z0-9.\/_ \-]+)$/)).max(2) },
    "/var/lib/cts/scripts/update_crontab.sh": { schema: z.array(z.string().regex(/^[a-zA-Z0-9.\/_ \-\*]+$/)).max(1) },
    "/var/lib/cts/scripts/update_comm.sh": { schema: z.array(z.string().regex(/^(\[[a-z0-9/:]+\]|[0-9]+)$/)).max(2) },
    "/var/lib/cts/scripts/secure_spawn.sh": { schema: z.array(z.string().regex(/^[a-z0-9,._+\-/]+$/)).max(4) },
    "openssl": { schema: SystemExecutor.OPENSSL_SCHEMA },
    "analyzer": { schema: SystemExecutor.ANALYZER_SCHEMA },
    "enforcer": { schema: z.array(z.string()).max(10) },
    "decoy": { schema: z.array(z.string()).max(10) },
    "netcap": { schema: z.array(z.string()).max(10) },
    "ebpf": { schema: SystemExecutor.SENTINEL_SCHEMA },
    "sentinel": { schema: SystemExecutor.SENTINEL_SCHEMA },
    "watchfile": { schema: z.array(z.string()).max(10) },
    "tunnel": { schema: z.array(z.string()).max(10) },
    "sentinel-darwin": { schema: z.array(z.string()).max(10) },
    "telemetry-win": { schema: z.array(z.string()).max(10) },
    "enforcer-win": { schema: z.array(z.string()).max(10) }
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
