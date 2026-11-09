import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ReferenceDatasetFormatError,
  loadReferenceDataset,
} from '../../../../src/features/score-transaction/infrastructure/reference-dataset-loader.js';

const workDir = mkdtempSync(join(tmpdir(), 'argos-dataset-'));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

const legit = [0.01, 0.0833, 0.05, 0.8261, 0.1667, -1, -1, 0.0432, 0.25, 0, 1, 0, 0.2, 0.0416];
const fraud = [0.5796, 0.9167, 1, 0.0435, 0, 0.0056, 0.4394, 0.4598, 0.4, 1, 0, 1, 0.85, 0.0032];

function writeFixture(name: string, content: string, gzip = false): string {
  const path = join(workDir, name);
  writeFileSync(path, gzip ? gzipSync(content) : content);
  return path;
}

describe('loadReferenceDataset', () => {
  it('lê .json.gz para Float32Array preservando o -1', async () => {
    const records = [{ vector: legit, label: 'legit' }, { vector: fraud, label: 'fraud' }];
    const path = writeFixture('refs.json.gz', JSON.stringify(records), true);

    const dataset = await loadReferenceDataset(path);

    expect(dataset.size).toBe(2);
    expect(dataset.vectors).toBeInstanceOf(Float32Array);
    expect(dataset.vectors).toHaveLength(28);
    expect(dataset.vectors[5]).toBe(-1);
    expect(dataset.vectors[6]).toBe(-1);
    expect(dataset.vectors[14]).toBeCloseTo(0.5796, 6);
    expect(Array.from(dataset.labels)).toEqual([0, 1]);
    expect(dataset.version).toMatch(/^sha256:[0-9a-f]{12}$/);
  });

  it('aceita JSON indentado, sem compressão e com a chave label antes de vector', async () => {
    const content = `[\n  { "label": "fraud", "vector": [ ${fraud.join(', ')} ] },\n  { "vector": [${legit.join(',')}],\n "label" : "legit" }\n]\n`;

    const dataset = await loadReferenceDataset(writeFixture('refs.json', content));

    expect(dataset.size).toBe(2);
    expect(Array.from(dataset.labels)).toEqual([1, 0]);
  });

  it('cresce além da capacidade inicial', async () => {
    const records = Array.from({ length: 70_000 }, (_, i) => ({ vector: legit, label: i % 7 === 0 ? 'fraud' : 'legit' }));

    const dataset = await loadReferenceDataset(writeFixture('big.json.gz', JSON.stringify(records), true));

    expect(dataset.size).toBe(70_000);
    expect(dataset.labels[7]).toBe(1);
    expect(dataset.labels[8]).toBe(0);
  });

  it('gera versões diferentes para conteúdos diferentes', async () => {
    const a = await loadReferenceDataset(writeFixture('a.json', JSON.stringify([{ vector: legit, label: 'legit' }])));
    const b = await loadReferenceDataset(writeFixture('b.json', JSON.stringify([{ vector: fraud, label: 'fraud' }])));

    expect(a.version).not.toBe(b.version);
  });

  it('falha com vetor de dimensão errada', async () => {
    const path = writeFixture('short.json', JSON.stringify([{ vector: [0.1, 0.2], label: 'legit' }]));

    await expect(loadReferenceDataset(path)).rejects.toThrow(ReferenceDatasetFormatError);
  });

  it('falha com rótulo desconhecido', async () => {
    const path = writeFixture('label.json', JSON.stringify([{ vector: legit, label: 'maybe' }]));

    await expect(loadReferenceDataset(path)).rejects.toThrow(/"label"/);
  });

  it('falha quando o arquivo não existe', async () => {
    await expect(loadReferenceDataset(join(workDir, 'nao-existe.json.gz'))).rejects.toThrow(/ENOENT/);
  });
});
