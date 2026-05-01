export interface Dependency {
    name: string;
    version: string;
    license: string;
    status: 'SECURE' | 'VULNERABLE' | 'UNKNOWN';
    cve?: string;
}

export class SupplyChainService {
    private dependencies: Dependency[] = [];

    constructor() {
        this.dependencies = [
            // Deno Orchestrator Deps
            { name: "hono", version: "v4.3.7", license: "MIT", status: "SECURE" },
            { name: "preact", version: "10.19.0", license: "MIT", status: "SECURE" },
            // Rust Agent Deps
            { name: "aya", version: "0.12.0", license: "MIT", status: "SECURE" },
            { name: "tokio", version: "1.35.1", license: "MIT", status: "SECURE" },
            { name: "serde", version: "1.0.195", license: "MIT", status: "SECURE" },
            { name: "notify", version: "6.1.1", license: "MIT", status: "SECURE" },
            // Potential Vulnerability Simulation
            { name: "old-lib-example", version: "0.1.0", license: "Apache-2.0", status: "VULNERABLE", cve: "CVE-2026-9999" }
        ];
    }

    getSBOM() {
        return this.dependencies;
    }

    getVexReport() {
        return this.dependencies.filter(d => d.status === 'VULNERABLE');
    }

    getHealthScore() {
        const secure = this.dependencies.filter(d => d.status === 'SECURE').length;
        return Math.round((secure / this.dependencies.length) * 100);
    }
}
