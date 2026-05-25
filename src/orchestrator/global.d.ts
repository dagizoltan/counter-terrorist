declare module "https://deno.land/x/hono@v4.3.7/mod.ts" {
  export class Hono {
    constructor();
    use(path: string, middleware: any): this;
    use(middleware: any): this;
    get(path: string, handler: any): this;
    post(path: string, handler: any): this;
    delete(path: string, handler: any): this;
    route(path: string, app: any): this;
    fetch: any;
  }
}

declare module "https://deno.land/x/hono@v4.3.7/middleware/bearer-auth/index.ts" {
  export function bearerAuth(options: any): any;
}

declare module "https://deno.land/x/hono@v4.3.7/adapter/deno/index.ts" {
  export function serveStatic(options: any): any;
  export function upgradeWebSocket(handler: any): any;
}

declare module "https://deno.land/x/hono@v4.3.7/helper/cookie/index.ts" {
  export function deleteCookie(c: any, key: string, options?: any): void;
  export function getCookie(c: any, key: string): string | undefined;
  export function setCookie(c: any, key: string, value: string, options?: any): void;
}

declare module "https://deno.land/x/hono@v4.3.7/middleware/cors/index.ts" {
  export function cors(options: any): any;
}

declare module "https://deno.land/x/hono@v4.3.7/jsx/index.ts" {
  export const jsx: any;
  export const Fragment: any;
}
