import { describe, expect, test } from 'bun:test'
import {
  INITIAL_SYNC_RETRY_DELAY_MS,
  MAX_SYNC_RETRY_DELAY_MS,
  nextSyncRetryDelay,
  shouldAnnounceAuthRequired,
  shouldScheduleSyncRetry,
} from '@/modules/offline/sync-policy'

describe('offline sync policy', () => {
  test('backs off from five seconds to the one-minute cap', () => {
    let delay = INITIAL_SYNC_RETRY_DELAY_MS
    const sequence: number[] = []
    for (let attempt = 0; attempt < 6; attempt += 1) {
      sequence.push(delay)
      delay = nextSyncRetryDelay(delay)
    }

    expect(sequence).toEqual([5000, 10_000, 20_000, 40_000, 60_000, 60_000])
    expect(nextSyncRetryDelay(MAX_SYNC_RETRY_DELAY_MS)).toBe(
      MAX_SYNC_RETRY_DELAY_MS,
    )
  })

  test('announces auth-required only once until the state changes', () => {
    expect(shouldAnnounceAuthRequired(true, false)).toBe(true)
    expect(shouldAnnounceAuthRequired(true, true)).toBe(false)
    expect(shouldAnnounceAuthRequired(false, true)).toBe(false)
    expect(shouldAnnounceAuthRequired(false, false)).toBe(false)
  })

  test('schedules a retry only while online, mounted, and timer-free', () => {
    expect(
      shouldScheduleSyncRetry({
        online: true,
        disposed: false,
        hasTimer: false,
      }),
    ).toBe(true)
    expect(
      shouldScheduleSyncRetry({
        online: false,
        disposed: false,
        hasTimer: false,
      }),
    ).toBe(false)
    expect(
      shouldScheduleSyncRetry({
        online: true,
        disposed: true,
        hasTimer: false,
      }),
    ).toBe(false)
    expect(
      shouldScheduleSyncRetry({
        online: true,
        disposed: false,
        hasTimer: true,
      }),
    ).toBe(false)
  })
})
