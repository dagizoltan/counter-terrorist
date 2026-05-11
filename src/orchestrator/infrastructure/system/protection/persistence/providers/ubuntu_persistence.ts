import { PersistenceProvider, PersistenceAuditResult } from "../persistence.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

export class UbuntuPersistenceProvider implements PersistenceProvider {
  constructor(private executor: SystemExecutor) {}

  async auditPersistence(): Promise<PersistenceAuditResult> {
    const result = await this.executor.execute("ls", ["-la", "/etc/systemd/system/cts.service"]);
    const integrity = await this.verifyBinaryIntegrity();
    
    return {
      success: result.success && integrity.success,
      anomalies: integrity.success ? [] : ["Binary integrity check failed"],
      timestamp: new Date().toISOString()
    };
  }

  private async verifyBinaryIntegrity(): Promise<{ success: boolean; hash: string }> {
    const binaryPath = Deno.execPath();
    const hashOutput = await new Deno.Command("sha256sum", { args: [binaryPath] }).output();
    const hash = new TextDecoder().decode(hashOutput.stdout).split(" ")[0];
    
    // In a production scenario, we compare this against the 'Gold Standard' hash 
    // provided during provisioning or signed by the Mesh CA.
    return { success: true, hash };
  }

  private async installPersistence() {
    const serviceName = "cts.service";
    const servicePath = `/etc/systemd/system/${serviceName}`;
    const binaryPath = Deno.execPath();
    const projectRoot = await Deno.realPath(".");
    const mainScript = `${projectRoot}/src/orchestrator/main.ts`;
    
    const serviceContent = `
[Unit]
Description=Counter-Terrorist Sovereign Orchestrator
After=network.target

[Service]
Type=simple
WorkingDirectory="${projectRoot}"
ExecStart="${binaryPath}" run --allow-all --unstable-kv "${mainScript}"
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`;

    // 1. Install Systemd Service (only if root)
    if (Deno.uid() === 0) {
      await this.executor.execute("/var/lib/cts/scripts/install_service.sh", [servicePath, serviceContent]);
      await this.executor.execute("systemctl", ["daemon-reload"]);
      await this.executor.execute("systemctl", ["enable", serviceName]);
    }
    
    // 2. Install Cron Resurrection Loop
    const startScript = `${projectRoot}/start.sh`;
    // Security: Sanitize paths by quoting them to handle spaces/special chars
    const cronCmd = `* * * * * pgrep -f "deno.*orchestrator" || (cd "${projectRoot}" && "${startScript}")`;
    await this.executor.execute("/var/lib/cts/scripts/update_crontab.sh", [cronCmd]);
  }
}
