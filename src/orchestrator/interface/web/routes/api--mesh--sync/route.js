export { handlerFactory } from "./handler.ts";
export const method = "POST";
export const authRoles = ['admin', 'operator', 'viewer'];
export const middlewareFactory = (services, security) => [security.meshAuth(services.config.getMeshSecret())];
