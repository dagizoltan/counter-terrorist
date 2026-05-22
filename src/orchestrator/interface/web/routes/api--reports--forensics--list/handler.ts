import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (_services: ServiceContainer) => async (c: Context) => {
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
