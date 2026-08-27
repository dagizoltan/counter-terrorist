import { Context } from "hono";
import { jsx } from "hono/jsx";

/**
 * Shared page-render factory for the plain UI routes.
 *
 * Sixteen UI handlers were byte-identical apart from the page component they
 * imported and the subset of uiContext fields they happened to destructure.
 * That subset was cosmetic: a hono/jsx page component reads only the props it
 * declares, so handing every page the full uiContext superset plus the route's
 * path params renders exactly the same markup while removing sixteen copies of
 * the same six lines. See middleware/ui_context.ts for the uiContext shape
 * ({ status, csrfToken, nonce, hostname, userRole }).
 *
 * `importer` defers the page-module import so it stays lazy per request, exactly
 * as the hand-written handlers did — the module resolves once and is cached
 * thereafter. `exportName` selects the page component and defaults to the
 * module's default export for the pages that ship one.
 *
 * This factory is deliberately for the plain "render a page from uiContext"
 * handlers only. Routes that need service lookups, dispatch, or a 404 decision
 * (agents, agents/:name, deception, deception/:id, login) keep their bespoke
 * handlers.
 */
type PageModule = Record<string, unknown>;

export function renderPage(
  importer: () => Promise<PageModule>,
  exportName = "default",
) {
  return async (c: Context) => {
    const mod = await importer();
    const Page = mod[exportName];
    if (typeof Page !== "function") {
      throw new Error(`renderPage: export "${exportName}" is not a component`);
    }
    const ctx = c.get("uiContext") ?? {};
    // Path params (e.g. :id) merge on top; no uiContext field shares their name.
    return c.html(jsx(Page as any, { ...ctx, ...c.req.param() }) as unknown as string);
  };
}
