import { Hono } from "hono";
import { baseline } from "../services/baseline.ts";
import { antivirus } from "../protection/index.ts";
import { rkhunter } from "../protection/rkhunter.ts";

const api = new Hono();

api.get("/export", async (c) => {
    const report = {
        generatedAt: new Date().toISOString(),
        baseline: await baseline.checkDrift(),
        antivirus: await antivirus.getStatus(),
        rkhunter: rkhunter.getLastResult(),
        system: {
            os: Deno.build.os,
            arch: Deno.build.arch,
        }
    };

    return c.json(report);
});

export default api;
