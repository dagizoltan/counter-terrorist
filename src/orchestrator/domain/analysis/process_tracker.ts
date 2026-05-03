import { LoggingPort, SyslogSeverity } from "@core/ports.ts";

export interface ProcessNode {
    pid: number;
    ppid: number;
    comm: string;
    exe?: string;
    children: number[];
    isGhost?: boolean;
}

export class ProcessTracker {
    private tree: Map<number, ProcessNode> = new Map();
    private shells = ["bash", "sh", "dash", "zsh", "python", "perl", "php", "ruby"];
    private suspiciousParents = ["nginx", "apache2", "node", "python", "php-fpm", "clamscan"];

    constructor(private logging: LoggingPort) {}

    updateProcess(pid: number, ppid: number, comm: string, isGhost: boolean = false) {
        let node = this.tree.get(pid);
        if (node) {
            node.ppid = ppid;
            node.comm = comm;
            node.isGhost = isGhost || node.isGhost;
        } else {
            node = { pid, ppid, comm, children: [], isGhost };
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
        const stats = await this.getStat(pid);
        const ppid = stats?.ppid || null;
        
        if (ppid) {
            this.updateProcess(pid, ppid, comm);
        }

        // Stray shell detection
        if (this.shells.includes(comm)) {
            if (ppid) {
                const parentStats = await this.getStat(ppid);
                if (parentStats) {
                    this.updateProcess(ppid, 0, parentStats.comm); // Update parent if known

                    if (this.suspiciousParents.some(p => parentStats.comm.includes(p))) {
                        return { isStrayShell: true, reason: `Shell spawned by suspicious parent: ${parentStats.comm}`, ppid };
                    }
                }
            }
        }

        return { isStrayShell: false, ppid: ppid || undefined };
    }

    private async getStat(pid: number): Promise<{ ppid: number; comm: string } | null> {
        try {
            const stat = await Deno.readTextFile(`/proc/${pid}/stat`);
            const firstParen = stat.indexOf("(");
            const lastParen = stat.lastIndexOf(")");
            
            const comm = stat.substring(firstParen + 1, lastParen);
            const afterComm = stat.substring(lastParen + 2);
            const fields = afterComm.split(" ");
            
            return {
                ppid: parseInt(fields[1]), // PPID is 4th field (index 1 after comm)
                comm
            };
        } catch {
            return null;
        }
    }

    async fullScan() {
        try {
            // 1. Regular Proc Scan
            for await (const entry of Deno.readDir("/proc")) {
                if (entry.isDirectory && /^\d+$/.test(entry.name)) {
                    const pid = parseInt(entry.name);
                    const stats = await this.getStat(pid);
                    if (stats) {
                        this.updateProcess(pid, stats.ppid, stats.comm);
                    }
                }
            }
            
            // 2. Ghost Process Reconciliation
            await this.scanForGhosts();
            
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
                // Use Deno.kill with harmless signal to check existence
                Deno.kill(pid, "SIGURG");
            } catch (e) {
                if (!(e instanceof Deno.errors.PermissionDenied)) {
                    deadPids.push(pid);
                }
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
        let maxPid = 32768; // Conservative fallback
        
        try {
            const pidMax = await Deno.readTextFile("/proc/sys/kernel/pid_max");
            maxPid = Math.min(parseInt(pidMax.trim()), 100000); // Caps scan range for performance
        } catch { /* use fallback */ }

        for (let pid = 1; pid <= maxPid; pid++) {
            // Skip the orchestrator's own PID if eBPF hiding is active
            if (pid === Deno.pid && Deno.env.get("STEALTH_ENABLED") !== "false") continue;

            try {
                // Fast-fail if already in tree and not a ghost
                const existing = this.tree.get(pid);
                if (existing && !existing.isGhost) continue;

                const procDir = await Deno.stat(`/proc/${pid}`).catch(() => null);
                
                if (!procDir) {
                    try {
                        // Use Deno.kill with a harmless signal to check existence.
                        // If it doesn't throw, the PID exists in the kernel.
                        Deno.kill(pid, "SIGURG");
                        
                        ghosts.push(pid);
                        this.updateProcess(pid, 0, "[[GHOST_PROCESS]]", true);
                    } catch (e) {
                        if (e instanceof Deno.errors.PermissionDenied) {
                            // PID exists but we can't signal it - still a ghost if not in /proc!
                            ghosts.push(pid);
                            this.updateProcess(pid, 0, "[[GHOST_PROCESS]]", true);
                        }
                        // Otherwise (NotFound), it doesn't exist.
                    }
                }
            } catch { /* No permission or other error */ }
            
            // Yield every 1000 PIDs to avoid blocking
            if (pid % 1000 === 0) await new Promise(r => setTimeout(r, 0));
        }

        if (ghosts.length > 0) {
            this.logging.log(`[FORENSICS] GHOST PROCESSES DETECTED: ${ghosts.join(", ")}`, SyslogSeverity.CRITICAL);
        }
        return ghosts;
    }
}
