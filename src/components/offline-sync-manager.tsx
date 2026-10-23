import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { DEMO_MODE } from '@/lib/build-mode'
import { createShot } from '@/lib/server/shots'
import { checkAuthentication } from '@/modules/offline/auth'
import {
  markPendingBrew,
  usePendingBrewsStore,
} from '@/modules/offline/pending-store'
import { deletePendingBrew, listPendingBrews } from '@/modules/offline/queue'
import { syncPendingBrews } from '@/modules/offline/sync-pending-brews'
import { subscribeToPendingSync } from '@/modules/offline/sync-trigger'
import { isPendingBrewHeldForTasting } from '@/modules/offline/tasting-holds'

let syncInFlight: Promise<void> | null = null
let syncQueued = false
const PREFETCH_TIMEOUT_MS = 3000

export function OfflineSyncManager() {
  const router = useRouter()

  useEffect(() => {
    if (DEMO_MODE || !navigator.onLine) return

    let cancelled = false
    const prefetch = () => {
      if (cancelled || !navigator.onLine) return
      void router.preloadRoute({ to: '/brews/new' }).catch(() => undefined)
      void router.preloadRoute({ to: '/brews/pending' }).catch(() => undefined)
    }
    const supportsIdleCallback = 'requestIdleCallback' in window
    const handle = supportsIdleCallback
      ? window.requestIdleCallback(prefetch, { timeout: PREFETCH_TIMEOUT_MS })
      : window.setTimeout(prefetch, PREFETCH_TIMEOUT_MS)

    return () => {
      cancelled = true
      if (supportsIdleCallback) {
        window.cancelIdleCallback(handle)
      } else {
        window.clearTimeout(handle)
      }
    }
  }, [router])

  useEffect(() => {
    if (DEMO_MODE) return

    void usePendingBrewsStore.getState().hydrate()

    const runSync = (): Promise<void> => {
      if (syncInFlight) {
        syncQueued = true
        return syncInFlight
      }

      syncInFlight = (async () => {
        if (!navigator.onLine) return

        usePendingBrewsStore.getState().setSyncing(true)
        try {
          const result = await syncPendingBrews({
            list: async () =>
              (await listPendingBrews()).filter(
                (item) => !isPendingBrewHeldForTasting(item.operationId),
              ),
            remove: deletePendingBrew,
            mark: markPendingBrew,
            create: (payload) => createShot({ data: payload }),
            authenticate: checkAuthentication,
            isOnline: () => navigator.onLine,
          })
          await usePendingBrewsStore.getState().refresh()

          if (result.synced > 0) {
            if (!router.state.location.pathname.startsWith('/brews/new')) {
              await router.invalidate().catch(() => undefined)
            }
            toast.success(
              `${result.synced} brew${result.synced === 1 ? '' : 's'} synced`,
              {
                action: {
                  label: 'View brews',
                  onClick: () => void router.navigate({ to: '/brews' }),
                },
              },
            )
          } else if (result.authRequired) {
            toast.info('Sign in to sync brews saved on this device')
          } else if (result.failed > 0) {
            toast.warning('Some brews could not sync', {
              action: {
                label: 'Review',
                onClick: () => void router.navigate({ to: '/brews/pending' }),
              },
            })
          }
        } catch {
          // A failed flush leaves the queue intact for the next attempt.
        } finally {
          usePendingBrewsStore.getState().setSyncing(false)
          syncInFlight = null
          if (syncQueued) {
            syncQueued = false
            void runSync()
          }
        }
      })()

      return syncInFlight
    }

    const handleOnline = () => void runSync()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void runSync()
    }

    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibility)
    const unsubscribe = subscribeToPendingSync(() => void runSync())

    if (navigator.onLine) void runSync()

    return () => {
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibility)
      unsubscribe()
    }
  }, [router])

  return null
}
