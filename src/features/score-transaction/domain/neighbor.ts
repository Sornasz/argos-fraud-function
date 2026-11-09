export type ReferenceLabel = 'fraud' | 'legit';

export interface Neighbor {
  readonly referenceId: number;
  readonly distance: number;
  readonly label: ReferenceLabel;
}
