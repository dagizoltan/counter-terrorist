import { LoggingPort, LogSeverity, LogType, SyslogSeverity, EventBusPort } from "@core/ports.ts";
import { ProcessPort } from "@domain/ports/process_port.ts";
import { CommandPort } from "@core/ports.ts";
import { BaseService } from "@core/base_service.ts";
import { Result, ok } from "../../core/result.ts";
import { EventBus } from "./events.ts";

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
export class ProcessTracker extends BaseService {
    private tree: Map<number, ProcessNode> = new Map();
    private shells = ["bash", "sh", "dash", "zsh", "python", "perl", "php", "ruby"];
    private suspiciousParents = ["nginx", "apache2", "node", "python", "php-fpm", "clamscan"];

    private intervalId?: ReturnType<typeof setInterval>;
    private metricsInterval?: ReturnType<typeof setInterval>;
    private cleanupInterval?: ReturnType<typeof setInterval>;

    constructor(
        private logging: LoggingPort, 
        private processProvider: ProcessPort,
        private command?: CommandPort
    ) {
        super();
    }

    protected override async onInit(): Promise<Result<void>> {
        // Automated tree cleanup to prevent memory leak
        this.cleanupInterval = setInterval(() => this.cleanup(), 300000); // Every 5 minutes
        this.metricsInterval = setInterval(() => this.emitMetrics(), 30000);
        return ok(undefined);
    }

    override setEventBus(eventBus: EventBusPort) {
        super.setEventBus(eventBus);
    }

    private async emitMetrics() {
        if (!this.eventBus) return;
        await this.eventBus.emit("METRIC_UPDATE", {
            domain: "forensics",
            data: {
                processCount: this.tree.size,
                ebpfActive: this.command?.isRunning("sentinel") || false,
                fimActive: this.command?.isRunning("watchfile") || false
            }
        });
    }

    protected override async onShutdown(): Promise<Result<void>> {
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);
        if (this.metricsInterval) clearInterval(this.metricsInterval);
        return ok(undefined);
    }

    updateProcess(pid: number, ppid: number, comm: string, isGhost: boolean = false) {
        let node = this.tree.get(pid);
        if (node) {
            // BUG FIX: Remove from old parent if PPID changed to prevent memory leak
            if (node.ppid !== ppid && node.ppid > 0) {
                const oldParent = this.tree.get(node.ppid);
                if (oldParent) {
                    oldParent.children = oldParent.children.filter(id => id !== pid);
                }
            }
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
        // Robust parent lookup to handle race conditions where parent exits mid-analysis
        const [stats, activePids] = await Promise.all([
            this.processProvider.getProcessInfo(pid),
            (async () => {
                const set = new Set<number>();
                for await (const p of this.processProvider.listProcesses()) set.add(p);
                return set;
            })()
        ]);

        const ppid = stats?.ppid || null;
        
        if (ppid) {
            this.updateProcess(pid, ppid, comm);
        }

        if (this.shells.includes(comm)) {
            if (ppid) {
                const parentStats = await this.processProvider.getProcessInfo(ppid);
                if (parentStats) {
                    this.updateProcess(ppid, parentStats.ppid || 0, parentStats.comm);

                    if (this.suspiciousParents.some(p => parentStats.comm.includes(p))) {
                        return { isStrayShell: true, reason: `Shell spawned by suspicious parent: ${parentStats.comm}`, ppid };
                    }
                } else if (!activePids.has(ppid)) {
                    // Parent already dead, check our internal tree as fallback
                    const cachedParent = this.tree.get(ppid);
                    if (cachedParent && this.suspiciousParents.some(p => cachedParent.comm.includes(p))) {
                        return { isStrayShell: true, reason: `Shell spawned by suspicious short-lived parent: ${cachedParent.comm}`, ppid };
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

        // Performance Optimization: Use listProcesses() to get the actual process set
        // and compare it with the internal tree. Probing 65k ranges is inefficient.
        const activePids = new Set<number>();
        for await (const pid of this.processProvider.listProcesses()) {
            activePids.add(pid);
        }

        // 1. Identify missing processes from our tree (cleanup)
        for (const pid of Array.from(this.tree.keys())) {
            if (!activePids.has(pid) && pid !== ownPid) {
                // If it's in our tree but not active, it's either gone or hiding
                // check isAlive for definitive confirmation
                if (this.processProvider.isAlive(pid)) {
                    const node = this.tree.get(pid);
                    if (node && !node.isGhost) {
                        ghosts.push(pid);
                        node.isGhost = true;
                        node.comm = `[[GHOST_PROCESS:${node.comm}]]`;
                    }
                }
            }
        }

        // 2. Identify active processes not in our tree (new/missed)
        for (const pid of activePids) {
            if (!this.tree.has(pid) && pid !== ownPid) {
                const info = await this.processProvider.getProcessInfo(pid);
                if (info) {
                    this.updateProcess(pid, info.ppid, info.comm);
                }
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
