import { BaselinePort } from "../core/ports.ts";
import { BaselineService } from "../services/baseline.ts";

export class BaselineAdapter implements BaselinePort {
  constructor(private service: BaselineService) {}
  startMonitor(): void {
    this.service.startMonitor();
  }
}
