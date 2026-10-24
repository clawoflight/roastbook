import {
  DEFAULT_OWNER_KEY,
  isVisibleOperationStatus,
  type OfflineEntityType,
  type OfflineOperation,
} from './operations'
import {
  LOCAL_ENTITIES_STORE,
  OPERATIONS_STORE,
  OWNER_ENTITY_SERVER_INDEX,
  openOfflineDatabase,
  requestToPromise,
  SYNC_METADATA_STORE,
  transactionToPromise,
} from './storage'

export const OFFLINE_SCHEMA_VERSION = 1
const SYNC_METADATA_KEY_SUFFIX = 'sync'

export type LocalEntitySyncState = 'local' | 'pending' | 'synced' | 'conflict'

export interface LocalEntityRecord<T = unknown> {
  readonly key: string
  readonly ownerKey: string
  readonly entityType: OfflineEntityType
  readonly localId: string
  readonly serverId: string | null
  readonly data: T
  readonly revision: string | null
  readonly syncState: LocalEntitySyncState
  readonly updatedAt: string
}

export interface LocalEntityInput<T> {
  readonly ownerKey?: string
  readonly entityType: OfflineEntityType
  readonly localId: string
  readonly serverId?: string | null
  readonly data: T
  readonly revision?: string | null
  readonly syncState?: LocalEntitySyncState
  readonly updatedAt?: string
}

export interface OfflineSyncMetadata {
  readonly ownerKey: string
  readonly schemaVersion: number
  readonly lastSuccessfulSyncAt: string | null
}

function localEntityKey(
  ownerKey: string,
  entityType: OfflineEntityType,
  localId: string,
): string {
  return `${encodeURIComponent(ownerKey)}:${entityType}:${encodeURIComponent(localId)}`
}

function syncMetadataKey(ownerKey: string): string {
  return `${encodeURIComponent(ownerKey)}:${SYNC_METADATA_KEY_SUFFIX}`
}

export async function putLocalEntity<T>(
  input: LocalEntityInput<T>,
): Promise<LocalEntityRecord<T>> {
  const ownerKey = input.ownerKey ?? DEFAULT_OWNER_KEY
  const record: LocalEntityRecord<T> = {
    key: localEntityKey(ownerKey, input.entityType, input.localId),
    ownerKey,
    entityType: input.entityType,
    localId: input.localId,
    serverId: input.serverId ?? null,
    data: input.data,
    revision: input.revision ?? null,
    syncState: input.syncState ?? 'local',
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  }

  const database = await openOfflineDatabase()
  const transaction = database.transaction(LOCAL_ENTITIES_STORE, 'readwrite')
  transaction.objectStore(LOCAL_ENTITIES_STORE).put(record)
  await transactionToPromise(transaction)
  return record
}

export async function getLocalEntity<T>(
  entityType: OfflineEntityType,
  localId: string,
  ownerKey: string = DEFAULT_OWNER_KEY,
): Promise<LocalEntityRecord<T> | undefined> {
  const database = await openOfflineDatabase()
  const transaction = database.transaction(LOCAL_ENTITIES_STORE, 'readonly')
  const record = (await requestToPromise(
    transaction
      .objectStore(LOCAL_ENTITIES_STORE)
      .get(localEntityKey(ownerKey, entityType, localId)),
  )) as LocalEntityRecord<T> | undefined
  await transactionToPromise(transaction)
  return record
}

export async function getLocalEntityByServerId<T>(
  entityType: OfflineEntityType,
  serverId: string,
  ownerKey: string = DEFAULT_OWNER_KEY,
): Promise<LocalEntityRecord<T> | undefined> {
  const database = await openOfflineDatabase()
  const transaction = database.transaction(LOCAL_ENTITIES_STORE, 'readonly')
  const record = (await requestToPromise(
    transaction
      .objectStore(LOCAL_ENTITIES_STORE)
      .index(OWNER_ENTITY_SERVER_INDEX)
      .get([ownerKey, entityType, serverId]),
  )) as LocalEntityRecord<T> | undefined
  await transactionToPromise(transaction)
  return record
}

export async function listLocalEntities<T>(
  options: {
    readonly ownerKey?: string
    readonly entityType?: OfflineEntityType
  } = {},
): Promise<LocalEntityRecord<T>[]> {
  const ownerKey = options.ownerKey ?? DEFAULT_OWNER_KEY
  const database = await openOfflineDatabase()
  const transaction = database.transaction(LOCAL_ENTITIES_STORE, 'readonly')
  const records = (await requestToPromise(
    transaction.objectStore(LOCAL_ENTITIES_STORE).getAll(),
  )) as LocalEntityRecord<T>[]
  await transactionToPromise(transaction)

  return records
    .filter(
      (record) =>
        record.ownerKey === ownerKey &&
        (options.entityType === undefined ||
          record.entityType === options.entityType),
    )
    .sort(
      (left, right) =>
        left.entityType.localeCompare(right.entityType) ||
        left.localId.localeCompare(right.localId),
    )
}

