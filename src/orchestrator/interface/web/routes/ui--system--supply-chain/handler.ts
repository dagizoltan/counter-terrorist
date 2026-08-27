import { renderPage } from "../_render.ts";

export const handler = renderPage(() => import("./page.tsx"), "SupplyChainPage");
