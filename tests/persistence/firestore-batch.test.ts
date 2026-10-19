import { describe, expect, it } from 'vitest';
import {
  FIRESTORE_WRITE_BATCH_LIMIT,
  chunkWriteOperations,
} from '@/lib/persistence/firestore-batch';

describe('chunkWriteOperations', () => {
  it('returns no chunks for an empty list', () => {
    expect(chunkWriteOperations([])).toEqual([]);
  });

  it('keeps a full chunk when the list is exactly the limit', () => {
    const operations = Array.from({ length: FIRESTORE_WRITE_BATCH_LIMIT }, (_, index) => index);
    expect(chunkWriteOperations(operations)).toEqual([operations]);
  });

  it('splits 500 writes into chunks under the Firestore batch cap', () => {
    const operations = Array.from({ length: 500 }, (_, index) => index);
    const chunks = chunkWriteOperations(operations, 450);
    expect(chunks.map((chunk) => chunk.length)).toEqual([450, 50]);
    expect(chunks.flat()).toEqual(operations);
  });

  it('rejects a batch size Firestore would refuse', () => {
    expect(() => chunkWriteOperations([1], 0)).toThrow(/1 to 500/);
    expect(() => chunkWriteOperations([1], 501)).toThrow(/1 to 500/);
    expect(() => chunkWriteOperations([1], 1.5)).toThrow(/1 to 500/);
  });
});
