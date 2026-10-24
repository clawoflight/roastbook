import { and, gte, lt, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

/**
 * PostgreSQL timestamps can retain sub-millisecond precision, while the client
 * sends the millisecond ISO value produced by `Date.toISOString()`. Match the
 * whole millisecond bucket instead of requiring exact equality.
 */
export function matchesRevision(
  column: AnyPgColumn,
  revision: string | undefined,
): SQL | undefined {
  if (!revision) return undefined
  const start = new Date(revision)
  return and(gte(column, start), lt(column, new Date(start.getTime() + 1)))
}
