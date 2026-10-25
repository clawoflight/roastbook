import { lt } from 'drizzle-orm'
import type { db } from '@/db'
import { clientOperations } from '@/db/schema'

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export const CLIENT_OPERATION_RETENTION_DAYS = 90

/**
 * Idempotency tombstones only need to outlive a realistic lost-response retry.
 * Prune old rows whenever a new operation is recorded so the table stays
 * bounded without a separate maintenance job.
 */
export async function pruneClientOperations(
  tx: DatabaseTransaction,
  now: Date = new Date(),
): Promise<void> {
  const cutoff = new Date(
    now.getTime() - CLIENT_OPERATION_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
  )
  await tx
    .delete(clientOperations)
    .where(lt(clientOperations.createdAt, cutoff))
}
