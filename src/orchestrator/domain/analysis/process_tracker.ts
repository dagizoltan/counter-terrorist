import { LoggingPort, SyslogSeverity } from "@core/ports.ts";

export interface ProcessNode {
    pid: number;
    ppid: number;
    comm: string;
    exe?: string;
    children: number[];
}

export class ProcessTracker {
    private tree: Map<number, ProcessNode> = new Map();
    private shells = ["bash", "sh", "dash", "zsh", "python", "perl", "php", "ruby"];
    private suspiciousParents = ["nginx", "apache2", "node", "python", "php-fpm", "clamscan"];

    constructor(private logging: LoggingPort) {}

    updateProcess(pid: number, ppid: number, comm: string) {
        let node = this.tree.get(pid);
        if (node) {
            node.ppid = ppid;
            node.comm = comm;
        } else {
            node = { pid, ppid, comm, children: [] };
            this.tree.set(pid, node);
        }

        if (ppid > 0) {
            const parent = this.tree.get(ppid);
            if (parent && !parent.children.includes(pid)) {
                parent.children.push(pid);
            }
        }
    }

    async analyzeEvent(pid: number, comm: string): Promise<{ isStrayShell: boolean; reason?: string; ppid?: number }> {
        let ppid = await this.getPPID(pid);
        if (ppid) {
            this.updateProcess(pid, ppid, comm);
        }

        // Stray shell detection
        if (this.shells.includes(comm)) {
            if (ppid) {
                const parentComm = await this.getComm(ppid);
                if (parentComm) {
                    this.updateProcess(ppid, 0, parentComm); // Update parent if known

                    if (this.suspiciousParents.some(p => parentComm.includes(p))) {
                        return { isStrayShell: true, reason: `Shell spawned by suspicious parent: ${parentComm}`, ppid };
                    }
                }
            }
        }

        return { isStrayShell: false, ppid: ppid || undefined };
    }

    private async getPPID(pid: number): Promise<number | null> {
        try {
            const stat = await Deno.readTextFile(`/proc/${pid}/stat`);
            const lastParen = stat.lastIndexOf(")");
            const afterComm = stat.substring(lastParen + 2);
            const fields = afterComm.split(" ");
            return parseInt(fields[1]); // PPID is 4th field (index 1 after comm)
        } catch {
            return null;
        }
    }

    private async getComm(pid: number): Promise<string | null> {
        try {
            return (await Deno.readTextFile(`/proc/${pid}/comm`)).trim();
        } catch {
            return null;
        }
    }

    async fullScan() {
        try {
            for await (const entry of Deno.readDir("/proc")) {
                if (entry.isDirectory && /^\d+$/.test(entry.name)) {
                    const pid = parseInt(entry.name);
                    const ppid = await this.getPPID(pid);
                    const comm = await this.getComm(pid);
                    if (ppid !== null && comm !== null) {
                        this.updateProcess(pid, ppid, comm);
                    }
                }
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logging.log(`[PROCESS] Full scan failed: ${msg}`, SyslogSeverity.ERROR);
        }
    }

    getTree(): ProcessNode[] {
        return Array.from(this.tree.values());
    }

    /**
     * Cleans up processes that no longer exist.
     */
    async cleanup() {
        const deadPids: number[] = [];
        for (const pid of Array.from(this.tree.keys())) {
            try {
                await Deno.stat(`/proc/${pid}`);
            } catch {
                deadPids.push(pid);
            }
        }

        for (const pid of deadPids) {
            const node = this.tree.get(pid);
            if (node && node.ppid > 0) {
                const parent = this.tree.get(node.ppid);
                if (parent) {
                    parent.children = parent.children.filter(id => id !== pid);
                }
            }
            this.tree.delete(pid);
        }
    }

    /**
     * Scans for 'Ghost Processes'—PIDs that respond to signals but are hidden from /proc.
     * This is a primary detection method for rootkits and stealth malware.
     */
    async scanForGhosts(): Promise<number[]> {
        const ghosts: number[] = [];
        let maxPid = 65535;
        
        try {
            const pidMax = await Deno.readTextFile("/proc/sys/kernel/pid_max");
            maxPid = parseInt(pidMax.trim());
        } catch {
            // Fallback to 65535
        }

        // Performance: Only scan every 5th PID for a quick audit, or full scan if requested
        // For this sovereign implementation, we do a full scan on boot but limited to active ranges
        for (let pid = 1; pid <= maxPid; pid++) {
            // Skip the orchestrator's own PID if eBPF hiding is active (to avoid false positives)
            if (pid === Deno.pid && Deno.env.get("STEALTH_ENABLED") !== "false") continue;

            try {
                // Existence check using 'kill -0' via SystemExecutor or Deno.Command
                // Note: Deno.kill(pid, 0) is not supported in all Deno versions, so we use a faster check
                const procDir = await Deno.stat(`/proc/${pid}`).catch(() => null);
                
                // If the process is NOT in /proc, check if it's actually alive
                if (!procDir) {
                    const killRes = new Deno.Command("kill", {
                        args: ["-0", pid.toString()],
                        stdout: "null",
                        stderr: "null"
                    });
                    const { success } = await killRes.output();
                    
                    if (success) {
                        // Process exists in kernel but MISSING from /proc!
                        ghosts.push(pid);
                    }
                }
            } catch {
                // Permission denied or other error
            }
            
            // Yield to avoid blocking the event loop
            if (pid % 500 === 0) await new Promise(r => setTimeout(r, 0));
        }

        if (ghosts.length > 0) {
            this.logging.log(`[FORENSICS] GHOST PROCESSES DETECTED: ${ghosts.join(", ")}`, SyslogSeverity.CRITICAL);
        }
        return ghosts;
    }
}
