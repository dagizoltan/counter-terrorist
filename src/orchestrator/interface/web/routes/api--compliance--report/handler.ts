import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { ComplianceMapper } from "@domain/analysis/compliance_mapper.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
    const mapper = new ComplianceMapper();
    const events = await services.audit.getRecentEvents(500);
    const mapped = await mapper.mapEvents(events);
    return c.json(mapper.generateJsonReport(mapped));
};
