import { describe, expect, it } from 'vitest';
import { squaredEuclideanDistance } from '../../../../src/features/score-transaction/domain/distance.js';

describe('squaredEuclideanDistance', () => {
  it('soma os quadrados das diferenças', () => {
    expect(squaredEuclideanDistance([0, 0, 0], [1, 2, 2])).toBe(9);
  });

  it('lê o vetor de referência a partir do offset num buffer plano', () => {
    const flat = new Float32Array([9, 9, 9, 1, 2, 2]);
    expect(squaredEuclideanDistance([0, 0, 0], flat, 3)).toBe(9);
  });

  it('considera o sentinela -1 como coordenada comum', () => {
    expect(squaredEuclideanDistance([-1, -1], [-1, -1])).toBe(0);
    expect(squaredEuclideanDistance([-1, -1], [0, 0])).toBe(2);
  });
});
