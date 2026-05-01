import { LoggingPort, SyslogSeverity } from "@core/ports.ts";
import { CanaryService } from "./canary_service.ts";
import { HoneypotService } from "./honeypot_service.ts";

/**
 * DeceptionGridService
 * Orchestrates high-fidelity deception across the host and network.
 */
export class DeceptionGridService {
    constructor(
        private honeypot: HoneypotService,
        private canary: CanaryService,
        private logging: LoggingPort
    ) {}

    async start() {
        this.logging.log("[DECEPTION] Enhancing deception grid integrity...", SyslogSeverity.NOTICE);
        
        // 1. Inject Breadcrumbs into command history
        await this.injectHistoryBreadcrumbs();

        // 2. Deploy "Shadow Admin" SSH keys
        await this.deployShadowKeys();

        // 3. Infrastructure & Identity Lures (Cloud/Env)
        await this.canary.registerToken({
            id: "aws-credentials",
            path: "./.aws/credentials",
            desc: "Fake AWS access keys for cloud-level entrapment."
        });
        await this.canary.registerToken({
            id: "kube-config",
            path: "./.kube/config",
            desc: "Fake Kubernetes cluster config for lateral movement detection."
        });
        await this.canary.registerToken({
            id: "shadow-backup",
            path: "./secrets/shadow-bak.gpg",
            desc: "Simulated shadow file backup for credential harvesting detection."
        });

        // 4. Register high-value web targets
        await this.honeypot.registerModule({
            id: "kubernetes-api",
            name: "K8s API Decoy",
            port: 6443,
            description: "Fake Kubernetes API server to detect cluster-level lateral movement.",
            active: true
        });

        this.logging.log("[DECEPTION] Tactical deception grid fully engaged.", SyslogSeverity.NOTICE);
    }

    private async injectHistoryBreadcrumbs() {
        this.logging.log("[DECEPTION] Injecting fake administrative traces into process memory and history...", SyslogSeverity.DEBUG);
        // In a real scenario, we might append to .bash_history or similar
        // For this demo, we ensure the canary service has 'leak' tokens
        await this.canary.registerToken({
            id: "fake-vault-token",
            path: "/tmp/.vault-internal-session",
            desc: "Fake HashiCorp Vault token used as a lure for credential harvesters."
        });
    }

    private async deployShadowKeys() {
        this.logging.log("[DECEPTION] Deploying 'Shadow Admin' identity breadcrumbs...", SyslogSeverity.DEBUG);
        await this.canary.registerToken({
            id: "fake-ssh-key",
            path: "/tmp/.id_rsa.backup", // Using /tmp for better visibility in non-root
            desc: "Fake high-privilege SSH private key."
        });
    }

    /**
     * Periodically 'refreshes' the deception grid to prevent static fingerprinting.
     */
    async refresh() {
        this.logging.log("[DECEPTION] Refreshing deception signatures...", SyslogSeverity.INFORMATIONAL);
        await this.honeypot.morph();
    }
}
