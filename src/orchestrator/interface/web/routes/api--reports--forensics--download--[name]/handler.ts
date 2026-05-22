import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (_services: ServiceContainer) => async (c: Context) => {
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
