export const INITIAL_SYNC_RETRY_DELAY_MS = 5000
export const MAX_SYNC_RETRY_DELAY_MS = 60_000

export function nextSyncRetryDelay(current: number): number {
  return Math.min(current * 2, MAX_SYNC_RETRY_DELAY_MS)
}

export function shouldAnnounceAuthRequired(
  authRequired: boolean,
  alreadyAnnounced: boolean,
): boolean {
  return authRequired && !alreadyAnnounced
}

export function shouldScheduleSyncRetry({
  online,
  disposed,
  hasTimer,
}: {
  readonly online: boolean
  readonly disposed: boolean
  readonly hasTimer: boolean
}): boolean {
  return online && !disposed && !hasTimer
}
