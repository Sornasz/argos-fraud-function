export const TRANSACTION_SCORED_EVENT_TYPE = 'TransactionScored';
export const TRANSACTION_SCORED_SCHEMA_VERSION = 1;

export type ReferenceLabel = 'fraud' | 'legit';

export interface TransactionScoredNeighbor {
  /** Posição do vetor no dataset de referência carregado pelo índice. */
  referenceId: number;
  distance: number;
  label: ReferenceLabel;
}

export interface TransactionScoredTransaction {
  amount: number;
  installments: number;
  requestedAt: string;
  customer: {
    avgAmount: number;
    txCount24h: number;
    knownMerchants: string[];
  };
  merchant: {
    id: string;
    mcc: string;
    avgAmount: number;
  };
  terminal: {
    isOnline: boolean;
    cardPresent: boolean;
    kmFromHome: number;
  };
  lastTransaction: {
    timestamp: string;
    kmFromCurrent: number;
  } | null;
}

export interface TransactionScored {
  eventId: string;
  eventType: typeof TRANSACTION_SCORED_EVENT_TYPE;
  schemaVersion: typeof TRANSACTION_SCORED_SCHEMA_VERSION;
  occurredAt: string;
  transactionId: string;
  decision: {
    approved: boolean;
    fraudScore: number;
    approvalThreshold: number;
  };
  featureVector: number[];
  neighbors: TransactionScoredNeighbor[];
  referenceIndexVersion: string | null;
  transaction: TransactionScoredTransaction;
}
