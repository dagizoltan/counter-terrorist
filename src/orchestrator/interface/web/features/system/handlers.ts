import { Context } from "hono";
import { jsx } from "hono/jsx";

export const systemInfoHandler = async (c: Context) => {
  const { SystemInfoPage } = await import("./info_page.tsx");
  const { status, csrfToken, nonce, hostname, userRole } = c.get("uiContext");
  return c.html(jsx(SystemInfoPage, { status, csrfToken, nonce, hostname, userRole }));
};

export const supplyChainHandler = async (c: Context) => {
  const { SupplyChainPage } = await import("./supply_chain_page.tsx");
  const { status, csrfToken, nonce, hostname, userRole } = c.get("uiContext");
  return c.html(jsx(SupplyChainPage, { status, csrfToken, nonce, hostname, userRole }));
};

export const settingsHandler = async (c: Context) => {
  const { NotificationsPage } = await import("../governance/settings/notifications.tsx");
  const { status, csrfToken, nonce, hostname, userRole } = c.get("uiContext");
  return c.html(jsx(NotificationsPage, { status, csrfToken, nonce, hostname, userRole }));
};
