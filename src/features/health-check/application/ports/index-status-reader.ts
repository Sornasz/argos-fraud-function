import type { IndexSnapshot } from '../../domain/readiness.js';

export interface IndexStatusReader {
  read(): IndexSnapshot;
}
