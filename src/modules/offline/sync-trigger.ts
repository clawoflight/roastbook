const listeners = new Set<() => void>()

export function requestPendingSync(): void {
  for (const listener of listeners) listener()
}

export function subscribeToPendingSync(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
