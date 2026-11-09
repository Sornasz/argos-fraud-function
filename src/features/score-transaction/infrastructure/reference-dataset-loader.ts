import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { StringDecoder } from 'node:string_decoder';
import { createGunzip } from 'node:zlib';
import type { ReferenceLabel } from '../domain/neighbor.js';
import { ReferenceDatasetBuilder, labelToCode, type ReferenceDataset } from './reference-dataset.js';

export class ReferenceDatasetFormatError extends Error {
  constructor(recordIndex: number, detail: string) {
    super(`Registro ${recordIndex} do dataset de referência inválido: ${detail}`);
    this.name = 'ReferenceDatasetFormatError';
  }
}

const LABEL_PATTERN = /"label"\s*:\s*"([^"]*)"/;

function parseRecord(text: string, recordIndex: number): { vector: number[]; label: ReferenceLabel } {
  const vectorKey = text.indexOf('"vector"');
  const open = vectorKey === -1 ? -1 : text.indexOf('[', vectorKey);
  const close = open === -1 ? -1 : text.indexOf(']', open);
  if (close === -1) throw new ReferenceDatasetFormatError(recordIndex, 'campo "vector" ausente');

  const vector = text.slice(open + 1, close).split(',').map(Number);
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new ReferenceDatasetFormatError(recordIndex, '"vector" contém valor não numérico');
  }

  const rawLabel = LABEL_PATTERN.exec(text)?.[1];
  if (rawLabel === undefined || labelToCode(rawLabel) === undefined) {
    throw new ReferenceDatasetFormatError(recordIndex, `"label" deve ser "fraud" ou "legit"`);
  }
  return { vector, label: rawLabel as ReferenceLabel };
}

/**
 * Lê `references.json` (ou `.json.gz`) em streaming. O arquivo descomprimido
 * passa de 280 MB, e um `JSON.parse` único exigiria a string inteira mais a
 * árvore de objetos em memória ao mesmo tempo. Como cada registro é um objeto
 * plano `{"vector":[...],"label":"..."}`, todo `}` fecha exatamente um registro.
 *
 * A versão do índice é derivada do SHA-256 do arquivo lido (RF20).
 */
export async function loadReferenceDataset(filePath: string): Promise<ReferenceDataset> {
  const hash = createHash('sha256');
  const hashing = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  const builder = new ReferenceDatasetBuilder();
  const decoder = new StringDecoder('utf8');
  let pending = '';

  const consume = async (source: AsyncIterable<Buffer>): Promise<void> => {
    for await (const chunk of source) {
      pending += decoder.write(chunk);
      let start = 0;
      let end = pending.indexOf('}', start);
      while (end !== -1) {
        const { vector, label } = parseRecord(pending.slice(start, end), builder.size);
        try {
          builder.add(vector, label);
        } catch (error) {
          throw new ReferenceDatasetFormatError(builder.size, (error as Error).message);
        }
        start = end + 1;
        end = pending.indexOf('}', start);
      }
      pending = pending.slice(start);
    }
    pending += decoder.end();
  };

  const stages = filePath.endsWith('.gz')
    ? pipeline(createReadStream(filePath), hashing, createGunzip(), consume)
    : pipeline(createReadStream(filePath), hashing, consume);
  await stages;

  if (pending.replace(/[\s,\]]/g, '') !== '') {
    throw new ReferenceDatasetFormatError(builder.size, 'conteúdo inesperado no fim do arquivo');
  }

  return builder.build(`sha256:${hash.digest('hex').slice(0, 12)}`);
}
