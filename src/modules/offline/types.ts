import type { newShotPayload } from '@/lib/new-shot-payload'

export type PendingBrewPayload = ReturnType<typeof newShotPayload> & {
  readonly clientOperationId: string
}

export type PendingBrewStatus = 'pending' | 'auth-required' | 'failed'

export interface PendingBrewSummary {
  readonly beanName: string | null
  readonly methodName: string
  readonly brewedAt: string
  readonly doseGrams: string | null
  readonly yieldGrams: string | null
  readonly shotTimeSeconds: string | null
}

export interface PendingBrew {
  readonly operationId: string
  readonly payload: PendingBrewPayload
  readonly summary: PendingBrewSummary
  readonly createdAt: string
  readonly attempts: number
  readonly status: PendingBrewStatus
  readonly lastError?: string
}

export interface CachedReferenceData<T> {
  readonly version: number
  readonly savedAt: string
  readonly data: T
}
