import { Context, Next } from "hono";

/**
 * apiConsistencyMiddleware
 * Ensures all API responses follow the { success: boolean, data?: T, error?: E } pattern.
 */
export async function apiConsistencyMiddleware(c: Context, next: Next) {
    if (!c.req.path.startsWith("/api") || c.req.header("upgrade") === "websocket") {
        return await next();
    }

    await next();

    // If the response is already a JSON success/error in our format, leave it
    // Otherwise, wrap it.
    if (c.res.status >= 200 && c.res.status < 300) {
        const contentType = c.res.headers.get("Content-Type");
        if (contentType?.includes("application/json")) {
            try {
                const body = await c.res.clone().json();
                if (body && typeof body === "object" && "success" in body) {
                    return; // Already in standard format
                }

                // Wrap the successful data
                c.res = c.json({
                    success: true,
                    data: body
                }, c.res.status as any);
            } catch {
                // Not JSON or empty body
                c.res = c.json({ success: true }, c.res.status as any);
            }
        }
    }
}
