import { Check, LoaderCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { joinWaitlist } from '@/lib/server/waitlist'

export function WaitlistForm() {
  const [status, setStatus] = useState<
    'idle' | 'pending' | 'success' | 'error'
  >('idle')
  const submitting = useRef(false)

  return (
    <div id="waitlist" className="mt-8 scroll-mt-8">
      <h2 className="font-display text-xl font-bold">
        Your coffee journal, hosted for you.
      </h2>
      <p className="mt-2 text-muted-foreground">
        We're planning a hosted version. Join the waitlist to hear when it's
        ready.
      </p>
      {status === 'success' ? (
        <div
          role="status"
          className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-card p-4"
        >
          <Check
            className="mt-0.5 size-5 shrink-0 text-positive-text"
            aria-hidden="true"
          />
          <div>
            <p className="font-bold">You're on the list.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Thanks for your interest. We'll email you when hosted Roastbook is
              ready.
            </p>
          </div>
        </div>
      ) : (
        <form
          className="mt-4"
          aria-busy={status === 'pending'}
          onSubmit={async (event) => {
            event.preventDefault()
            if (submitting.current) return
            submitting.current = true
            const data = new FormData(event.currentTarget)
            setStatus('pending')
            try {
              const result = await joinWaitlist({
                data: {
                  email: String(data.get('email') ?? ''),
                  website: String(data.get('website') ?? ''),
                },
              })
              setStatus(result.success ? 'success' : 'error')
            } catch {
              setStatus('error')
            } finally {
              submitting.current = false
            }
          }}
        >
          <label htmlFor="waitlist-email" className="text-sm font-semibold">
            Email address
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
            <Input
              id="waitlist-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              maxLength={254}
              disabled={status === 'pending'}
              aria-describedby="waitlist-note"
              className="min-h-12"
            />
            <Button
              type="submit"
              size="lg"
              disabled={status === 'pending'}
              className="shrink-0"
            >
              {status === 'pending' ? (
                <>
                  <LoaderCircle
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  Joining…
                </>
              ) : (
                'Join the waitlist'
              )}
            </Button>
          </div>
          <div hidden aria-hidden="true">
            <label htmlFor="waitlist-website">Website</label>
            <input
              id="waitlist-website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>
          {status === 'error' && (
            <p role="alert" className="mt-3 text-sm text-destructive-text">
              We couldn't save your signup. Please try again in a minute.
            </p>
          )}
          <p
            id="waitlist-note"
            className="mt-3 text-xs leading-relaxed text-muted-foreground"
          >
            Only updates about hosted Roastbook. Your email is sent to our team
            via Resend. No account is created.
          </p>
        </form>
      )}
    </div>
  )
}
