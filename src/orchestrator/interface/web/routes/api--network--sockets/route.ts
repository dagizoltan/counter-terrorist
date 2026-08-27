import { Hono } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { handlerFactory } from "./handler.ts";

export default function register(app: Hono, services: ServiceContainer) {
  app.get("/api/network/sockets", handlerFactory(services));
}
