export { handlerFactory } from "./handler.ts";
export const method = "GET";
export const authRoles = ['admin', 'operator', 'viewer'];
export const middlewareFactory = (services, security) => [security.meshAuth(services.config.getMeshSecret())];
