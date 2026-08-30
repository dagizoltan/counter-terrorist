import { z } from "zod";
import { validatePath } from "./validation.ts";

/**
 * Security Policy for whitelisted commands.
 * Defines regex patterns for allowed arguments to prevent indirect privilege escalation.
 */
export interface CommandPolicy {
  allowedArgs?: RegExp[];
  maxArgs?: number;
  blockedStrings?: string[];
  schema?: z.ZodSchema<string[]>;
  /**
   * Set when `schema` is an exact-shape allow-list that fully specifies the permitted
   * argument strings, including any shell metacharacters they legitimately contain.
   *
   * SystemExecutor otherwise applies a blanket metacharacter scan on top of the schema.
   * That is the right default — arguments are never passed through a shell — but for
   * `sh -c` it rejected the very literals the schema had just authorised, which made
   * the whole command unreachable.
   */
  schemaOwnsArgumentValidation?: boolean;
}

export const SYSTEM_JAILS = [
    "./volume/",
    "/var/lib/cts/",
    "/etc/systemd/system/cts-",
    "/etc/apparmor.d/",
    "/home/",
    "/var/www/",
    "/tmp/",
    "/proc/"
];

const PROVISIONING_REGEX = /^(chmod 600 \/etc\/cts\.env && export \$\(grep -v '\^#' \/etc\/cts\.env \| xargs -d (['"])\\n\1\) && \/usr\/local\/bin\/counter-terrorist > \/var\/log\/cts\.log 2>&1 &)$/;

const SSH_SCHEMA = z.array(z.string()).max(10).superRefine((args, ctx) => {
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
            if (PROVISIONING_REGEX.test(arg)) continue;
        }

        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized argument: ${arg}` });
    }
});

const SCP_SCHEMA = z.array(z.string()).max(10).superRefine((args, ctx) => {
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

const PFCTL_SCHEMA = z.array(z.string().regex(/^[a-zA-Z0-9.:_-]+$/)).max(6).superRefine((args, ctx) => {
    const validFlags = /^(-t|-T|-s|-e|-F)$/;
    const validActions = /^(add|delete|info|all)$/;
    for (const arg of args) {
        if (!validFlags.test(arg) && !validActions.test(arg) && !/^[a-z_]+$/.test(arg) && !/^[0-9a-fA-F.:]+$/.test(arg)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized pfctl argument: ${arg}` });
        }
    }
});

const LAUNCHCTL_SCHEMA = z.array(z.string().regex(/^[a-zA-Z0-9.\/_-]+$/)).max(2).superRefine((args, ctx) => {
    if (args.length > 0 && !/^(list|load|unload|start|stop)$/.test(args[0])) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid launchctl action" });
    }
});

const SPCTL_SCHEMA = z.array(z.string().regex(/^[a-zA-Z0-9.\/_-]+$/)).max(2).superRefine((args, ctx) => {
    if (args.length > 0 && args[0] !== "--assess") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Only --assess allowed for spctl" });
    }
});

const PS_SCHEMA = z.array(z.string().regex(/^[0-9,a-z\-]+$/)).max(4).superRefine((args, ctx) => {
    for (const arg of args) {
        if (arg.startsWith("-") && !/^(-p|-ax|-o)$/.test(arg)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized ps flag: ${arg}` });
        }
    }
});

const PKTMON_SCHEMA = z.array(z.string()).max(4).superRefine((args, ctx) => {
    for (const arg of args) {
        if (!/^(start|stop|--etw|-p)$/.test(arg) && !/^\.\/volume\/.*\.pcap$/.test(arg)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized pktmon argument: ${arg}` });
        }
    }
});

