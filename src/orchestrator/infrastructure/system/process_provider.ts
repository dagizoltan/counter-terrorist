import { ProcessPort, ProcessInfo } from "@domain/ports/process_port.ts";

export class LinuxProcessProvider implements ProcessPort {
    async getProcessInfo(pid: number): Promise<ProcessInfo | null> {
        try {
            const stat = await Deno.readTextFile(`/proc/${pid}/stat`);
            const firstParen = stat.indexOf("(");
            const lastParen = stat.lastIndexOf(")");
            
            const comm = stat.substring(firstParen + 1, lastParen);
            const afterComm = stat.substring(lastParen + 2);
            const fields = afterComm.split(" ");
            
            return {
                pid,
                ppid: parseInt(fields[1]), 
                comm
            };
        } catch {
            return null;
        }
    }

    async *listProcesses(): AsyncIterable<number> {
        try {
            for await (const entry of Deno.readDir("/proc")) {
                if (entry.isDirectory && /^\d+$/.test(entry.name)) {
                    yield parseInt(entry.name);
                }
            }
        } catch {
            // Fallback for non-proc systems
        }
    }

    isAlive(pid: number): boolean {
        try {
            Deno.kill(pid, "SIGURG");
            return true;
        } catch (e) {
            return e instanceof Deno.errors.PermissionDenied;
        }
    }

    getOwnPid(): number {
        return Deno.pid;
    }
}

export class MacOSProcessProvider implements ProcessPort {
    async getProcessInfo(pid: number): Promise<ProcessInfo | null> {
        try {
            const command = new Deno.Command("ps", {
                args: ["-p", pid.toString(), "-o", "ppid,comm"],
                stdout: "piped",
            });
            const { stdout } = await command.output();
            const output = new TextDecoder().decode(stdout).split("\n")[1];
            if (!output) return null;

            const parts = output.trim().split(/\s+/);
            return {
                pid,
                ppid: parseInt(parts[0]),
                comm: parts[1]
            };
        } catch {
            return null;
        }
    }

    async *listProcesses(): AsyncIterable<number> {
        const command = new Deno.Command("ps", {
            args: ["-ax", "-o", "pid"],
            stdout: "piped",
        });
        const { stdout } = await command.output();
        const lines = new TextDecoder().decode(stdout).split("\n").slice(1);
        for (const line of lines) {
            const pid = parseInt(line.trim());
            if (!isNaN(pid)) yield pid;
        }
    }

    isAlive(pid: number): boolean {
        try {
            Deno.kill(pid, "SIGURG");
            return true;
        } catch (e) {
            return e instanceof Deno.errors.PermissionDenied;
        }
    }

    getOwnPid(): number {
        return Deno.pid;
    }
}

export class WindowsProcessProvider implements ProcessPort {
    async getProcessInfo(pid: number): Promise<ProcessInfo | null> {
        try {
            const command = new Deno.Command("powershell", {
                args: ["-Command", `Get-Process -Id ${pid} | Select-Object Id, ParentId, ProcessName | ConvertTo-Json`],
                stdout: "piped",
            });
            const { stdout } = await command.output();
            const data = JSON.parse(new TextDecoder().decode(stdout));
            return {
                pid: data.Id,
                ppid: data.ParentId || 0,
                comm: data.ProcessName
            };
        } catch {
            return null;
        }
    }

    async *listProcesses(): AsyncIterable<number> {
        const command = new Deno.Command("powershell", {
            args: ["-Command", "Get-Process | Select-Object -ExpandProperty Id"],
            stdout: "piped",
        });
        const { stdout } = await command.output();
        const pids = new TextDecoder().decode(stdout).split("\n");
        for (const line of pids) {
            const pid = parseInt(line.trim());
            if (!isNaN(pid)) yield pid;
        }
    }

    isAlive(pid: number): boolean {
        // Windows doesn't support SIGURG, use 0 to check if process exists
        try {
            Deno.kill(pid, 0 as any);
            return true;
        } catch (e) {
            return e instanceof Deno.errors.PermissionDenied;
        }
    }

    getOwnPid(): number {
        return Deno.pid;
    }
}
