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
        const stats = await this.processProvider.getProcessInfo(pid);
        const ppid = stats?.ppid || null;
        
        if (ppid) {
            this.updateProcess(pid, ppid, comm);
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
            for await (const pid of this.processProvider.listProcesses()) {
                const stats = await this.processProvider.getProcessInfo(pid);
                if (stats) {
                    this.updateProcess(pid, stats.ppid, stats.comm);
                }
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

        // BUG-53: Optimized chunked scan to avoid blocking the main thread
        const CHUNK_SIZE = 500;
        for (let pid = 1; pid <= 20000; pid++) {
            if (pid === ownPid) continue;

            const existing = this.tree.get(pid);
            if (existing && !existing.isGhost) continue;

            const info = await this.processProvider.getProcessInfo(pid);

            if (!info) {
                if (this.processProvider.isAlive(pid)) {
                    ghosts.push(pid);
                    this.updateProcess(pid, 0, "[[GHOST_PROCESS]]", true);
                }
            }

            // Yield execution after each chunk
            if (pid % CHUNK_SIZE === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
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
