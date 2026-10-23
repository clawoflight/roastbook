import type { AuthenticationState } from '@/modules/offline/auth'
import { isNetworkError } from '@/modules/offline/errors'
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

export async function syncPendingBrews(
  dependencies: SyncPendingBrewsDependencies,
): Promise<SyncPendingBrewsResult> {
  const items = await dependencies.list()
  const eligible = items.filter((item) => item.status !== 'failed')
  const alreadyFailed = items.length - eligible.length

  if (eligible.length === 0) {
    return {
      synced: 0,
      authRequired: false,
      stoppedByNetwork: !dependencies.isOnline(),
      failed: alreadyFailed,
    }
  }

  if (!dependencies.isOnline()) {
    return {
      synced: 0,
      authRequired: false,
      stoppedByNetwork: true,
      failed: alreadyFailed,
    }
  }

  const authentication = await dependencies.authenticate()
  if (authentication === 'unreachable') {
    return {
      synced: 0,
      authRequired: false,
      stoppedByNetwork: true,
      failed: alreadyFailed,
    }
  }
  if (authentication === 'auth-required') {
    for (const item of eligible) {
      if (item.status !== 'auth-required') {
        await dependencies.mark(item.operationId, {
          status: 'auth-required',
          lastError: undefined,
        })
      }
    }
    return {
      synced: 0,
      authRequired: true,
      stoppedByNetwork: false,
      failed: alreadyFailed,
    }
  }

  let synced = 0
  let failed = alreadyFailed

  for (const item of eligible) {
    if (!dependencies.isOnline()) {
      return {
        synced,
        authRequired: false,
        stoppedByNetwork: true,
        failed,
      }
    }

    try {
      await dependencies.create({
        ...item.payload,
        clientOperationId: item.operationId,
      })
      await dependencies.remove(item.operationId)
      synced += 1
    } catch (error) {
      if (isNetworkError(error) || !dependencies.isOnline()) {
        return {
          synced,
          authRequired: false,
          stoppedByNetwork: true,
          failed,
        }
      }

      const authentication = await dependencies.authenticate()
      if (authentication === 'unreachable') {
        return {
          synced,
          authRequired: false,
          stoppedByNetwork: true,
          failed,
        }
      }
      if (authentication === 'auth-required') {
        await dependencies.mark(item.operationId, {
          status: 'auth-required',
          attempts: item.attempts + 1,
          lastError: undefined,
        })
        return {
          synced,
          authRequired: true,
          stoppedByNetwork: false,
          failed,
        }
      }

      await dependencies.mark(item.operationId, {
        status: 'failed',
        attempts: item.attempts + 1,
        lastError:
          error instanceof Error ? error.message : 'Could not sync this brew',
      })
      failed += 1
    }
  }

  return {
    synced,
    authRequired: false,
    stoppedByNetwork: false,
    failed,
  }
}