export async function putServerEntity<T>(input: {
  readonly ownerKey?: string
  readonly entityType: OfflineEntityType
  readonly serverId: string
  readonly data: T
}): Promise<void> {
  const ownerKey = input.ownerKey ?? DEFAULT_OWNER_KEY
  const database = await openOfflineDatabase()
  const transaction = database.transaction(
    [LOCAL_ENTITIES_STORE, OPERATIONS_STORE],
    'readwrite',
  )
  const store = transaction.objectStore(LOCAL_ENTITIES_STORE)
  const operations = (await requestToPromise(
    transaction.objectStore(OPERATIONS_STORE).getAll(),
  )) as OfflineOperation[]
  const deleteQueued = operations.some(
    (operation) =>
      operation.ownerKey === ownerKey &&
      operation.entityType === input.entityType &&
      operation.operationType === 'delete' &&
      operation.entityLocalId === input.serverId &&
      isVisibleOperationStatus(operation.status),
  )
  if (deleteQueued) {
    await transactionToPromise(transaction)
    return
  }

  const existing = (await requestToPromise(
    store
      .index(OWNER_ENTITY_SERVER_INDEX)
      .get([ownerKey, input.entityType, input.serverId]),
  )) as LocalEntityRecord<T> | undefined
  if (existing?.syncState === 'pending' || existing?.syncState === 'conflict') {
    await transactionToPromise(transaction)
    return
  }

  const updatedAt = new Date().toISOString()
  const record: LocalEntityRecord<T> = existing
    ? {
        ...existing,
        data: input.data,
        syncState: 'synced',
        updatedAt,
      }
    : {
        key: localEntityKey(ownerKey, input.entityType, input.serverId),
        ownerKey,
        entityType: input.entityType,
        localId: input.serverId,
        serverId: input.serverId,
        data: input.data,
        revision: null,
        syncState: 'synced',
        updatedAt,
      }
  store.put(record)
  await transactionToPromise(transaction)
}

export async function removeServerEntityImage(
  entityType: OfflineEntityType,
  serverId: string,
  imageId: number,
): Promise<void> {
  const database = await openOfflineDatabase()
  const transaction = database.transaction(LOCAL_ENTITIES_STORE, 'readwrite')
  const store = transaction.objectStore(LOCAL_ENTITIES_STORE)
  const record = (await requestToPromise(
    store
      .index(OWNER_ENTITY_SERVER_INDEX)
      .get([DEFAULT_OWNER_KEY, entityType, serverId]),
  )) as LocalEntityRecord<Record<string, unknown>> | undefined
  if (!record) {
    await transactionToPromise(transaction)
    return
  }

  const entityKey = entityType === 'brew' ? 'shot' : 'recipe'
  const entity = record.data[entityKey] as
    | { readonly images?: Array<{ readonly id: number }> }
    | undefined
  if (!entity?.images) {
    await transactionToPromise(transaction)
    return
  }

  store.put({
    ...record,
    data: {
      ...record.data,
      [entityKey]: {
        ...entity,
        images: entity.images.filter((image) => image.id !== imageId),
      },
    },
    syncState: 'pending',
    updatedAt: new Date().toISOString(),
  })
  await transactionToPromise(transaction)
}

export async function updateServerEntityRevision(
  entityType: OfflineEntityType,
  serverId: string,
  revision: string,
): Promise<void> {
  const database = await openOfflineDatabase()
  const transaction = database.transaction(
    [LOCAL_ENTITIES_STORE, OPERATIONS_STORE],
    'readwrite',
  )
  const store = transaction.objectStore(LOCAL_ENTITIES_STORE)
  const entity = (await requestToPromise(
    store
      .index(OWNER_ENTITY_SERVER_INDEX)
      .get([DEFAULT_OWNER_KEY, entityType, serverId]),
  )) as LocalEntityRecord<Record<string, unknown>> | undefined
  if (!entity) {
    await transactionToPromise(transaction)
    return
  }

  const operations = (await requestToPromise(
    transaction.objectStore(OPERATIONS_STORE).getAll(),
  )) as OfflineOperation[]
  const hasPending = operations.some(
    (operation) =>
      operation.ownerKey === entity.ownerKey &&
      operation.entityServerId === serverId &&
      isVisibleOperationStatus(operation.status) &&
      ((operation.entityType === entityType &&
        (operation.operationType === 'update' ||
          operation.operationType === 'delete')) ||
        (operation.entityType === 'brew-image' &&
          (operation.operationType === 'upload' ||
            operation.operationType === 'remove-image'))),
  )
  const entityKey = entityType === 'brew' ? 'shot' : 'recipe'
  const data = entity.data[entityKey]
  if (!data || typeof data !== 'object') {
    await transactionToPromise(transaction)
    return
  }

  store.put({
    ...entity,
    data: {
      ...entity.data,
      [entityKey]: { ...data, revision: Number(revision) },
    },
    syncState: hasPending ? 'pending' : 'synced',
    updatedAt: new Date().toISOString(),
  })
  await transactionToPromise(transaction)
}

