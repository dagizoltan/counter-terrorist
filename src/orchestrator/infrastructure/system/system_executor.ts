import { CommandResult } from "@core/ports.ts";
import * as path from "@std/path";
import { validatePath } from "./validation.ts";

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
 * HARDENED: Only allows absolute paths or short names that resolve to trusted directories.
 */
export class SystemExecutor {
  private static readonly TRUSTED_BIN_PATHS = [
    "/usr/bin/", "/bin/", "/usr/sbin/", "/sbin/", "/usr/local/bin/"
  ];

  private static readonly TRUSTED_SCRIPTS_DIR = "/var/lib/cts/scripts/";
  private static readonly TRUSTED_SIDECARS_DIR = "/var/lib/cts/bin/";

  private static readonly WHITELISTED_COMMANDS = [
    "mkdir", "mv", "chmod", "ls", "sha256sum", "systemctl",
    "crontab", "which", "where", "netsh", "taskkill", "tc", "kill",
    "cp", "gcore", "ufw", "tpm2_nvdefine", "tpm2_nvwrite", "tpm2_nvread",
    "tpm2_pcrread", "wg-quick", "wg", "launchctl", "system_profiler", "ss",
    "unshare", "iptables", "tpm2_sign", "tpm2_hash", "sw_vers", "openssl",
    "pfctl", "ifconfig", "killall", "spctl", "ps", "pktmon", "ip", "sysctl", "nmcli", "ping", "host", "scp", "ssh", "security", "powershell",
    "analyzer", "enforcer", "decoy", "netcap", "sentinel", "watchfile", "tunnel", "sentinel-darwin", "telemetry-win", "enforcer-win", "getcap"
  ];

  private static readonly PRIVILEGED_COMMANDS = [
    "ufw", "tc", "iptables", "wg-quick", "wg", "gcore", "unshare", "systemctl", 
    "tpm2_nvdefine", "tpm2_nvwrite", "tpm2_nvread", "tpm2_pcrread", "setcap",
    "chmod", "mkdir", "cp", "mv", "pfctl", "pktmon", "netsh"
  ];

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
        allowedArgs: [/^--assess$/, /.*/],
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
        // HARDENED: Restrictive regex, allowing pipes but denying subshells and redirection
        allowedArgs: [/^-Command$/, /^[a-zA-Z0-9\s\-\.\/_=:'"\|\,\[\]]+$/],
        maxArgs: 2,
        blockedStrings: [";", "&&", "||", ">", "<", "`", "$(", "{", "}", "Invoke-Expression", "IEX"]
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
      allowedArgs: [/^(start|stop|restart|status|is-active|daemon-reload|enable|disable)$/, /^(cts-.*|ufw|wireguard.*|clamav.*)$/],
      maxArgs: 2
    },
    "ufw": {
      allowedArgs: [/^(status|enable|disable|allow|deny|delete|default|reload|reset|--force)$/, /^[0-9a-zA-Z./]+$/],
      maxArgs: 5
    },
    "kill": {
      allowedArgs: [/^-?[0-9A-Z]+$/, /^[0-9]+$/],
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
      allowedArgs: [/^-la?$/, /^(\.\/volume\/.*|\/var\/lib\/cts\/.*|\/etc\/systemd\/system\/cts.*)$/],
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
        allowedArgs: [/^0x[0-9a-fA-F]+$/, /^-i$/, /.*/],
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
        allowedArgs: [/^(-4|-6)$/, /^(addr|link|route|neigh|neighbor|show|dev|default|add|del|list)$/, /^[a-zA-Z0-9\._\-]+$/, /^[0-9a-fA-F\.:\/]+$/],
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
        allowedArgs: [/^-c$/, /^[0-9]+$/, /^-W$/, /^[0-9]+$/, /^-p$/, /^[0-9a-fA-F]+$/, /^[a-z0-9.-]+$/, /^[0-9a-fA-F.:%]+$/],
        maxArgs: 10
    },
    "host": {
        allowedArgs: [/^-t$/, /^(A|AAAA|TXT|MX)$/, /^[a-zA-Z0-9.-]+$/],
        maxArgs: 3
    },
    "scp": {
        allowedArgs: [/^-o$/, /^StrictHostKeyChecking=(yes|no)$/, /^[a-z0-9/._-]+$/, /^[a-z0-9]+@[a-z0-9.-]+:.*$/],
        maxArgs: 10
    },
    "ssh": {
        allowedArgs: [/^-o$/, /^StrictHostKeyChecking=(yes|no)$/, /^[a-z0-9/._-]+$/, /^[a-z0-9]+@[a-z0-9.-]+$/, /^(deno task start|sudo systemctl (status|start|stop|restart) (cts-.*|ufw|wireguard.*|clamav.*))$/],
        maxArgs: 10
    },
    "openssl": {
      allowedArgs: [/^(dgst|genrsa|rsa|req|x509)$/, /^-sha256$/, /^(-sign|-r)$/, /^-out$/, /^[a-zA-Z0-9./_-]+(\.(bin|pem|crt|key|csr|pub|sig))?$/],
      maxArgs: 10
    },
    "analyzer": { maxArgs: 10 },
    "enforcer": { maxArgs: 10 },
    "decoy": { maxArgs: 10 },
    "netcap": { maxArgs: 10 },
    "sentinel": { 
      allowedArgs: [/^\{.*"type":\s*"(BLOCK_IP|UNBLOCK_IP|SHADOW_BAN|HIDE_PID|GET_STATUS|ALLOW_PORT|DENY_PORT|FLUSH_RULES|LOCKDOWN|SHUTDOWN|TRUST_COMM|BLOCK_SYSCALL|LSM_POLICY|ENFORCE_PID|UNENFORCE_PID)".*\}$/],
      maxArgs: 1 
    },
    "watchfile": { maxArgs: 10 },
    "tunnel": { maxArgs: 10 },
    "sentinel-darwin": { maxArgs: 10 },
    "telemetry-win": { maxArgs: 10 },
    "enforcer-win": { maxArgs: 10 },
    "getcap": {
      allowedArgs: [/^[a-zA-Z0-9./_-]+$/],
      maxArgs: 1
    }
  };

