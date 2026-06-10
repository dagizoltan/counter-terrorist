import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
    const pidStr = c.req.query("pid");
    const searchTerm = c.req.query("q");
    const pid = pidStr ? parseInt(pidStr) : undefined;

    const result = await services.viewModels.getForensicCausalGraph(pid, searchTerm);
    return c.json(result);
};
