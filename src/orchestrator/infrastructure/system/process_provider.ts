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
        for await (const entry of Deno.readDir("/proc")) {
            if (entry.isDirectory && /^\d+$/.test(entry.name)) {
                yield parseInt(entry.name);
            }
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
