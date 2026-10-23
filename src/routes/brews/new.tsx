import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { Page, PageHeader } from '@/components/page-layout'
import { NewShotForm } from '@/components/shots/new-shot-form'
import { Button } from '@/components/ui/button'
import { searchValidator } from '@/lib/search-params'
import { getActiveBeanPurchases } from '@/lib/server/beans'
import { getBrewingMethods } from '@/lib/server/brewing-methods'
import { getDrinkConfiguration } from '@/lib/server/drink-options'
import { getGear } from '@/lib/server/gear'
import { getGearSets } from '@/lib/server/gear-sets'
import { getRecipes } from '@/lib/server/recipes'
import { checkShotRecommendationEnabled } from '@/lib/server/shot-recommendations'
import { getShottimerSettings } from '@/lib/server/shottimer'
import {
  getBeanSuggestions,
  getBrewingMethodSuggestions,
  getDrinkTypeSuggestions,
  getLastBeansByBrewingMethod,
  getTasteTagSuggestions,
} from '@/lib/server/suggestions'
import { getTasteTags } from '@/lib/server/taste-tags'
import { parseNewBrewSearch } from '@/routes/brews/-lib/new-brew-search'

export const Route = createFileRoute('/brews/new')({
  validateSearch: searchValidator(parseNewBrewSearch),
  loader: async () => {
    const defaultBrewedAt = new Date().toISOString()

    try {
      const data = await loadNewBrewReferenceData()
      if (typeof window !== 'undefined') {
        const { writeCachedNewBrewReferenceData } = await import(
          '@/modules/offline/reference-data'
        )
        await writeCachedNewBrewReferenceData(data).catch(() => undefined)
      }
      return { ...data, defaultBrewedAt }
    } catch (error) {
      if (typeof window === 'undefined') throw error
      const { readCachedNewBrewReferenceData } = await import(
        '@/modules/offline/reference-data'
      )
      const cached =
        await readCachedNewBrewReferenceData<NewBrewReferenceData>()
      if (!cached) throw error
      return {
        ...cached.data,
        defaultBrewedAt,
        offlineSnapshotSavedAt: cached.savedAt,
      }
    }
  },
  component: NewShotPage,
})

type NewBrewReferenceData = Awaited<ReturnType<typeof loadNewBrewReferenceData>>

async function loadNewBrewReferenceData() {
  const [
    beans,
    methods,
    recipes,
    tasteTags,
    beanSuggestions,
    brewingMethodSuggestions,
    lastBeansByBrewingMethod,
    gear,
    gearSets,
    recommendation,
    drinks,
    drinkTypeSuggestions,
    tasteTagSuggestions,
    shottimer,
  ] = await Promise.all([
    getActiveBeanPurchases(),
    getBrewingMethods(),
    getRecipes(),
    getTasteTags(),
    getBeanSuggestions(),
    getBrewingMethodSuggestions(),
    getLastBeansByBrewingMethod(),
    getGear(),
    getGearSets(),
    checkShotRecommendationEnabled(),
    getDrinkConfiguration(),
    getDrinkTypeSuggestions(),
    getTasteTagSuggestions(),
    getShottimerSettings(),
  ])
  return {
    beans,
    methods,
    recipes,
    tasteTags,
    beanSuggestions,
    brewingMethodSuggestions,
    lastBeansByBrewingMethod,
    gear,
    gearSets,
    recommendationEnabled: recommendation.enabled,
    drinks,
    drinkTypeSuggestions,
    tasteTagSuggestions,
    shottimerEnabled: shottimer.enabled,
  }
}

function NewShotPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()

  useEffect(() => {
    if (!navigator.onLine) return
    void import('@/modules/offline/reference-data')
      .then(({ writeCachedNewBrewReferenceData }) =>
        writeCachedNewBrewReferenceData(data),
      )
      .catch(() => undefined)
  }, [data])

  return (
    <Page>
      <PageHeader
        title="New brew"
        leading={
          <Button variant="outline" size="icon" asChild>
            <Link to="/brews" aria-label="Back to brews">
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
        }
      />
      <NewShotForm
        data={data}
        initialBean={{
          beanId: search.beanId,
          beanPurchaseId: search.beanPurchaseId,
        }}
        onSaved={async () => {
          await router.invalidate()
          await navigate({ to: '/brews' })
          toast.success('Brew saved', {
            action: {
              label: 'Log another',
              onClick: () => void navigate({ to: '/brews/new', search }),
            },
          })
        }}
        onQueued={async () => {
          toast.success(
            'Saved on this device. It will sync when you reconnect.',
          )
          await navigate({ to: '/brews/pending' })
        }}
      />
    </Page>
  )
}
