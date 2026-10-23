import { getErrorMessage } from '@/lib/error-message'
import type { AuthenticationState } from '@/modules/offline/auth'
import { isDefinitiveSyncError, isNetworkError } from '@/modules/offline/errors'
import type { PendingBrew, PendingBrewPayload } from '@/modules/offline/types'

export interface SyncPendingBrewsDependencies {
  readonly list: () => Promise<PendingBrew[]>
  readonly remove: (operationId: string) => Promise<void>
  readonly mark: (
    operationId: string,
    changes: Partial<Pick<PendingBrew, 'status' | 'attempts' | 'lastError'>>,
  ) => Promise<void>
  readonly create: (payload: PendingBrewPayload) => Promise<unknown>
  readonly authenticate: () => Promise<AuthenticationState>
  readonly isOnline: () => boolean
}

export interface SyncPendingBrewsResult {
  readonly synced: number
  readonly authRequired: boolean
  readonly stoppedByNetwork: boolean
  readonly failed: number
}

type ItemSyncOutcome = 'synced' | 'network' | 'auth' | 'failed'

function syncResult(
  synced: number,
  failed: number,
  options: Partial<
    Pick<SyncPendingBrewsResult, 'authRequired' | 'stoppedByNetwork'>
  > = {},
): SyncPendingBrewsResult {
  return {
    synced,
    failed,
    authRequired: options.authRequired ?? false,
    stoppedByNetwork: options.stoppedByNetwork ?? false,
  }
}

async function markAuthRequired(
  dependencies: SyncPendingBrewsDependencies,
  items: readonly PendingBrew[],
): Promise<void> {
  for (const item of items) {
    if (item.status === 'auth-required') continue
    await dependencies.mark(item.operationId, {
      status: 'auth-required',
      lastError: undefined,
    })
  }
}

async function syncOneBrew(
  dependencies: SyncPendingBrewsDependencies,
  item: PendingBrew,
): Promise<ItemSyncOutcome> {
  try {
    await dependencies.create({
      ...item.payload,
      clientOperationId: item.operationId,
    })
  } catch (error) {
    if (isNetworkError(error) || !dependencies.isOnline()) return 'network'

    const authentication = await dependencies.authenticate()
    if (authentication === 'unreachable') return 'network'
    if (authentication === 'auth-required') {
      await dependencies.mark(item.operationId, {
        status: 'auth-required',
        attempts: item.attempts + 1,
        lastError: undefined,
      })
      return 'auth'
    }

    const message = getErrorMessage(error, 'Could not sync this brew')
    if (!isDefinitiveSyncError(error)) {
      await dependencies.mark(item.operationId, {
        status: 'pending',
        attempts: item.attempts + 1,
        lastError: message,
      })
      return 'network'
    }

    await dependencies.mark(item.operationId, {
      status: 'failed',
      attempts: item.attempts + 1,
      lastError: message,
    })
    return 'failed'
  }

  await dependencies.remove(item.operationId)
  return 'synced'
}

export async function syncPendingBrews(
  dependencies: SyncPendingBrewsDependencies,
): Promise<SyncPendingBrewsResult> {
  const items = await dependencies.list()
  const eligible = items.filter((item) => item.status !== 'failed')

  if (eligible.length === 0) {
    return syncResult(0, 0, {
      stoppedByNetwork: !dependencies.isOnline(),
    })
  }
  if (!dependencies.isOnline()) {
    return syncResult(0, 0, { stoppedByNetwork: true })
  }

  const authentication = await dependencies.authenticate()
  if (authentication === 'unreachable') {
    return syncResult(0, 0, { stoppedByNetwork: true })
  }
  if (authentication === 'auth-required') {
    await markAuthRequired(dependencies, eligible)
    return syncResult(0, 0, { authRequired: true })
  }

  let synced = 0
  let failed = 0

  for (const [index, item] of eligible.entries()) {
    if (!dependencies.isOnline()) {
      return syncResult(synced, failed, { stoppedByNetwork: true })
    }

    const outcome = await syncOneBrew(dependencies, item)
    if (outcome === 'synced') {
      synced += 1
    } else if (outcome === 'network') {
      return syncResult(synced, failed, { stoppedByNetwork: true })
    } else if (outcome === 'auth') {
      await markAuthRequired(dependencies, eligible.slice(index + 1))
      return syncResult(synced, failed, { authRequired: true })
    } else {
      failed += 1
    }
  }

  return syncResult(synced, failed)
}
