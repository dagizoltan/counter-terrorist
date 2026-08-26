import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

/**
 * The canary-token half of the deception grid.
 *
 * DeceptionGridService registers credential lures — fake AWS keys, a kube
 * config, a shadow backup, a Vault token, an SSH key — through CanaryService,
 * but nothing ever surfaced them: the deception page showed only the honeypot
 * port decoys, so the entire file-lure layer, and any trigger on it, was
 * invisible to the operator.
 *
 * Only the projection path (the lure's visible location) is exposed. masterPath
 * points at the ./volume source of truth and never leaves the server.
 *
 * Gated to operators: unlike the honeypot port list, the exact lure paths would
 * tell an insider which files to avoid.
 */
export const handlerFactory = (services: ServiceContainer) => (c: Context) => {
  const tokens = services.deceptionGrid?.canary?.getTokens?.() ?? [];
  const canaries = tokens.map((t) => ({
    id: t.id,
    path: t.projectionPath,
    description: t.description,
    triggered: !!t.triggered,
  }));
  return c.json(canaries);
};
