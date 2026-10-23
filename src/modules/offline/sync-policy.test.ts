import { describe, expect, test } from 'bun:test'
import {
  INITIAL_SYNC_RETRY_DELAY_MS,
  MAX_SYNC_RETRY_DELAY_MS,
  nextSyncRetryDelay,
  shouldAnnounceAuthRequired,
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
})
