import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Page, PageHeader } from '@/components/page-layout'
import { Button } from '@/components/ui/button'
import { PendingBrewsPage } from '@/routes/brews/-components/pending-brews-page'

export const Route = createFileRoute('/brews/pending')({
  component: PendingBrewsRoute,
})

function PendingBrewsRoute() {
  return (
    <Page width="content">
      <PageHeader
        title="Pending brews"
        description="Brews saved offline stay on this device until they sync."
        leading={
          <Button variant="outline" size="icon" asChild>
            <Link to="/brews" aria-label="Back to brews">
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
        }
      />
      <PendingBrewsPage />
    </Page>
  )
}