const NETSH_SCHEMA = z.array(z.string().regex(/^[a-zA-Z0-9\-\.\/_=:]+$/)).max(10).superRefine((args, ctx) => {
    const validActions = /^(advfirewall|firewall|show|set|add|delete|rule|allprofiles|state)$/;
    if (args.length > 0 && !validActions.test(args[0])) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized netsh action: ${args[0]}` });
    }
});

const KILL_SCHEMA = z.array(z.string().regex(/^-?[0-9]+$/)).max(2);

const TCPDUMP_SCHEMA = z.array(z.string()).max(8).superRefine((args, ctx) => {
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "-i" && !/^[a-z0-9]+$/.test(args[i+1] || "")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid interface" });
        if (arg === "-w" && !/^\.\/volume\/storage\/captures\/[a-zA-Z0-9._-]+\.pcap$/.test(args[i+1] || "")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid output file" });
        if (arg === "-G" && !/^[0-9]+$/.test(args[i+1] || "")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid interval" });
        if (arg === "-W" && args[i+1] !== "1") ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid rotation count" });
    }
});

const CLAMSCAN_SCHEMA = z.array(z.string()).max(5).superRefine((args, ctx) => {
    for (const arg of args) {
        if (arg.startsWith("-") && !/^(-r|--quiet|--no-summary)$/.test(arg)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized clamscan flag: ${arg}` });
        if (!arg.startsWith("-") && !validatePath(arg, SYSTEM_JAILS)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized path: ${arg}` });
    }
});

const CRONTAB_SCHEMA = z.array(z.string()).max(3).superRefine((args, ctx) => {
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "-u" && !/^[a-z0-9-]+$/.test(args[i+1] || "")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid user" });
        if (args[i].startsWith("-") && !/^(-l|-u)$/.test(args[i])) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized flag: ${args[i]}` });
    }
});

const TC_SCHEMA = z.array(z.string().regex(/^[a-zA-Z0-9\.:\/_-]+$/)).max(20);

const WG_QUICK_SCHEMA = z.array(z.string()).max(2).superRefine((args, ctx) => {
    if (args.length > 0 && !/^(up|down)$/.test(args[0])) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid action" });
    if (args.length > 1 && !/^(all|[a-z0-9]+)$/.test(args[1])) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid interface" });
});

const WG_SCHEMA = z.array(z.string().regex(/^[a-zA-Z0-9+/=._-]+$/)).max(10);

