import { PersistenceProvider } from "./interfaces.ts";

export class PersistenceManager {
  constructor(private provider: PersistenceProvider) {}

  async audit() {
    return await this.provider.auditPersistence();
  }
}
