import { Context } from "hono";
import { BaselineService } from "@domain/index.ts";
import { ProtectionPort } from "@core/ports.ts";
import { ForensicService } from "@domain/index.ts";

export const exportReportHandler = (baseline: BaselineService, protection: ProtectionPort) => async (c: Context) => {
  const report = {
      generatedAt: new Date().toISOString(),
      baseline: await baseline.checkDrift(),
      antivirus: await protection.antivirus.getStatus(),
      rkhunter: protection.rkhunter.getLastResult(),
      system: {
          os: Deno.build.os,
          arch: Deno.build.arch,
      }
  };

  return c.json(report);
};

export const listForensicArtifactsHandler = () => async (c: Context) => {
  const forensicDir = "./volume/storage/forensics";
  const artifacts = [];

  try {
      for await (const entry of Deno.readDir(forensicDir)) {
          if (entry.isFile) {
              const stat = await Deno.stat(`${forensicDir}/${entry.name}`);
              artifacts.push({
                  name: entry.name,
                  size: stat.size,
                  mtime: stat.mtime?.toISOString(),
                  type: entry.name.endsWith(".pcap") ? "NETWORK_CAPTURE" : "MEMORY_DUMP"
              });
          }
      }
  } catch (e) {
      // Directory might not exist yet
  }

  return c.json(artifacts);
};

export const bundleForensicsHandler = (forensics: ForensicService) => async (c: Context) => {
  const bundle = await forensics.generateEvidenceBundle();
  return c.json({ success: true, bundleId: bundle.id });
};

export const downloadForensicArtifactHandler = () => async (c: Context) => {
  const name = c.req.param("name");

  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
      return c.json({ error: "Invalid filename" }, 400);
  }

  const forensicDir = "./volume/storage/forensics";
  const filePath = `${forensicDir}/${name}`;

  try {
      const file = await Deno.open(filePath, { read: true });
      c.header("Content-Type", name.endsWith(".pcap") ? "application/vnd.tcpdump.pcap" : "application/octet-stream");
      c.header("Content-Disposition", `attachment; filename="${name}"`);
      return c.body(file.readable as any);
  } catch (e) {
      return c.json({ error: "File not found" }, 404);
  }
};
