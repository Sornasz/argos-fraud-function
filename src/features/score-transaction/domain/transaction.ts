export interface Customer {
  readonly avgAmount: number;
  readonly txCount24h: number;
  readonly knownMerchants: readonly string[];
}

export interface Merchant {
  readonly id: string;
  readonly mcc: string;
  readonly avgAmount: number;
}

export interface Terminal {
  readonly isOnline: boolean;
  readonly cardPresent: boolean;
  readonly kmFromHome: number;
}

export interface PreviousTransaction {
  readonly timestamp: Date;
  readonly kmFromCurrent: number;
}

export interface Transaction {
  readonly id: string;
  readonly amount: number;
  readonly installments: number;
  readonly requestedAt: Date;
  readonly customer: Customer;
  readonly merchant: Merchant;
  readonly terminal: Terminal;
  readonly lastTransaction: PreviousTransaction | null;
}
