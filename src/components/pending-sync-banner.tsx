import { Link } from '@tanstack/react-router'
import { CloudOff, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { OfflineSyncManager } from '@/components/offline-sync-manager'
import { DEMO_MODE } from '@/lib/build-mode'
import { listOperations } from '@/modules/offline/operation-queue'
import {
  isVisibleOperationStatus,
  type OfflineOperation,
} from '@/modules/offline/operations'
import { usePendingBrewsStore } from '@/modules/offline/pending-store'
import {
  subscribeToPendingSync,
  subscribeToPendingSyncFinished,
} from '@/modules/offline/sync-trigger'

export function PendingSyncBanner() {
  const isHydrated = usePendingBrewsStore((state) => state.isHydrated)
  const isSyncing = usePendingBrewsStore((state) => state.isSyncing)
  const loadError = usePendingBrewsStore((state) => state.loadError)
  const [operations, setOperations] = useState<OfflineOperation[]>([])

  const load = useCallback(async () => {
    try {
      const all = await listOperations()
      setOperations(all.filter((item) => isVisibleOperationStatus(item.status)))
    } catch {
      setOperations([])
    }
  }, [])

  useEffect(() => {
    void load()
    const unsubscribeRequested = subscribeToPendingSync(() => {
      void load()
    })
    const unsubscribeFinished = subscribeToPendingSyncFinished(() => {
      void load()
    })
    return () => {
      unsubscribeRequested()
      unsubscribeFinished()
    }
  }, [load])

  if (DEMO_MODE || !isHydrated) return null
  if (operations.length === 0 && !loadError) return null

  const authRequired = operations.some(
    (item) => item.status === 'auth-required',
  )
  const failed = operations.some(
    (item) => item.status === 'permanent' || item.status === 'conflict',
  )
  const status = isSyncing
    ? 'Syncing now…'
    : authRequired
      ? 'Sign in to sync.'
      : failed
        ? 'Some changes need attention.'
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
          {operations.length === 0
            ? 'Pending changes could not be loaded.'
            : `${operations.length} offline change${operations.length === 1 ? '' : 's'} saved on this device. ${status}${loadError ? ' Could not refresh saved changes.' : ''}`}
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
