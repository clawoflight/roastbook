import { WifiOff } from 'lucide-react'

export function OfflineBanner() {
  return (
    <div
      role="status"
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 text-sm font-medium">
        <WifiOff className="h-4 w-4" aria-hidden="true" />
        You're offline. Reconnect to load or save your journal.
      </div>
    </div>
  )
}
