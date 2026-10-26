import { describe, expect, test } from 'bun:test'
import { DEMO_MODE_READ_ONLY_MESSAGE } from '@/lib/build-mode'
import {
  demoModeReadOnlyResponse,
  isDemoModeWriteRequest,
} from '@/lib/server/demo-mode.server'

describe('demo mode mutation guard', () => {
  test('allows mutations when demo mode is disabled', () => {
    expect(isDemoModeWriteRequest(false, 'POST')).toBe(false)
  })

  test('blocks mutations when demo mode is enabled', () => {
    expect(isDemoModeWriteRequest(true, 'POST')).toBe(true)
    expect(isDemoModeWriteRequest(true, 'GET')).toBe(false)
    expect(isDemoModeWriteRequest(true, 'HEAD')).toBe(false)
  })

  test('returns a forbidden response for blocked requests', async () => {
    const response = demoModeReadOnlyResponse()

    expect(response.status).toBe(403)
    expect(response.headers.get('content-type')).toStartWith('text/plain')
    expect(await response.text()).toBe(DEMO_MODE_READ_ONLY_MESSAGE)
  })
})
