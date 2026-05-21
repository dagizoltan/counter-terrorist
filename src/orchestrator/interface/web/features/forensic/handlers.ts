import { Context } from "hono";
import { jsx } from "hono/jsx";

export const forensicCenterHandler = async (c: Context) => {
  const { ForensicCenterPage } = await import("./ForensicCenter.tsx");
  const { csrfToken, nonce, userRole } = c.get("uiContext");
  return c.html(jsx(ForensicCenterPage, { csrfToken, nonce, userRole }) as any);
};

export const complianceCenterHandler = async (c: Context) => {
  const { ComplianceCenterPage } = await import("./compliance/ComplianceCenter.tsx");
  const { status, csrfToken, nonce, userRole } = c.get("uiContext");
  return c.html(jsx(ComplianceCenterPage, { status, csrfToken, nonce, userRole }) as any);
};

export const auditPageHandler = async (c: Context) => {
  const { AuditPage } = await import("./audit/page.tsx");
  const { csrfToken, nonce, hostname, userRole } = c.get("uiContext");
  return c.html(jsx(AuditPage, { csrfToken, nonce, hostname, userRole }) as any);
};
