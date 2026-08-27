import { renderPage } from "../_render.ts";

// A plain factory render on purpose: the shell renders for any id and the
// island resolves it live against /api/network/neighbors/:id, reporting a clean
// "no longer visible" state instead of a hard server 404. (Contrast
// deception/:id, which keeps a bespoke handler precisely to 404 an unknown id.)
// The factory passes the :id param straight through to NetworkDetailPage.
export const handler = renderPage(() => import("./page.tsx"), "NetworkDetailPage");
