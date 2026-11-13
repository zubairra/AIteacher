/** Firestore rejects a write batch with more than 500 operations. */
export const FIRESTORE_WRITE_BATCH_LIMIT = 450;

/**
 * Split write operations into batches that stay under Firestore's 500-write cap.
 * A limit outside 1–500 is rejected so a caller cannot build a batch the
 * server will refuse.
 */
export function chunkWriteOperations<T>(
  operations: readonly T[],
  limit = FIRESTORE_WRITE_BATCH_LIMIT,
): T[][] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('Firestore batch size must be an integer from 1 to 500');
  }
  const chunks: T[][] = [];
  for (let index = 0; index < operations.length; index += limit) {
    chunks.push(operations.slice(index, index + limit));
  }
  return chunks;
}
