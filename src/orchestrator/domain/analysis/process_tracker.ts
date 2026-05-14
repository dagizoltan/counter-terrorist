import { LoggingPort, LogSeverity, LogType, SyslogSeverity } from "@core/ports.ts";
import { ProcessPort } from "@domain/ports/process_port.ts";
import { CommandPort } from "@core/ports.ts";

export interface ProcessNode {
    pid: number;
    ppid: number;
    comm: string;
    exe?: string;
    children: number[];
    isGhost?: boolean;
    influencedPids: number[];
}

/**
 * ProcessTracker
 * Domain service for behavioral process analysis.
 * Decoupled from system calls via ProcessPort.
 */
export class ProcessTracker {
    private tree: Map<number, ProcessNode> = new Map();
    private shells = ["bash", "sh", "dash", "zsh", "python", "perl", "php", "ruby"];
    private suspiciousParents = ["nginx", "apache2", "node", "python", "php-fpm", "clamscan"];

    constructor(
        private logging: LoggingPort, 
        private processProvider: ProcessPort,
        private command?: CommandPort
    ) {}

    updateProcess(pid: number, ppid: number, comm: string, isGhost: boolean = false) {
        let node = this.tree.get(pid);
        if (node) {
            node.ppid = ppid;
            node.comm = comm;
            node.isGhost = isGhost || node.isGhost;
        } else {
            node = { pid, ppid, comm, children: [], isGhost, influencedPids: [] };
            this.tree.set(pid, node);
        }

        if (ppid > 0) {
            const parent = this.tree.get(ppid);
            if (parent && !parent.children.includes(pid)) {
                parent.children.push(pid);
            }
        }
    }

    async analyzeEvent(pid: number, comm: string, metadata?: any): Promise<{ isStrayShell: boolean; reason?: string; ppid?: number }> {
        const stats = await this.processProvider.getProcessInfo(pid);
        const ppid = stats?.ppid || null;
        
        if (ppid) {
            this.updateProcess(pid, ppid, comm);
        }

        if (metadata?.influence && metadata.influence !== "NONE") {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.DEBUG,
                severity: LogSeverity.INFO,
                caller: "PROCESS:CAUSAL",
                message: `Influence detected: ${comm} (${pid}) -> ${metadata.influence}`
            });
        }

        if (this.shells.includes(comm)) {
            if (ppid) {
                const parentStats = await this.processProvider.getProcessInfo(ppid);
                if (parentStats) {
                    this.updateProcess(ppid, 0, parentStats.comm); 

                    if (this.suspiciousParents.some(p => parentStats.comm.includes(p))) {
                        return { isStrayShell: true, reason: `Shell spawned by suspicious parent: ${parentStats.comm}`, ppid };
                    }
                }
            }
        }

        return { isStrayShell: false, ppid: ppid || undefined };
    }

    async fullScan() {
        try {
            const processes = await this.processProvider.getAllProcesses();
            for (const stats of processes) {
                this.updateProcess(stats.pid, stats.ppid, stats.comm);
            }
            
            await this.scanForGhosts();
            
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "PROCESS",
                message: `Full scan failed: ${msg}`
            });
        }
    }

    getTree(): ProcessNode[] {
        return Array.from(this.tree.values());
    }

    async cleanup() {
        const deadPids: number[] = [];
        for (const pid of Array.from(this.tree.keys())) {
            if (!this.processProvider.isAlive(pid)) {
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

    async scanForGhosts(): Promise<number[]> {
        const ghosts: number[] = [];
        const ownPid = this.processProvider.getOwnPid();

        // PERF-03: Use /proc discovery instead of linear range scanning
        try {
            if (Deno.build.os === "linux") {
                for await (const entry of Deno.readDir("/proc")) {
                    if (entry.isDirectory && /^\d+$/.test(entry.name)) {
                        const pid = parseInt(entry.name);
                        if (pid === ownPid || pid < 2) continue;

                        const existing = this.tree.get(pid);
                        if (existing && !existing.isGhost) continue;

                        // STABILIZATION: Short-lived processes often vanish between readdir and stat.
                        // We implement a 50ms "Settling Delay" and retry before flagging a ghost.
                        let info = await this.processProvider.getProcessInfo(pid);

                        if (!info) {
                            await new Promise(r => setTimeout(r, 50));
                            info = await this.processProvider.getProcessInfo(pid);
                        }

                        if (!info) {
                            // If it's still missing after 50ms, it might be a ghost or just a terminated transient process.
                            // We check if the /proc directory still exists. If it doesn't, it was just transient.
                            try {
                                const stat = await Deno.stat(`/proc/${pid}`);
                                if (stat.isDirectory) {
                                    ghosts.push(pid);
                                    this.updateProcess(pid, 0, "[[GHOST_PROCESS]]", true);
                                }
                            } catch {
                                // Directory gone -> process exited naturally. Not a ghost.
                            }
                        } else {
                            // Filter kernel threads (PPID 2 or 0 depending on kernel)
                            if (info.ppid === 2 || info.ppid === 0) continue;
                        }
                    }
                }
            } else {
                // Fallback for non-linux environments (limited range)
                for (let pid = 1; pid <= 5000; pid++) {
                    if (pid === ownPid) continue;
                    if (!this.processProvider.isAlive(pid)) continue;
                    const info = await this.processProvider.getProcessInfo(pid);
                    if (!info) ghosts.push(pid);
                }
            }
        } catch (e) {
            // Silently handle /proc read errors to avoid crashing the forensic loop
        }

        if (ghosts.length > 0) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "FORENSICS",
                message: `GHOST PROCESSES DETECTED: ${ghosts.join(", ")}`
            });
        }
        return ghosts;
    }
}
