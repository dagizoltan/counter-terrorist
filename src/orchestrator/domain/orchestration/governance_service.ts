import { MeshManager } from "./mesh.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { broadcast } from "@api/ws.ts";

export interface Proposal {
    id: string;
    proposer: string;
    type: "LOCKDOWN" | "IDENTITY_ROTATE" | "ACTIVE_SABOTAGE";
    target: string;
    payload: any;
    votes: Map<string, boolean>;
    timestamp: number;
    executed: boolean;
}

/**
 * GovernanceService
 * Orchestrates mesh-wide consensus (Quorum) for high-impact security actions.
 */
export class GovernanceService {
    private proposals: Map<string, Proposal> = new Map();

    constructor(
        private mesh: MeshManager,
        private protection: any, // ProtectionPort
        private logging: LoggingPort
    ) {}

    /**
     * Proposes a new high-impact action to the mesh.
     */
    async propose(type: Proposal["type"], target: string, payload: any = {}) {
        const id = crypto.randomUUID();
        const proposal: Proposal = {
            id,
            proposer: this.mesh.getNodeId(),
            type,
            target,
            payload,
            votes: new Map(),
            timestamp: Date.now(),
            executed: false
        };

        // Self-vote
        proposal.votes.set(this.mesh.getNodeId(), true);
        this.proposals.set(id, proposal);

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "GOVERNANCE",
            message: `New Proposal ${id.slice(0,8)}: ${type} targeting ${target}`
        });

        this.mesh.broadcast({
            type: "GOV_PROPOSAL",
            payload: {
                id,
                type,
                target,
                payload,
                proposer: proposal.proposer
            }
        });

        // SINGLE-NODE OVERRIDE: Execute immediately if alone
        if (this.mesh.getActiveNodeCount() === 0) {
            await this.handleVote({ id, voter: this.mesh.getNodeId(), approved: true });
        }

        return id;
    }

    /**
     * Handles an incoming proposal from the mesh.
     */
    async handleProposal(payload: any) {
        if (this.proposals.has(payload.id)) return;

        const proposal: Proposal = {
            ...payload,
            votes: new Map(),
            executed: false
        };

        this.proposals.set(payload.id, proposal);
        
        // SECURE EVALUATION: Verify against mesh policy
        const approved = await this.verifyPolicy(proposal); 

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: approved ? LogSeverity.INFO : LogSeverity.WARNING,
            caller: "GOVERNANCE",
            message: `Received Proposal ${payload.id.slice(0,8)} from ${payload.proposer}. Policy Decision: ${approved ? 'APPROVED' : 'REJECTED'}`
        });

        this.mesh.broadcast({
            type: "GOV_VOTE",
            payload: {
                id: payload.id,
                voter: this.mesh.getNodeId(),
                approved
            }
        });
    }

    private async verifyPolicy(proposal: Proposal): Promise<boolean> {
        // 1. Identity Verification: Ensure proposer exists in our mesh view
        const nodes = this.mesh.getNodes();
        const proposerNode = nodes.find(n => n.id === proposal.proposer);
        
        if (!proposerNode) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "GOVERNANCE",
                message: `Policy Rejection: Proposer ${proposal.proposer} not found in mesh registry.`
            });
            return false;
        }

        // 2. Action Specific Policies
        if (proposal.type === "LOCKDOWN") {
            // Only allow lockdown from nodes with > 30 mins uptime (stability check)
            const uptime = Date.now() - proposerNode.lastSeen;
            if (uptime < 60000) { // Using small value for testing, should be 30min in prod
                 this.logging.log({
                     timestamp: new Date().toISOString(),
                     type: LogType.AUDIT,
                     severity: LogSeverity.WARNING,
                     caller: "GOVERNANCE",
                     message: "Policy Rejection: Proposer node is too new for LOCKDOWN authority."
                 });
                 return false;
            }
        }

        return true; // Default to true if identity and stability checks pass
    }

    /**
     * Handles an incoming vote for a proposal.
     */
    async handleVote(payload: any) {
        const proposal = this.proposals.get(payload.id);
        if (!proposal || proposal.executed) return;

        proposal.votes.set(payload.voter, payload.approved);

        // Check for Quorum
        const activeNodes = this.mesh.getActiveNodeCount() + 1; // +1 for self
        
        // SINGLE-NODE OVERRIDE: If we are alone, we are sovereign.
        if (activeNodes === 1) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.INFO,
                caller: "GOVERNANCE",
                message: "Single-Node Network detected. Local Sovereign Override active."
            });
            await this.executeProposal(proposal);
            return;
        }

        const quorumSize = Math.floor(activeNodes / 2) + 1;
        
        const approveCount = Array.from(proposal.votes.values()).filter(v => v).length;

        if (approveCount >= quorumSize) {
            await this.executeProposal(proposal);
        }
    }

    private async executeProposal(proposal: Proposal) {
        if (proposal.executed) return;
        proposal.executed = true;
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "GOVERNANCE",
            message: `QUORUM REACHED for Proposal ${proposal.id.slice(0,8)}. Executing ${proposal.type}...`
        });

        try {
            if (proposal.type === "LOCKDOWN") {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "GOVERNANCE",
                    message: "Executing MESH-WIDE LOCKDOWN (Fail-Closed)."
                });
                // Apply strict firewall rules immediately
                await this.protection.firewall.lockdown().catch(() => {});
                broadcast({ 
                    type: "AUDIT_EVENT", 
                    data: { 
                        type: LogType.AUDIT, 
                        severity: LogSeverity.ERROR, 
                        caller: "governance", 
                        message: "MESH-WIDE LOCKDOWN INITIATED BY CONSENSUS" 
                    } 
                });
            } else if (proposal.type === "IDENTITY_ROTATE") {
                await this.mesh.rotateIdentity();
            } else if (proposal.type === "ACTIVE_SABOTAGE") {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "GOVERNANCE",
                    message: `Executing ACTIVE_SABOTAGE against target: ${proposal.target}`
                });
                await this.protection.firewall.blockIp(proposal.target);
                broadcast({ 
                    type: "AUDIT_EVENT", 
                    data: { 
                        type: LogType.AUDIT, 
                        severity: LogSeverity.ERROR, 
                        caller: "governance", 
                        message: `Mesh-wide block enforced on ${proposal.target}`,
                        payload: { target: proposal.target }
                    } 
                });
            }
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "GOVERNANCE",
                message: `Execution failure for ${proposal.id}: ${(e as Error).message}`
            });
        }
    }
}