export async function refreshServerEntitySyncState(
  entityType: OfflineEntityType,
  serverId: string,
): Promise<void> {
  const database = await openOfflineDatabase()
  const transaction = database.transaction(
    [LOCAL_ENTITIES_STORE, OPERATIONS_STORE],
    'readwrite',
  )
  const store = transaction.objectStore(LOCAL_ENTITIES_STORE)
  const entity = (await requestToPromise(
    store
      .index(OWNER_ENTITY_SERVER_INDEX)
      .get([DEFAULT_OWNER_KEY, entityType, serverId]),
  )) as LocalEntityRecord | undefined
  if (!entity) {
    await transactionToPromise(transaction)
    return
  }

  const operations = (await requestToPromise(
    transaction.objectStore(OPERATIONS_STORE).getAll(),
  )) as OfflineOperation[]
  const hasPending = operations.some(
    (operation) =>
      operation.ownerKey === entity.ownerKey &&
      operation.entityServerId === serverId &&
      isVisibleOperationStatus(operation.status) &&
      ((operation.entityType === entityType &&
        (operation.operationType === 'update' ||
          operation.operationType === 'delete')) ||
        (operation.entityType === 'brew-image' &&
          (operation.operationType === 'upload' ||
            operation.operationType === 'remove-image'))),
  )
  store.put({
    ...entity,
    syncState: hasPending ? 'pending' : 'synced',
    updatedAt: new Date().toISOString(),
  })
  await transactionToPromise(transaction)
}

export async function markLocalEntitySynced(
  entityType: OfflineEntityType,
  localId: string,
  options: {
    readonly ownerKey?: string
    readonly serverId: string
    readonly revision?: string | null
  },
): Promise<LocalEntityRecord | undefined> {
  const ownerKey = options.ownerKey ?? DEFAULT_OWNER_KEY
  const database = await openOfflineDatabase()
  const transaction = database.transaction(LOCAL_ENTITIES_STORE, 'readwrite')
  const store = transaction.objectStore(LOCAL_ENTITIES_STORE)
  const key = localEntityKey(ownerKey, entityType, localId)
  const existing = (await requestToPromise(store.get(key))) as
    | LocalEntityRecord
    | undefined
  if (!existing) {
    await transactionToPromise(transaction)
    return undefined
  }

  const record: LocalEntityRecord = {
    ...existing,
    serverId: options.serverId,
    revision: options.revision ?? existing.revision,
    syncState: 'synced',
    updatedAt: new Date().toISOString(),
  }
  store.put(record)
  await transactionToPromise(transaction)
  return record
}

export async function removeLocalEntity(
  entityType: OfflineEntityType,
  localId: string,
  ownerKey: string = DEFAULT_OWNER_KEY,
): Promise<void> {
  const database = await openOfflineDatabase()
  const transaction = database.transaction(LOCAL_ENTITIES_STORE, 'readwrite')
  transaction
    .objectStore(LOCAL_ENTITIES_STORE)
    .delete(localEntityKey(ownerKey, entityType, localId))
  await transactionToPromise(transaction)
}

export async function readOfflineSyncMetadata(
  ownerKey: string = DEFAULT_OWNER_KEY,
): Promise<OfflineSyncMetadata> {
  const database = await openOfflineDatabase()
  const transaction = database.transaction(SYNC_METADATA_STORE, 'readonly')
  const record = (await requestToPromise(
    transaction.objectStore(SYNC_METADATA_STORE).get(syncMetadataKey(ownerKey)),
  )) as OfflineSyncMetadata | undefined
  await transactionToPromise(transaction)

  return (
    record ?? {
      ownerKey,
      schemaVersion: OFFLINE_SCHEMA_VERSION,
      lastSuccessfulSyncAt: null,
    }
  )
}

export async function recordSuccessfulSync(
  ownerKey: string = DEFAULT_OWNER_KEY,
  at: string = new Date().toISOString(),
): Promise<OfflineSyncMetadata> {
  const metadata: OfflineSyncMetadata = {
    ownerKey,
    schemaVersion: OFFLINE_SCHEMA_VERSION,
    lastSuccessfulSyncAt: at,
  }
  const database = await openOfflineDatabase()
  const transaction = database.transaction(SYNC_METADATA_STORE, 'readwrite')
  transaction
    .objectStore(SYNC_METADATA_STORE)
    .put(metadata, syncMetadataKey(ownerKey))
  await transactionToPromise(transaction)
  return metadata
}
