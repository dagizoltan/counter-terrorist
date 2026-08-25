import { assertEquals } from "@std/assert";
import { SupplyChainService } from "@domain/analysis/supply_chain.ts";

Deno.test("SupplyChainService SBOM Generation", async () => {
    const service = new SupplyChainService();
    // Manually trigger init (which calls generateSbom)
    await service.init();

    const sbom = service.getSBOM();
    assertEquals(sbom.length > 0, true);

    // Check if some expected Rust dependencies are there (from cts_ipc or others)
    const hasSerde = sbom.some(d => d.name === "serde");
    assertEquals(hasSerde, true);

    // Verify file output
    let fileContent;
    try {
        fileContent = await Deno.readTextFile("./volume/storage/sbom.json");
    } catch {
        fileContent = await Deno.readTextFile("sbom.json");
    }

    const parsedSbom = JSON.parse(fileContent);
    assertEquals(parsedSbom.bomFormat, "CycloneDX");
    assertEquals(parsedSbom.components.length, sbom.length);
});
