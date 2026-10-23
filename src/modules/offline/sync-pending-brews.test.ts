import { describe, expect, test } from 'bun:test'
import { newShotPayload } from '@/lib/new-shot-payload'
import { EMPTY_SHOT_FORM_VALUES } from '@/modules/brews/shot-form-values'
import { syncPendingBrews } from '@/modules/offline/sync-pending-brews'
import type { PendingBrew, PendingBrewPayload } from '@/modules/offline/types'

function pendingBrew(overrides: Partial<PendingBrew> = {}): PendingBrew {
  const operationId = overrides.operationId ?? crypto.randomUUID()
  const payload: PendingBrewPayload = {
    ...newShotPayload(
      {
        ...EMPTY_SHOT_FORM_VALUES,
        brewingMethodId: '1',
        doseGrams: '18.00',
        yieldGrams: '36.00',
        shotTimeSeconds: '28.00',
        rating: 4,
      },
      [7],
    ),
    clientOperationId: operationId,
  }

  return {
    operationId,
    payload,
    summary: {
      beanName: 'Konga',
      methodName: 'Espresso',
      brewedAt: '2026-10-23T08:00:00.000Z',
      doseGrams: '18.00',
      yieldGrams: '36.00',
      shotTimeSeconds: '28.00',
    },
    createdAt: '2026-10-23T08:00:01.000Z',
    attempts: 0,
    status: 'pending',
    ...overrides,
  }
}

function createRepository(initial: PendingBrew[]) {
  const items = new Map(initial.map((item) => [item.operationId, item]))

  return {
    list: () => Promise.resolve([...items.values()]),
    remove: (operationId: string) => {
      items.delete(operationId)
      return Promise.resolve()
    },
    mark: (operationId: string, changes: Partial<PendingBrew>) => {
      const item = items.get(operationId)
      if (item) items.set(operationId, { ...item, ...changes })
      return Promise.resolve()
    },
    get: (operationId: string) => items.get(operationId),
  }
}

describe('offline brew sync', () => {
  test('syncs pending brews and forwards the saved payload', async () => {
    const first = pendingBrew()
    const second = pendingBrew()
    const repository = createRepository([first, second])
    const created: PendingBrewPayload[] = []

    const result = await syncPendingBrews({
      list: repository.list,
      remove: repository.remove,
      mark: repository.mark,
      create: (payload) => {
        created.push(payload)
        return Promise.resolve({ id: created.length })
      },
      authenticate: () => Promise.resolve('authenticated'),
      isOnline: () => true,
    })

    expect(result).toEqual({
      synced: 2,
      authRequired: false,
      stoppedByNetwork: false,
      failed: 0,
    })
    expect(created).toHaveLength(2)
    expect(created[0]).toMatchObject({
      clientOperationId: first.operationId,
      doseGrams: '18.00',
      yieldGrams: '36.00',
      shotTimeSeconds: '28.00',
      rating: 4,
      tasteTagIds: [7],
    })
    expect(await repository.list()).toHaveLength(0)
  })

  test('does not sync while offline', async () => {
    const repository = createRepository([pendingBrew()])
    let createCalls = 0

    const result = await syncPendingBrews({
      list: repository.list,
      remove: repository.remove,
      mark: repository.mark,
      create: () => {
        createCalls += 1
        return Promise.resolve()
      },
      authenticate: () => Promise.resolve('authenticated'),
      isOnline: () => false,
    })

    expect(result.stoppedByNetwork).toBe(true)
    expect(createCalls).toBe(0)
    expect(await repository.list()).toHaveLength(1)
  })

  test('marks every queued brew when authentication expired', async () => {
    const first = pendingBrew()
    const second = pendingBrew()
    const repository = createRepository([first, second])

    const result = await syncPendingBrews({
      list: repository.list,
      remove: repository.remove,
      mark: repository.mark,
      create: () => Promise.resolve(),
      authenticate: () => Promise.resolve('auth-required'),
      isOnline: () => true,
    })

    expect(result.authRequired).toBe(true)
    const items = await repository.list()
    expect(items.map((item) => item.status)).toEqual([
      'auth-required',
      'auth-required',
    ])
  })

  test('keeps a validation failure and continues with the next brew', async () => {
    const first = pendingBrew()
    const second = pendingBrew()
    const repository = createRepository([first, second])

    const result = await syncPendingBrews({
      list: repository.list,
      remove: repository.remove,
      mark: repository.mark,
      create: (payload) => {
        if (payload.clientOperationId === first.operationId) {
          return Promise.reject(new Error('Selected bag not found'))
        }
        return Promise.resolve()
      },
      authenticate: () => Promise.resolve('authenticated'),
      isOnline: () => true,
    })

    expect(result.synced).toBe(1)
    expect(result.failed).toBe(1)
    expect((await repository.list())[0]?.status).toBe('failed')
    expect((await repository.list())[0]?.lastError).toBe(
      'Selected bag not found',
    )
  })

  test('stops on a network failure and leaves the item queued', async () => {
    const item = pendingBrew()
    const repository = createRepository([item])

    const result = await syncPendingBrews({
      list: repository.list,
      remove: repository.remove,
      mark: repository.mark,
      create: () => Promise.reject(new TypeError('Failed to fetch')),
      authenticate: () => Promise.resolve('authenticated'),
      isOnline: () => true,
    })

    expect(result.stoppedByNetwork).toBe(true)
    expect(await repository.list()).toHaveLength(1)
    expect((await repository.list())[0]?.status).toBe('pending')
  })

  test('keeps a transient server failure pending for the next sync', async () => {
    const item = pendingBrew()
    const repository = createRepository([item])

    const result = await syncPendingBrews({
      list: repository.list,
      remove: repository.remove,
      mark: repository.mark,
      create: () => Promise.reject(new Error('Internal Server Error')),
      authenticate: () => Promise.resolve('authenticated'),
      isOnline: () => true,
    })

    expect(result.stoppedByNetwork).toBe(true)
    expect(result.failed).toBe(0)
    expect((await repository.list())[0]?.status).toBe('pending')
    expect((await repository.list())[0]?.lastError).toBe(
      'Internal Server Error',
    )
  })

  test('stops when the auth probe becomes unreachable after a failure', async () => {
    const item = pendingBrew()
    const repository = createRepository([item])
    let probeCalls = 0

    const result = await syncPendingBrews({
      list: repository.list,
      remove: repository.remove,
      mark: repository.mark,
      create: () => Promise.reject(new Error('Server error')),
      authenticate: () => {
        probeCalls += 1
        return Promise.resolve(
          probeCalls === 1 ? 'authenticated' : 'unreachable',
        )
      },
      isOnline: () => true,
    })

    expect(result.stoppedByNetwork).toBe(true)
    expect((await repository.list())[0]?.status).toBe('pending')
  })

  test('leaves failed items for an explicit retry', async () => {
    const failed = pendingBrew({ status: 'failed', lastError: 'Nope' })
    const pending = pendingBrew()
    const repository = createRepository([failed, pending])
    const created: string[] = []

    const result = await syncPendingBrews({
      list: repository.list,
      remove: repository.remove,
      mark: repository.mark,
      create: (payload) => {
        created.push(payload.clientOperationId)
        return Promise.resolve()
      },
      authenticate: () => Promise.resolve('authenticated'),
      isOnline: () => true,
    })

    expect(result.synced).toBe(1)
    expect(result.failed).toBe(0)
    expect(created).toEqual([pending.operationId])
    expect((await repository.list())[0]?.status).toBe('failed')
  })
})