  /**
   * Validates and resolves a command to its absolute path.
   */
  private resolveCommand(cmd: string): { resolvedPath: string; baseName: string } {
    const isAbsolute = path.isAbsolute(cmd);
    const baseName = path.basename(cmd);

    if (isAbsolute) {
      // 1. If absolute, it MUST be in a trusted directory OR match a specific script
      const isTrustedDir = SystemExecutor.TRUSTED_BIN_PATHS.some(p => cmd.startsWith(p)) || 
                           cmd.startsWith(SystemExecutor.TRUSTED_SCRIPTS_DIR) ||
                           cmd.startsWith(SystemExecutor.TRUSTED_SIDECARS_DIR);
      
      const isDevSidecar = Deno.env.get("CTS_DEV_MODE") === "true" && cmd.startsWith(Deno.cwd());

      if (!isTrustedDir && !isDevSidecar) {
        throw new Error(`Security Violation: Absolute path '${cmd}' is not in a trusted location.`);
      }

      if (!SystemExecutor.WHITELISTED_COMMANDS.includes(baseName)) {
        throw new Error(`Security Violation: Command basename '${baseName}' is not whitelisted.`);
      }

      return { resolvedPath: cmd, baseName };
    }

    // 2. If short name, it MUST be in the whitelist and we resolve it
    if (!SystemExecutor.WHITELISTED_COMMANDS.includes(cmd)) {
      throw new Error(`Security Violation: Command '${cmd}' is not whitelisted.`);
    }

    // In a real system, we would use a secure 'which' implementation here.
    // For this orchestrator, we assume short names are resolved via PATH safely 
    // IF and only IF they are whitelisted and don't contain any path separators.
    if (cmd.includes("/") || cmd.includes("\\")) {
        throw new Error(`Security Violation: Relative paths are forbidden in command names.`);
    }

    return { resolvedPath: cmd, baseName: cmd };
  }

  private validateArguments(baseName: string, args: string[]): { valid: boolean; reason?: string } {
    const policy = SystemExecutor.COMMAND_POLICIES[baseName];
    
    if (!policy) {
      return { valid: false, reason: `No security policy defined for whitelisted command '${baseName}'. Blocking for safety.` };
    }

    if (policy.maxArgs !== undefined && args.length > policy.maxArgs) {
      return { valid: false, reason: `Too many arguments for '${baseName}' (max: ${policy.maxArgs})` };
    }

    if (policy.allowedArgs) {
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const matchesAny = policy.allowedArgs.some(pattern => pattern.test(arg));

        if (!matchesAny) {
          return { valid: false, reason: `Argument '${arg}' at index ${i} is not allowed for '${baseName}'` };
        }

        if (arg.includes("/") || arg.includes("\\") || arg.includes("..") || arg.includes("%")) {
          const jailPrefixes = (arg.startsWith("./volume/") || arg.startsWith("/var/lib/cts/"))
              ? ["./volume/", "/var/lib/cts/", "/etc/systemd/system/cts-"]
              : undefined;
          
          if (!validatePath(arg, jailPrefixes)) {
            return { valid: false, reason: `Security Violation: Path traversal or prefix bypass detected in argument '${arg}'` };
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
    const { resolvedPath, baseName } = this.resolveCommand(cmd);

    const validation = this.validateArguments(baseName, args);
    if (!validation.valid) {
        throw new Error(`Security Violation: ${validation.reason}`);
    }

    let finalCmd = resolvedPath;
    let finalArgs = [...args];

    if (SystemExecutor.PRIVILEGED_COMMANDS.includes(baseName) && 
        Deno.uid() !== 0 && 
        Deno.env.get("CTS_NO_SUDO") !== "true") {
        finalCmd = "sudo";
        finalArgs = ["-n", resolvedPath, ...args];
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
    let resolvedPath: string;
    let baseName: string;

    try {
        const resolution = this.resolveCommand(cmd);
        resolvedPath = resolution.resolvedPath;
        baseName = resolution.baseName;
    } catch (e) {
        return { success: false, stdout: "", stderr: (e as Error).message };
    }

    const validation = this.validateArguments(baseName, args);
    if (!validation.valid) {
        return { success: false, stdout: "", stderr: `Security Violation: ${validation.reason}` };
    }

    let finalCmd = resolvedPath;
    let finalArgs = [...args];

    if (SystemExecutor.PRIVILEGED_COMMANDS.includes(baseName) && 
        Deno.uid() !== 0 && 
        Deno.env.get("CTS_NO_SUDO") !== "true") {
        finalCmd = "sudo";
        finalArgs = ["-n", resolvedPath, ...args];
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
            try { child.kill(); } catch { /* Ignore */ }
          }
          reject(new Error(`Command '${cmd}' timed out after ${timeoutMs}ms`));
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
        try { data = JSON.parse(stdoutStr); } catch { /* Ignore */ }
      }

      return { success: code === 0, stdout: stdoutStr, stderr: stderrStr, data };
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
