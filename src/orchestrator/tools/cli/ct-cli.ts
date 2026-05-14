/**
 * ct-cli: Headless Tactical Command Line Interface
 * Secured access to the Sovereign Defense Fabric via SSH.
 */
import { parse } from "https://deno.land/std@0.224.0/flags/mod.ts";

const args = parse(Deno.args);
const command = args._[0];

const API_BASE = "http://localhost:8000/api";
const TOKEN = Deno.env.get("API_TOKEN");

async function fetchApi(path: string, options: any = {}) {
    if (!TOKEN) {
        console.error("Error: API_TOKEN environment variable not set.");
        Deno.exit(1);
    }
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            "Authorization": `Bearer ${TOKEN}`,
            "X-CT-Token": TOKEN,
            ...options.headers
        }
    });
    if (!res.ok) {
        throw new Error(`API Request Failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
}

async function showStatus() {
    console.log("%c--- COUNTER-TERRORIST GRID STATUS ---", "color: cyan; font-weight: bold");
    try {
        const stats = await fetchApi("/stats");
        console.log(`Node ID: ${stats.node?.id || "Unknown"}`);
        console.log(`Uptime:  ${stats.node?.uptime || "Active"}`);
        console.log(`Health:  ${stats.audit?.integrityScore}% Integrity`);
        console.log(`Active Mesh Nodes: ${stats.mesh?.activeNodes || 0}`);
    } catch (e) {
        console.error("Failed to connect to orchestrator engine.");
    }
}

async function showLogs() {
    console.log("%c--- RECENT AUDIT TRAIL ---", "color: yellow");
    try {
        const logs = await fetchApi("/audit?limit=20");
        logs.forEach((l: any) => {
            console.log(`[${l.timestamp}] [${l.type}] ${l.message}`);
        });
    } catch (e) {
        console.error("Failed to retrieve audit trail.");
    }
}

async function triggerLockdown() {
    console.log("%c--- INITIATING EMERGENCY LOCKDOWN ---", "color: red; font-weight: bold");
    try {
        await fetchApi("/defense/lockdown", { method: "POST" });
        console.log("LOCKDOWN COMMAND BROADCAST TO MESH.");
    } catch (e) {
        console.error("Lockdown failed.");
    }
}

if (args.help || !command) {
    console.log(`
CT-CLI: Tactical Command Line Interface
Usage: ct-cli <command> [options]

Commands:
  status    Show grid health and metrics
  logs      Tail recent audit events
  lockdown  Trigger emergency mesh lockdown
`);
    Deno.exit(0);
}

switch (command) {
    case "status": await showStatus(); break;
    case "logs": await showLogs(); break;
    case "lockdown": await triggerLockdown(); break;
    default: console.error("Unknown command.");
}
