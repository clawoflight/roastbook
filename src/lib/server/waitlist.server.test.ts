import { describe, expect, test } from 'bun:test'
import { parseWaitlistEnv } from '@/lib/env.server'
import { sendWaitlistNotification } from '@/lib/server/waitlist.server'

const environment = parseWaitlistEnv({
  RESEND_API_KEY: 're_test',
  ADMIN_EMAIL: 'admin@example.com',
})

describe('hosted waitlist delivery', () => {
  test('sends a notification to the admin, with the visitor as reply-to', async () => {
    let message: unknown
    const result = await sendWaitlistNotification(
      'coffee@example.com',
      environment,
      async (url, options) => {
        expect(url).toBe('https://api.resend.com/emails')
        expect(options.method).toBe('POST')
        expect(options.signal).toBeInstanceOf(AbortSignal)
        message = JSON.parse(String(options.body))
        return Response.json({ id: 'email-123' })
      },
    )
    expect(result).toEqual({ success: true })
    expect(message).toMatchObject({
      from: 'Roastbook <onboarding@resend.dev>',
      to: ['admin@example.com'],
      reply_to: 'coffee@example.com',
      subject: 'Hosted Roastbook waitlist signup',
      text: expect.stringContaining('Email: coffee@example.com'),
    })
  })

  test('does not send when configuration is missing', async () => {
    let calls = 0
    const result = await sendWaitlistNotification(
      'coffee@example.com',
      parseWaitlistEnv({}),
      async () => {
        calls += 1
        return Response.json({ id: 'unexpected' })
      },
    )
    expect(result).toEqual({ success: false })
    expect(calls).toBe(0)
  })

  test('does not report success for provider rejection, malformed output, or network errors', async () => {
    for (const response of [
      Response.json({ message: 'rejected' }, { status: 403 }),
      Response.json({}),
    ]) {
      expect(
        await sendWaitlistNotification(
          'coffee@example.com',
          environment,
          async () => response,
        ),
      ).toEqual({ success: false })
    }
    expect(
      await sendWaitlistNotification(
        'coffee@example.com',
        environment,
        async () => {
          throw new Error('timeout')
        },
      ),
    ).toEqual({ success: false })
  })

  test('accepts a verified sender without journal configuration', () => {
    expect(
      parseWaitlistEnv({ RESEND_FROM_EMAIL: 'hello@example.com' })
        .RESEND_FROM_EMAIL,
    ).toBe('hello@example.com')
    expect(() => parseWaitlistEnv({ ADMIN_EMAIL: 'invalid' })).toThrow(
      'ADMIN_EMAIL',
    )
  })
})
