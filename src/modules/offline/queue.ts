import type { CachedReferenceData, PendingBrew } from './types'

const DATABASE_NAME = 'roastbook-offline'
const DATABASE_VERSION = 1
const PENDING_STORE = 'pending-brews'
const REFERENCE_STORE = 'reference-data'
const CREATED_AT_INDEX = 'createdAt'

let databasePromise: Promise<IDBDatabase> | undefined

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Offline storage request failed'))
  })
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Offline storage write failed'))
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error('Offline storage write was aborted'),
      )
  })
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(
      new Error('Offline storage is unavailable in this browser'),
    )
  }

  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(PENDING_STORE)) {
        const store = database.createObjectStore(PENDING_STORE, {
          keyPath: 'operationId',
        })
        store.createIndex(CREATED_AT_INDEX, 'createdAt')
      }
      if (!database.objectStoreNames.contains(REFERENCE_STORE)) {
        database.createObjectStore(REFERENCE_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open offline storage'))
    request.onblocked = () =>
      reject(new Error('Offline storage is blocked by another tab'))
  })
    .then((database) => {
      database.onclose = () => {
        databasePromise = undefined
      }
      database.onversionchange = () => {
        database.close()
        databasePromise = undefined
      }
      return database
    })
    .catch((error) => {
      databasePromise = undefined
      throw error
    })

  return databasePromise
}

export async function listPendingBrews(): Promise<PendingBrew[]> {
  const database = await openDatabase()
  const transaction = database.transaction(PENDING_STORE, 'readonly')
  const store = transaction.objectStore(PENDING_STORE)
  const items = (await requestToPromise(
    store.index(CREATED_AT_INDEX).getAll(),
  )) as PendingBrew[]
  await transactionToPromise(transaction)
  return items.sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  )
}

export async function getPendingBrew(
  operationId: string,
): Promise<PendingBrew | undefined> {
  const database = await openDatabase()
  const transaction = database.transaction(PENDING_STORE, 'readonly')
  const store = transaction.objectStore(PENDING_STORE)
  const item = (await requestToPromise(store.get(operationId))) as
    | PendingBrew
    | undefined
  await transactionToPromise(transaction)
  return item
}

export async function putPendingBrew(item: PendingBrew): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(PENDING_STORE, 'readwrite')
  transaction.objectStore(PENDING_STORE).put(item)
  await transactionToPromise(transaction)
}

export async function updatePendingBrew(
  operationId: string,
  changes: Partial<Omit<PendingBrew, 'operationId'>>,
): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(PENDING_STORE, 'readwrite')
  const store = transaction.objectStore(PENDING_STORE)
  const existing = (await requestToPromise(store.get(operationId))) as
    | PendingBrew
    | undefined
  if (existing) {
    store.put({ ...existing, ...changes })
  }
  await transactionToPromise(transaction)
}

export async function deletePendingBrew(operationId: string): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(PENDING_STORE, 'readwrite')
  transaction.objectStore(PENDING_STORE).delete(operationId)
  await transactionToPromise(transaction)
}

export async function writeCachedReferenceData<T>(
  key: string,
  version: number,
  data: T,
): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(REFERENCE_STORE, 'readwrite')
  const record: CachedReferenceData<T> = {
    version,
    savedAt: new Date().toISOString(),
    data,
  }
  transaction.objectStore(REFERENCE_STORE).put(record, key)
  await transactionToPromise(transaction)
}

export async function readCachedReferenceData<T>(
  key: string,
  version: number,
): Promise<CachedReferenceData<T> | undefined> {
  const database = await openDatabase()
  const transaction = database.transaction(REFERENCE_STORE, 'readonly')
  const store = transaction.objectStore(REFERENCE_STORE)
  const record = (await requestToPromise(store.get(key))) as
    | CachedReferenceData<T>
    | undefined
  await transactionToPromise(transaction)

  if (!record || record.version !== version) {
    if (record) {
      const deleteTransaction = database.transaction(
        REFERENCE_STORE,
        'readwrite',
      )
      deleteTransaction.objectStore(REFERENCE_STORE).delete(key)
      await transactionToPromise(deleteTransaction)
    }
    return undefined
  }

  return record
}

/** Test-only reset so each queue test starts from an empty database. */
export async function resetOfflineDatabaseForTests(): Promise<void> {
  const database = await databasePromise?.catch(() => undefined)
  database?.close()
  databasePromise = undefined

  if (typeof indexedDB === 'undefined') return

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () =>
      reject(request.error ?? new Error('Could not reset offline storage'))
    request.onblocked = () => resolve()
  })
}
