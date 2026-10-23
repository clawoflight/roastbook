import { create } from 'zustand'
import {
  deletePendingBrew,
  listPendingBrews,
  putPendingBrew,
  updatePendingBrew,
} from '@/modules/offline/queue'
import { requestPendingSync } from '@/modules/offline/sync-trigger'
import type { PendingBrew, PendingBrewPayload } from '@/modules/offline/types'

type PendingBrewsState = {
  readonly items: PendingBrew[]
  readonly isHydrated: boolean
  readonly isSyncing: boolean
  readonly hydrate: () => Promise<void>
  readonly refresh: () => Promise<void>
  readonly setSyncing: (isSyncing: boolean) => void
}

export const usePendingBrewsStore = create<PendingBrewsState>((set) => ({
  items: [],
  isHydrated: false,
  isSyncing: false,
  hydrate: async () => {
    try {
      const items = await listPendingBrews()
      set({ items, isHydrated: true })
    } catch {
      set({ isHydrated: true })
    }
  },
  refresh: async () => {
    try {
      const items = await listPendingBrews()
      set({ items, isHydrated: true })
    } catch {
      set({ isHydrated: true })
    }
  },
  setSyncing: (isSyncing) => set({ isSyncing }),
}))

export async function enqueuePendingBrew(item: PendingBrew): Promise<void> {
  await putPendingBrew(item)
  await usePendingBrewsStore.getState().refresh()
}

export async function updateQueuedBrewPayload(
  operationId: string,
  payload: PendingBrewPayload,
): Promise<void> {
  await updatePendingBrew(operationId, { payload })
  await usePendingBrewsStore.getState().refresh()
}

export async function discardPendingBrew(operationId: string): Promise<void> {
  await deletePendingBrew(operationId)
  await usePendingBrewsStore.getState().refresh()
}

export async function retryPendingBrew(operationId: string): Promise<void> {
  await updatePendingBrew(operationId, {
    status: 'pending',
    lastError: undefined,
  })
  await usePendingBrewsStore.getState().refresh()
  requestPendingSync()
}

export async function markPendingBrew(
  operationId: string,
  changes: Partial<Pick<PendingBrew, 'status' | 'attempts' | 'lastError'>>,
): Promise<void> {
  await updatePendingBrew(operationId, changes)
}
