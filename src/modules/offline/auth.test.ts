import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test'
import { checkAuthentication } from '@/modules/offline/auth'

const originalFetch = globalThis.fetch
const originalWindow = Reflect.get(globalThis, 'window')

function mockResponse(init: {
  status: number
  redirected?: boolean
  url?: string
  contentType?: string
}): Response {
  return {
    status: init.status,
    redirected: init.redirected ?? false,
    url: init.url ?? 'https://roastbook.test/api/auth-probe',
    headers: new Headers(
      init.contentType ? { 'content-type': init.contentType } : {},
    ),
  } as Response
}

function mockFetch(response: Response | Error) {
  globalThis.fetch = (async () => {
    if (response instanceof Error) throw response
    return response
  }) as unknown as typeof fetch
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin: 'https://roastbook.test' } },
  })
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

afterAll(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window')
  } else {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
  }
})

describe('offline authentication probe', () => {
  test('accepts the 204 success response', async () => {
    mockFetch(mockResponse({ status: 204 }))
    expect(await checkAuthentication()).toBe('authenticated')
  })

  test('treats 401 and 403 as authentication required', async () => {
    mockFetch(mockResponse({ status: 401 }))
    expect(await checkAuthentication()).toBe('auth-required')

    mockFetch(mockResponse({ status: 403 }))
    expect(await checkAuthentication()).toBe('auth-required')
  })

  test('treats a redirect to the Hodor gate as authentication required', async () => {
    mockFetch(
      mockResponse({
        status: 200,
        redirected: true,
        url: 'https://roastbook.test/_gate/login',
        contentType: 'text/html',
      }),
    )
    expect(await checkAuthentication()).toBe('auth-required')

    mockFetch(
      mockResponse({
        status: 200,
        url: 'https://roastbook.test/_gate/login',
        contentType: 'text/html',
      }),
    )
    expect(await checkAuthentication()).toBe('auth-required')
  })

  test('treats an HTML login page as authentication required', async () => {
    mockFetch(
      mockResponse({
        status: 200,
        contentType: 'text/html; charset=utf-8',
      }),
    )
    expect(await checkAuthentication()).toBe('auth-required')
  })

  test('treats proxy server errors as unreachable, not signed out', async () => {
    mockFetch(
      mockResponse({
        status: 502,
        contentType: 'text/html',
      }),
    )
    expect(await checkAuthentication()).toBe('unreachable')
  })

  test('treats a failed request as unreachable', async () => {
    mockFetch(new TypeError('Failed to fetch'))
    expect(await checkAuthentication()).toBe('unreachable')
  })
})
