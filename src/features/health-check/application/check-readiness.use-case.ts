import { assessReadiness, type ReadinessReport } from '../domain/readiness.js';
import type { IndexStatusReader } from './ports/index-status-reader.js';

export interface CheckReadinessUseCase {
  execute(): ReadinessReport;
}

export class CheckReadiness implements CheckReadinessUseCase {
  constructor(private readonly indexStatus: IndexStatusReader) {}

  execute(): ReadinessReport {
    return assessReadiness(this.indexStatus.read());
  }
}
