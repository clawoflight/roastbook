import { createMiddleware, createStart } from '@tanstack/react-start'
import { DEMO_MODE } from '@/lib/build-mode'
import {
  demoModeReadOnlyResponse,
  isDemoModeWriteRequest,
} from '@/lib/server/demo-mode.server'
import { joinWaitlist } from '@/lib/server/waitlist'

const demoReadOnlyRequestMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const isWaitlistSignup =
      request.method === 'POST' &&
      new URL(request.url).pathname ===
        new URL(joinWaitlist.url, request.url).pathname
    if (isDemoModeWriteRequest(DEMO_MODE, request.method) && !isWaitlistSignup)
      return demoModeReadOnlyResponse()
    return next()
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [demoReadOnlyRequestMiddleware],
}))
