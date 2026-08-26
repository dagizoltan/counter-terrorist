import { Hono, Context, Next } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { SecurityMiddleware } from "../middleware/security.ts";

const ROUTES_DIR = new URL(".", import.meta.url);

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

type RouteModule = {
  handler?: (c: Context) => Promise<unknown>;
  handlerFactory?: (services: ServiceContainer, getStatus: () => Promise<unknown>) => (c: Context) => Promise<unknown>;
  middlewareFactory?: (services: ServiceContainer, security: SecurityMiddleware) => Array<any>;
  authRoles?: Array<"admin" | "operator" | "viewer">;
  method?: HttpMethod;
  methods?: HttpMethod[];
  page?: unknown;
  css?: string;
  islands?: string[];
  publicRoute?: boolean;
};

type RouteEntry = {
  path: string;
  module: RouteModule;
};

export async function registerRoutes(app: Hono, services: ServiceContainer, security: SecurityMiddleware, getStatus: () => Promise<unknown>) {
  await registerAuthRoutes(app, services);
  await registerUiRoutes(app, services, security, getStatus);
  await registerApiRoutes(app, services, security, getStatus);
}

async function registerAuthRoutes(app: Hono, services: ServiceContainer) {
  const authDeps = {
    checkLoginRateLimit: async (ip: string) => {
      const result = await services.rateLimit.checkLimit(`login:${ip}`, 10, 60000);
      return { allowed: result.allowed, retryAfterMs: result.retryAfterMs };
    },
    isTokenValid: async (token: string) => {
      const { secureCompare } = await import("@infrastructure/system/validation.ts");
      if (await secureCompare(token, services.config.getToken())) return "admin";
      const result = await services.apiKeys.validateApiKey(token);
      return (result.success && result.data) ? result.data : null;
    },
    sessionService: services.sessions,
    config: services.config
  };

  const noopStatus = () => Promise.resolve({} as unknown);
  const loginRoute = await loadRouteModule("ui--login", services, noopStatus);
  if (loginRoute?.module?.handler) {
    app.get(loginRoute.path, loginRoute.module.handler as any);
    app.get(`${loginRoute.path}/`, (c) => c.redirect(loginRoute.path));
  }

  const { postLoginHandler, logoutHandler } = await import("./ui--login/handlers.ts");
  app.post("/login", postLoginHandler(authDeps));
  app.post("/logout", logoutHandler(authDeps));
  app.get("/logout/", (c) => c.redirect("/logout"));
}

async function registerUiRoutes(app: Hono, services: ServiceContainer, security: SecurityMiddleware, getStatus: () => Promise<unknown>) {
  const uiRoutes = await loadRouteModules("ui", services, security, getStatus);
  const publicRoutes = uiRoutes.filter((entry) => entry.module.publicRoute);
  const protectedRoutes = uiRoutes.filter((entry) => !entry.module.publicRoute && entry.path !== "/login");
  const publicPaths = new Set([
    "/login",
    "/login/",
    "/logout",
    "/logout/",
    ...publicRoutes.flatMap((entry) => [entry.path, `${entry.path}/`])
  ]);

  publicRoutes.forEach((entry) => {
    app.get(entry.path, entry.module.handler! as any);
    app.get(`${entry.path}/`, (c) => c.redirect(entry.path));
  });

  const ui = app.basePath("/");
  ui.use("*", async (c, next) => {
    if (publicPaths.has(c.req.path)) {
      return next();
    }
    return security.requireRole("admin", "operator", "viewer")(c, next);
  });

  ui.get("/", (c) => c.redirect("/dashboard"));

  protectedRoutes.forEach((entry) => {
    ui.get(entry.path, entry.module.handler! as any);
    ui.get(`${entry.path}/`, (c) => c.redirect(entry.path));
  });
}

async function registerApiRoutes(app: Hono, services: ServiceContainer, security: SecurityMiddleware, getStatus: () => Promise<unknown>) {
  const apiRoutes = await loadRouteModules("api", services, security, getStatus);
  const api = app.basePath("/api");

  for (const route of apiRoutes) {
    const methods = route.module.methods ?? [route.module.method ?? "GET"];
    const authRoles = route.module.publicRoute ? undefined : route.module.authRoles ?? ["admin", "operator", "viewer"];
    const extraMiddleware = route.module.middlewareFactory?.(services, security) ?? [];
    const middleware = [] as Array<any>;

    if (authRoles) {
      middleware.push(security.requireRole(...authRoles));
    }
    middleware.push(...extraMiddleware);

    for (const method of methods) {
      const routeFn = (api as any)[method.toLowerCase()];
      if (typeof routeFn === "function") {
        routeFn.call(api, route.path, ...middleware, route.module.handler! as any);
      } else {
        api.use(route.path, ...middleware, route.module.handler! as any);
      }
    }
  }
}

async function loadRouteModules(prefix: "ui" | "api", services: ServiceContainer, security: SecurityMiddleware, getStatus: () => Promise<unknown>): Promise<RouteEntry[]> {
  const result: RouteEntry[] = [];
  for await (const entry of Deno.readDir(ROUTES_DIR)) {
    if (!entry.isDirectory || !entry.name.startsWith(`${prefix}--`)) continue;
    const routePath = buildRoutePath(entry.name);
    try {
      const routeModule = await import(new URL(`${entry.name}/route.js`, ROUTES_DIR).href) as RouteModule;
      const handler = routeModule.handler ?? routeModule.handlerFactory?.(services, getStatus);
      if (handler) {
        result.push({ path: routePath, module: { ...routeModule, handler } });
      }
    } catch {
      continue;
    }
  }
  // Register static routes before parametric ones. Hono 4.3.7 resolves by
  // registration order, not by specificity, so a `/agents/:name` registered
  // before `/agents/deception` swallows the literal path — its handler looks up
  // an agent named "deception", finds none, and 404s. Routes were being
  // registered in Deno.readDir order, so which one won was down to filesystem
  // iteration order and flipped whenever a sibling directory was added.
  result.sort((a, b) => compareRoutePaths(a.path, b.path));
  return result;
}

/**
 * Orders route paths so a static segment always registers before a parametric
 * one at the point they diverge: `/a/b` before `/a/:x`. Same-kind segments sort
 * lexically; a shorter path sorts before a longer one that shares its prefix.
 */
function compareRoutePaths(a: string, b: string): number {
  const as = a.split("/");
  const bs = b.split("/");
  const n = Math.min(as.length, bs.length);
  for (let i = 0; i < n; i++) {
    const ap = as[i].startsWith(":");
    const bp = bs[i].startsWith(":");
    if (ap !== bp) return ap ? 1 : -1;
    if (as[i] !== bs[i]) return as[i] < bs[i] ? -1 : 1;
  }
  return as.length - bs.length;
}

async function loadRouteModule(folderName: string, services: ServiceContainer, getStatus: () => Promise<unknown>): Promise<RouteEntry | undefined> {
  try {
    const routeModule = await import(new URL(`${folderName}/route.js`, ROUTES_DIR).href) as RouteModule;
    const handler = routeModule.handler ?? routeModule.handlerFactory?.(services, getStatus);
    if (!handler) return undefined;
    return { path: buildRoutePath(folderName), module: { ...routeModule, handler } };
  } catch {
    return undefined;
  }
}

function buildRoutePath(folderName: string) {
  const raw = folderName.replace(/^(ui|api)--/, "");
  const segments = raw.split("--").map((segment) => {
    if (segment.startsWith("[") && segment.endsWith("]")) {
      return `:${segment.slice(1, -1)}`;
    }
    return segment;
  });
  return `/${segments.join("/")}`;
}
