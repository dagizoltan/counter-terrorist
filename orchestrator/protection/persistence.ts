import { PersistenceProvider } from "./interfaces.ts";
import { UbuntuPersistenceProvider } from "./ubuntu_persistence.ts";
import { WindowsPersistenceProvider } from "./windows_persistence.ts";

export class PersistenceManager {
  private provider: PersistenceProvider;

  constructor() {
    const os = Deno.build.os;
    if (os === "windows") {
      this.provider = new WindowsPersistenceProvider();
    } else {
      this.provider = new UbuntuPersistenceProvider();
    }
  }

  async audit() {
    return await this.provider.auditPersistence();
  }
}

export const persistence = new PersistenceManager();