const SS_SCHEMA = z.array(z.string()).max(2).superRefine((args, ctx) => {
    for (const arg of args) {
        if (!/^(-?[tulnpaH]+|sport = :[0-9]+)$/.test(arg)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized ss argument: ${arg}` });
    }
});

const IPTABLES_SCHEMA = z.array(z.string().regex(/^[a-zA-Z0-9\.\+\-_:\/]+$/)).max(20);

const TPM2_SIGN_SCHEMA = z.array(z.string()).max(10).superRefine((args, ctx) => {
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "-c" && !/^0x[0-9a-fx]+$/.test(args[i+1] || "")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid handle" });
        if (args[i] === "-g" && !/^(sha256|sha384)$/.test(args[i+1] || "")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid algorithm" });
    }
});

const IP_SCHEMA = z.array(z.string().regex(/^[a-zA-Z0-9\._\-:\/]+$/)).max(10);

const SYSCTL_SCHEMA = z.array(z.string().regex(/^[a-z0-9._-]+(=[0-9]+)?$/)).max(2).superRefine((args, ctx) => {
    if (args.length > 0 && !/^(-w|-n)$/.test(args[0]) && !args[0].includes("=")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid sysctl argument" });
});

const OPENSSL_SCHEMA = z.array(z.string()).max(10).superRefine((args, ctx) => {
    const validActions = /^(dgst|genrsa|rsa|req|x509)$/;
    if (args.length > 0 && !validActions.test(args[0])) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid openssl action" });
});

const UFW_SCHEMA = z.array(z.string().regex(/^[0-9a-zA-Z./-]+$/)).max(5).superRefine((args, ctx) => {
    if (args.length > 0 && !/^(status|enable|disable|allow|deny|delete|default|reload|reset)$/.test(args[0])) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid ufw command" });
    }
});

const SENTINEL_SCHEMA = z.array(z.string()).max(1).superRefine((args, ctx) => {
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

const POWERSHELL_SCHEMA = z.array(z.string()).max(2).superRefine((args, ctx) => {
    if (args.length === 0) return;
    if (args[0] === "-Command") {
        const cmd = args[1] || "";
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

const SYSTEMCTL_SCHEMA = z.array(z.string()).max(2).superRefine((args, ctx) => {
    if (args.length === 0) return;
    const actions = ["start", "stop", "restart", "status", "is-active", "enable", "disable"];
    if (!actions.includes(args[0])) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid systemctl action: ${args[0]}` });
    }
    if (args.length > 1 && !/^(cts-.*|ufw|wireguard.*|clamav.*|systemd-resolved|network-manager)$/.test(args[1])) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized service: ${args[1]}` });
    }
});

const ANALYZER_SCHEMA = z.array(z.string()).max(5).superRefine((args, ctx) => {
    if (args.length === 0) return;
    try {
        const payload = JSON.parse(args[0]);
        const validTypes = ["SCAN", "DIR_SCAN", "RKH_SCAN", "QUIT", "MEM_SCAN", "ScanPath", "Quarantine", "SyncSignatures", "GetStatus"];
        if (!validTypes.includes(payload.type)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid analyzer command type" });
        }
    } catch {
        if (!args[0].startsWith("-")) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Analyzer requires JSON payload or standard flag" });
        }
    }
});

const CP_SCHEMA = z.array(z.string()).max(3).superRefine((args, ctx) => {
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
        if (!validatePath(arg, SYSTEM_JAILS)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized path: ${arg}` });
        }
    }
});

const MV_SCHEMA = CP_SCHEMA;

const CHMOD_SCHEMA = z.array(z.string()).max(2).superRefine((args, ctx) => {
    if (args.length !== 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Exactly 2 arguments required" });
        return;
    }
    if (!/^[0-7]{3,4}$/.test(args[0])) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid mode" });
    }
    if (!validatePath(args[1], SYSTEM_JAILS)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized path: ${args[1]}` });
    }
});

const MKDIR_SCHEMA = z.array(z.string()).min(1).max(2).superRefine((args, ctx) => {
    let pathArg = args[0];
    if (args.length === 2) {
        if (args[0] !== "-p") {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid flag for mkdir" });
        }
        pathArg = args[1];
    }
    if (!validatePath(pathArg, SYSTEM_JAILS)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized path: ${pathArg}` });
    }
});

const LS_SCHEMA = z.array(z.string()).max(2).superRefine((args, ctx) => {
    for (const arg of args) {
        if (arg.startsWith("-")) {
            if (!/^-la?$/.test(arg)) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized flag: ${arg}` });
            }
        } else {
            if (!validatePath(arg, SYSTEM_JAILS)) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized path: ${arg}` });
            }
        }
    }
});

