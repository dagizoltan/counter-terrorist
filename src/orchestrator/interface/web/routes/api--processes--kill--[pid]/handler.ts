import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

/**
 * Terminate a process, with forensics captured first.
 *
 * The process tree shipped a "Terminate" button pointing at this path for as
 * long as the page has existed, with no route behind it — it was removed
 * rather than left lying, because a control that claims to SIGKILL and does
 * nothing is worse than no control.
 *
 * firewall.killProcess() is the real capability: it broadcasts an audit event,
 * attempts a memory-map dump through the provider's forensics hook, and only
 * then signals. The provider additionally refuses PID <= 1 and the
 * orchestrator's own PID; both are re-checked here so a bad request is
 * rejected at the edge rather than deep in a privileged path.
 *
 * Admin only. This is arbitrary remote process termination and should not be
 * reachable by an operator token.
 */
export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const raw = c.req.param("pid");
  const pid = Number(raw);

  if (!/^\d+$/.test(raw ?? "") || !Number.isSafeInteger(pid)) {
    return c.json({ success: false, error: "`pid` must be a positive integer" }, 400);
  }
  if (pid <= 1) {
    return c.json({ success: false, error: "Refusing to signal init or an invalid PID" }, 403);
  }
  if (pid === Deno.pid) {
    return c.json({ success: false, error: "Refusing to signal the orchestrator itself" }, 403);
  }

  const result = await services.protection.firewall.killProcess(pid);
  if (!result.success) {
    return c.json({ success: false, error: result.stderr || "Termination failed" }, 500);
  }

  return c.json({ pid, terminated: true });
};
