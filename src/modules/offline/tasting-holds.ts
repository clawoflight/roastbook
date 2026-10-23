const heldForTasting = new Set<string>()

/**
 * Keeps a queued brew out of the sync loop while its tasting dialog is open.
 * The hold is intentionally in memory: if the app closes, the brew can sync on
 * the next launch without the unfinished tasting.
 */
export function holdPendingBrewForTasting(operationId: string): void {
  heldForTasting.add(operationId)
}

export function releasePendingBrewForTasting(operationId: string): void {
  heldForTasting.delete(operationId)
}

export function isPendingBrewHeldForTasting(operationId: string): boolean {
  return heldForTasting.has(operationId)
}
