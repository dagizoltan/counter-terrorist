import { Context } from "hono";
import { jsx } from "hono/jsx";

export const dashboardHandler = async (c: Context) => {
  const { Dashboard } = await import("./dashboard/page.tsx");
  const { status, csrfToken, nonce, hostname, userRole } = c.get("uiContext");
  return c.html(jsx(Dashboard, { status, csrfToken, nonce, hostname, userRole }) as any);
};

export const sysInfoHandler = async (c: Context) => {
  const { SysInfoPage } = await import("./sysinfo/page.tsx");
  const { status, csrfToken, nonce, hostname, userRole } = c.get("uiContext");
  return c.html(jsx(SysInfoPage, { status, csrfToken, nonce, hostname, userRole }) as any);
};

export const threatMapHandler = async (c: Context) => {
  const { ThreatMapPage } = await import("./intel/ThreatMapPage.tsx");
  const { status, csrfToken, nonce, userRole } = c.get("uiContext");
  return c.html(jsx(ThreatMapPage, { status, csrfToken, nonce, userRole }) as any);
};

export const operationalNewsHandler = async (c: Context) => {
  const { NewsPage: OperationalNewsPage } = await import("./intel/OperationalNewsPage.tsx");
  const { status, csrfToken, nonce, userRole } = c.get("uiContext");
  return c.html(jsx(OperationalNewsPage, { status, csrfToken, nonce, userRole }) as any);
};
