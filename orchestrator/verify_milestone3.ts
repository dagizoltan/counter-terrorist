import { firewall } from "./protection/firewall.ts";
import { vpn } from "./protection/vpn.ts";
import { commandManager } from "./command_manager.ts";

console.log("--- Milestone 3 Verification Script ---");

async function testFirewall() {
    console.log("\n[Testing FirewallManager]");

    console.log("1. Testing getStatus...");
    const status = await firewall.getStatus();
    console.log("Status:", JSON.stringify(status, null, 2));

    console.log("\n2. Testing blockIp (Dry run via log)...");
    const blockResult = await firewall.blockIp("192.168.1.100");
    console.log("Block Result:", JSON.stringify(blockResult, null, 2));

    console.log("\n3. Testing unblockIp (Dry run via log)...");
    const unblockResult = await firewall.unblockIp("192.168.1.100");
    console.log("Unblock Result:", JSON.stringify(unblockResult, null, 2));
}

async function testVpn() {
    console.log("\n[Testing VpnManager]");

    console.log("1. Testing isConnected...");
    const connected = await vpn.isConnected();
    console.log("Is Connected:", connected);

    console.log("\n2. Testing enableKillSwitch...");
    const eksResult = await vpn.enableKillSwitch("1.2.3.4", "wg0");
    console.log("Enable Kill-Switch Result:", JSON.stringify(eksResult, null, 2));

    console.log("\n3. Testing disableKillSwitch...");
    const dksResult = await vpn.disableKillSwitch();
    console.log("Disable Kill-Switch Result:", JSON.stringify(dksResult, null, 2));

    console.log("\n4. Testing Monitoring Loop (briefly)...");
    vpn.startMonitoring(1000);
    await new Promise(resolve => setTimeout(resolve, 2500));
    vpn.stopMonitoring();
    console.log("Monitoring loop finished.");
}

async function main() {
    try {
        await testFirewall();
        await testVpn();
        console.log("\n--- Verification Completed ---");
    } catch (error) {
        console.error("Verification failed:", error);
    }
}

main();
