import '@tanstack/react-start/server-only'
import { z } from 'zod'
import { getWaitlistEnv } from '@/lib/env.server'
import { withResourceLimits } from '@/lib/server/resource-limits.server'

export async function sendWaitlistNotification(
  email: string,
  environment = getWaitlistEnv(),
  send: (url: string, options: RequestInit) => Promise<Response> = fetch,
) {
  const { RESEND_API_KEY, ADMIN_EMAIL, RESEND_FROM_EMAIL } = environment
  if (!RESEND_API_KEY || !ADMIN_EMAIL) return { success: false }

  try {
    return await withResourceLimits('hosted-waitlist', async () => {
      const response = await send('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          from: `Roastbook <${RESEND_FROM_EMAIL}>`,
          to: [ADMIN_EMAIL],
          reply_to: email,
          subject: 'Hosted Roastbook waitlist signup',
          text: `Someone is interested in hosted Roastbook.\n\nEmail: ${email}\nSigned up: ${new Date().toISOString()}`,
        }),
      })
      if (!response.ok) return { success: false }
      const result = z
        .object({ id: z.string().min(1) })
        .safeParse(await response.json())
      return { success: result.success }
    })
  } catch {
    return { success: false }
  }
}
