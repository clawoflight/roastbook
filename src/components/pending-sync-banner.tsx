import { Link } from '@tanstack/react-router'
import { CloudOff, RefreshCw } from 'lucide-react'
import { OfflineSyncManager } from '@/components/offline-sync-manager'
import { DEMO_MODE } from '@/lib/build-mode'
import { usePendingBrewsStore } from '@/modules/offline/pending-store'

export function PendingSyncBanner() {
  const items = usePendingBrewsStore((state) => state.items)
  const isHydrated = usePendingBrewsStore((state) => state.isHydrated)
  const isSyncing = usePendingBrewsStore((state) => state.isSyncing)
  const loadError = usePendingBrewsStore((state) => state.loadError)

  if (DEMO_MODE || !isHydrated) return null
  if (items.length === 0 && !loadError) return null

  const authRequired = items.some((item) => item.status === 'auth-required')
  const failed = items.some((item) => item.status === 'failed')
  const status = loadError
    ? 'Could not refresh saved brews.'
    : isSyncing
      ? 'Syncing now…'
      : authRequired
        ? 'Sign in to sync.'
        : failed
          ? 'Some brews need attention.'
          : 'Waiting to sync.'

  return (
    <div
      role="status"
      className="border-b border-border bg-secondary px-4 py-2 text-secondary-foreground"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm font-medium">
        {isSyncing ? (
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <CloudOff className="h-4 w-4" aria-hidden="true" />
        )}
        <span>
          {items.length === 0
            ? 'Pending brews could not be loaded.'
            : `${items.length} brew${items.length === 1 ? '' : 's'} saved on this device. ${status}`}
        </span>
        <Link
          to="/brews/pending"
          className="inline-flex min-h-11 items-center font-bold underline underline-offset-4 [@media(hover:hover)_and_(pointer:fine)]:min-h-0"
        >
          View pending
        </Link>
      </div>
    </div>
  )
}

export function OfflineStatus() {
  return (
    <>
      <OfflineSyncManager />
      <PendingSyncBanner />
    </>
  )
}
