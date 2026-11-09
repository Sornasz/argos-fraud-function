/**
 * Distância euclidiana ao quadrado entre `query` e o vetor que começa em
 * `offset` dentro de `references`. Sem a raiz, a ordem dos vizinhos é a mesma
 * e o laço do KNN fica mais barato.
 */
export function squaredEuclideanDistance(
  query: ArrayLike<number>,
  references: ArrayLike<number>,
  offset = 0,
): number {
  let sum = 0;
  for (let i = 0; i < query.length; i++) {
    const delta = query[i]! - references[offset + i]!;
    sum += delta * delta;
  }
  return sum;
}
