import { BaselinePort } from "../core/ports.ts";
import { baseline } from "../services/baseline.ts";

export class BaselineAdapter implements BaselinePort {
  startMonitor(): void {
    baseline.startMonitor();
  }
}

export const baselineAdapter = new BaselineAdapter();
