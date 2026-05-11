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
 */
export class SystemExecutor {
  private static readonly WHITELISTED_COMMANDS = [
    "mkdir", "mv", "chmod", "ls", "sha256sum", "systemctl",
    "crontab", "which", "where", "netsh", "taskkill", "tc", "kill",
    "cp", "gcore", "tpm2_nvdefine", "tpm2_nvwrite", "tpm2_nvread",
    "tpm2_pcrread", "wg", "launchctl", "system_profiler", "ss",
    "unshare", "tpm2_sign", "tpm2_hash", "sw_vers", "openssl",
    "pfctl", "ifconfig", "killall", "spctl", "ps", "pktmon", "ip", "sysctl", "nmcli", "ping", "host", "scp", "ssh", "security", "powershell",
    "scanner", "blocker", "honeypot", "pcap", "ebpf", "fim", "vpn", "esf", "etw", "wfp",
    "/var/lib/cts/scripts/install_service.sh",
    "/var/lib/cts/scripts/update_crontab.sh",
    "/var/lib/cts/scripts/update_comm.sh",
    "/var/lib/cts/scripts/secure_spawn.sh"
  ];

  private static readonly PRIVILEGED_COMMANDS = [
    "tc", "wg", "gcore", "unshare", "systemctl",
    "tpm2_nvdefine", "tpm2_nvwrite", "tpm2_nvread", "tpm2_pcrread", "setcap",
    "chmod", "mkdir", "cp", "mv", "pfctl", "pktmon", "netsh",
    "/var/lib/cts/scripts/secure_spawn.sh"
  ];

  private static readonly PLATFORM_TOOLS = [
    "pfctl", "launchctl", "sw_vers", "spctl", "ifconfig", "killall", "ps",
    "netsh", "taskkill", "pktmon", "powershell", "security"
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
        allowedArgs: [/^-Command$/, /^[a-zA-Z0-9\s\-\.\/_=:'"\$\(\)\{\}\[\];+]+$/],
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
      allowedArgs: [/^(start|stop|restart|status|is-active)$/, /^(cts-.*|wireguard.*|clamav.*)$/],
      maxArgs: 2
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
    "tpm2_sign": {
        allowedArgs: [/^-c$/, /^[0-9a-fx]+$/, /^-g$/, /^(sha256|sha384)$/, /^-o$/, /^[a-z0-9/._-]+$/],
        maxArgs: 10
    },
    "tpm2_hash": {
        allowedArgs: [/^-g$/, /^(sha256|sha384)$/, /^-o$/, /^[a-z0-9/._-]+$/],
        maxArgs: 10
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
        allowedArgs: [/^-o$/, /^StrictHostKeyChecking=(yes|no)$/, /^[a-z0-9/._-]+$/, /^[a-z0-9]+@[a-z0-9.-]+:.*$/],
        maxArgs: 10
    },
    "ssh": {
        allowedArgs: [/^-o$/, /^StrictHostKeyChecking=(yes|no)$/, /^[a-z0-9/._-]+$/, /^[a-z0-9]+@[a-z0-9.-]+$/, /^(deno task start|sudo systemctl (status|start|stop|restart) (cts-.*|wireguard.*|clamav.*))$/],
        maxArgs: 10
    },
    "/var/lib/cts/scripts/install_service.sh": {
      allowedArgs: [/^\/etc\/systemd\/system\/cts-?.*\.service$/, /.*/],
      maxArgs: 2
    },
    "/var/lib/cts/scripts/update_crontab.sh": {
      allowedArgs: [/.*/],
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
    "scanner": { maxArgs: 10 },
    "blocker": { maxArgs: 10 },
    "honeypot": { maxArgs: 10 },
    "pcap": { maxArgs: 10 },
    "ebpf": { 
      allowedArgs: [/^\{.*"type":\s*"(BLOCK_IP|UNBLOCK_IP|SHADOW_BAN|HIDE_PID|GET_STATUS|ALLOW_PORT|DENY_PORT|FLUSH_RULES|LOCKDOWN|SHUTDOWN|TRUST_COMM|BLOCK_SYSCALL|LSM_POLICY|ENFORCE_PID|UNENFORCE_PID)".*\}$/],
      maxArgs: 1 
    },
    "fim": { maxArgs: 10 },
    "vpn": { maxArgs: 10 },
    "esf": { maxArgs: 10 },
    "etw": { maxArgs: 10 }
  };



  private validateArguments(cmd: string, args: string[]): { valid: boolean; reason?: string } {
    const baseCmd = path.basename(cmd);
    const policy = SystemExecutor.COMMAND_POLICIES[cmd] || SystemExecutor.COMMAND_POLICIES[baseCmd];
    
    // SECURITY: Deny by default if no policy exists for a whitelisted command
    if (!policy) {
      return { valid: false, reason: `No security policy defined for whitelisted command '${cmd}'. Blocking for safety.` };
    }

    if (policy.maxArgs !== undefined && args.length > policy.maxArgs) {
      return { valid: false, reason: `Too many arguments for '${baseCmd}' (max: ${policy.maxArgs})` };
    }

    if (policy.allowedArgs) {
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        // SET-BASED VALIDATION: Check if the argument matches ANY of the allowed patterns
        const matchesAny = policy.allowedArgs.some(pattern => pattern.test(arg));

        if (!matchesAny) {
          return { valid: false, reason: `Argument '${arg}' at index ${i} is not allowed for '${baseCmd}' (no matching pattern)` };
        }

        // ALWAYS validate for traversal if it looks like a path or contains '..'
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
