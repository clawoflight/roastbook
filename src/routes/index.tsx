import { createFileRoute, redirect } from '@tanstack/react-router'
import { DEMO_MODE } from '@/lib/build-mode'
import { DemoLandingPage } from '@/routes/-components/demo-landing-page'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    if (!DEMO_MODE) throw redirect({ to: '/overview' })
  },
  head: () => ({
    meta: DEMO_MODE
      ? [
          { title: 'Roastbook | Your coffee journal, your way' },
          {
            name: 'description',
            content:
              'Remember your beans and brew better coffee. Self-host Roastbook today, explore the demo, or join the waitlist for a future hosted version.',
          },
        ]
      : [],
  }),
  component: DemoLandingPage,
})
