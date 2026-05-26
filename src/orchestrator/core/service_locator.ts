import { ServiceLocatorPort } from "./ports.ts";

export class ServiceLocator implements ServiceLocatorPort {
  private services = new Map<string, any>();

  register<T>(key: string, service: T): void {
    this.services.set(key, service);
  }

  get<T>(key: string): T {
    const service = this.services.get(key);
    if (!service) {
      throw new Error(`Service ${key} not registered`);
    }
    return service as T;
  }

  has(key: string): boolean {
    return this.services.has(key);
  }
}

export const serviceLocator = new ServiceLocator();
