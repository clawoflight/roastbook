import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sendWaitlistNotification } from '@/lib/server/waitlist.server'

export const joinWaitlist = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      email: z.string().trim().max(254).pipe(z.email()),
      website: z.string().max(200).default(''),
    }),
  )
  .handler(async ({ data }) => {
    if (data.website) return { success: true }
    return sendWaitlistNotification(data.email)
  })