const SHA256SUM_SCHEMA = z.array(z.string()).max(1).superRefine((args, ctx) => {
    if (args.length === 1 && !validatePath(args[0], SYSTEM_JAILS)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unauthorized path: ${args[0]}` });
    }
});

/**
 * Exhaustive Zod schemas for whitelisted commands.
 */
export const COMMAND_POLICIES: Record<string, CommandPolicy> = {
  "pfctl": { schema: PFCTL_SCHEMA },
  "launchctl": { schema: LAUNCHCTL_SCHEMA },
  "spctl": { schema: SPCTL_SCHEMA },
  "ps": { schema: PS_SCHEMA },
  "killall": { schema: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(1) },
  "ifconfig": { schema: z.array(z.string().regex(/^[a-z0-9]+$/)).max(1) },
  "pktmon": { schema: PKTMON_SCHEMA },
  "powershell": {
      schema: POWERSHELL_SCHEMA,
      blockedStrings: ["&", "|", ";", ">", "<", "`", "$", "(", ")", "{", "}", "[", "]", "$("]
  },
  "netsh": { schema: NETSH_SCHEMA },
  "taskkill": { schema: z.array(z.string().regex(/^(\/F|\/PID|[0-9]+)$/)).max(3) },
  "systemctl": { schema: SYSTEMCTL_SCHEMA },
  "ufw": { schema: UFW_SCHEMA },
  "kill": { schema: KILL_SCHEMA },
  "chmod": { schema: CHMOD_SCHEMA },
  "mkdir": { schema: MKDIR_SCHEMA },
  "tcpdump": { schema: TCPDUMP_SCHEMA },
  "ls": { schema: LS_SCHEMA },
  "cp": { schema: CP_SCHEMA },
  "mv": { schema: MV_SCHEMA },
  "sw_vers": { schema: z.array(z.string().regex(/^-productVersion$/)).max(1) },
  "which": { schema: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(1) },
  "clamscan": { schema: CLAMSCAN_SCHEMA },
  "sha256sum": { schema: SHA256SUM_SCHEMA },
  "crontab": { schema: CRONTAB_SCHEMA },
  "where": { schema: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(1) },
  "tc": { schema: TC_SCHEMA },
  "gcore": { schema: z.array(z.string()).max(3).superRefine((args, ctx) => {
      if (args.length > 0 && args[0] !== "-o") ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid gcore flag" });
  }) },
  "tpm2_nvdefine": { schema: z.array(z.string().regex(/^(0x[0-9a-fA-F]+|-s|[0-9]+)$/)).max(3) },
  "tpm2_nvwrite": { schema: z.array(z.string().regex(/^(0x[0-9a-fA-F]+|-i|[a-zA-Z0-9.\/_=+\-]+)$/)).max(3) },
  "tpm2_nvread": { schema: z.array(z.string().regex(/^0x[0-9a-fA-F]+$/)).max(1) },
  "tpm2_pcrread": { schema: z.array(z.string().regex(/^sha256:[0-9,]+$/)).max(1) },
  "wg-quick": { schema: WG_QUICK_SCHEMA },
  "wg": { schema: WG_SCHEMA },
  "system_profiler": { schema: z.array(z.string().regex(/^[A-Z][a-zA-Z0-9]+DataType$/)).max(5) },
  "ss": { schema: SS_SCHEMA },
  "unshare": { schema: z.array(z.string().regex(/^(--[a-z]+|[a-z0-9/._-]+)$/)).max(10) },
  "iptables": { schema: IPTABLES_SCHEMA },
  "tpm2_sign": { schema: TPM2_SIGN_SCHEMA },
  "tpm2_hash": { schema: z.array(z.string().regex(/^(-g|sha256|sha384|-o|[a-z0-9/._-]+)$/)).max(10) },
  "rkhunter": { schema: z.array(z.string().regex(/^(--check|--sk|--nocolor|--report-warnings-only)$/)).max(5) },
  "security": { schema: z.array(z.string().regex(/^(cms|find-identity|unlock-keychain|-?[a-zA-Z]+|[a-z0-9/._-]+)$/i)).max(10) },
  "ip": { schema: IP_SCHEMA },
  "sysctl": { schema: SYSCTL_SCHEMA },
  "nmcli": { schema: z.array(z.string().regex(/^(-t|-f|[A-Z,]+|dev|wifi|list)$/)).max(10) },
  "ping": { schema: z.array(z.string().regex(/^(-c|[0-9]+|-W|-p|[0-9a-fA-F]+|[a-z0-9.-]+|[0-9a-fA-F.:]+)$/)).max(10) },
  "host": { schema: z.array(z.string().regex(/^(-t|A|AAAA|TXT|MX|[a-z0-9.-]+)$/i)).max(3) },
  "scp": { schema: SCP_SCHEMA },
  "ssh": {
      schema: SSH_SCHEMA,
      blockedStrings: ["&&", "||", "|", ";", ">", "<", "`", "$", "(", ")", "!", "-F", "-E", "-S", "-i"]
  },
  "/var/lib/cts/scripts/install_service.sh": { schema: z.array(z.string().regex(/^(\/etc\/systemd\/system\/cts-?.*\.service|[a-zA-Z0-9.\/_ \-]+)$/)).max(2) },
  "/var/lib/cts/scripts/update_crontab.sh": { schema: z.array(z.string().regex(/^[a-zA-Z0-9.\/_ \-\*]+$/)).max(1) },
  "/var/lib/cts/scripts/update_comm.sh": { schema: z.array(z.string().regex(/^(\[[a-z0-9/:]+\]|[0-9]+)$/)).max(2) },
  "/var/lib/cts/scripts/secure_spawn.sh": { schema: z.array(z.string().regex(/^[a-z0-9,._+\-/]+$/)).max(4) },
  "cat": { schema: z.array(z.string().regex(/^[a-zA-Z0-9_\/.\-]+$/)).max(1) },
  "sh": {
    // The two literal shapes below are the entire permitted surface for `sh -c`; nothing
    // outside them reaches a shell. See `schemaOwnsArgumentValidation`.
    schemaOwnsArgumentValidation: true,
    schema: z.array(z.string()).max(2).superRefine((args, ctx) => {
      if (args.length !== 2 || args[0] !== "-c") {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Only sh -c <command> is allowed" });
          return;
      }
      const command = args[1];
      // SEC-06 Hardening: Refined shell regex to allow escaped single quotes in profiles
      const isCommUpdate = /^echo '[^']+' > \/proc\/[0-9]+\/comm$/.test(command);
      // KernelService writes AppArmor profiles with a leading `umask 077 &&` so the file
      // is never briefly world-readable. The optional prefix is part of the allowed
      // shape; without it this branch never matched and profile deployment always failed.
      // The body may only be quote-free text or the POSIX escape `'\''` that
      // KernelService emits. `(.|\n)*` also accepted a body that closed the quote and
      // opened a second redirect ("echo 'x' > /etc/passwd && echo 'y' > <profile>"),
      // which the caller's escaping already prevented but the policy should not have
      // allowed through on its own.
      const isProfileWrite = /^(umask 077 && )?echo '(?:[^']|'\\'')*' > \/var\/lib\/cts\/tmp\/cts-profile-[a-zA-Z0-9._-]+\.profile$/.test(command);
      if (!isCommUpdate && !isProfileWrite) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Unauthorized sh command pattern" });
      }
    })
  },
  "rm": { schema: z.array(z.string()).max(2).superRefine((args, ctx) => {
      const paths = args.filter(a => !a.startsWith("-"));
      for (const p of paths) {
          if (p === "/var/lib/cts/tmp/cts_reflink_probe") continue;
          if (!p.startsWith("/var/lib/cts/tmp/cts-profile-") || !p.endsWith(".profile")) {
               ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Unauthorized rm path" });
          }
      }
  })},
  "openssl": { schema: OPENSSL_SCHEMA },
  "analyzer": { schema: ANALYZER_SCHEMA },
  "enforcer": { schema: z.array(z.string()).max(10) },
  "decoy": { schema: z.array(z.string()).max(10) },
  "netcap": { schema: z.array(z.string()).max(10) },
  "ebpf": { schema: SENTINEL_SCHEMA },
  "sentinel": { schema: SENTINEL_SCHEMA },
  "watchfile": { schema: z.array(z.string()).max(10) },
  "tunnel": { schema: z.array(z.string()).max(10) },
  "sentinel-darwin": { schema: z.array(z.string()).max(10) },
  "telemetry-win": { schema: z.array(z.string()).max(10) },
  "enforcer-win": { schema: z.array(z.string()).max(10) }
};
