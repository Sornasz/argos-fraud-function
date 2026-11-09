export type IndexLoadState = 'loading' | 'ready' | 'failed';

export interface IndexSnapshot {
  readonly state: IndexLoadState;
  readonly vectorCount: number;
  readonly version: string | null;
  readonly loadedAt: Date | null;
  readonly loadDurationMs: number | null;
  readonly failureReason: string | null;
}

export type ReadinessStatus = 'ready' | 'starting' | 'unavailable';

export interface ReadinessReport {
  readonly status: ReadinessStatus;
  readonly ready: boolean;
  readonly index: IndexSnapshot;
}

/** O serviço só aceita tráfego com o índice vetorial carregado e não vazio. */
export function assessReadiness(index: IndexSnapshot): ReadinessReport {
  if (index.state === 'ready' && index.vectorCount > 0) {
    return { status: 'ready', ready: true, index };
  }
  return { status: index.state === 'failed' ? 'unavailable' : 'starting', ready: false, index };
}
