import { Download, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { usePreferencesStore } from '@/lib/preferences-store'

// Chromium-only event; not in the DOM typings.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Reflect.get(navigator, 'standalone') === true
  )
}

function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function InstallAppHint() {
  const hasHydrated = usePreferencesStore((state) => state.hasHydrated)
  const dismissed = usePreferencesStore((state) => state.installHintDismissed)
  const dismiss = usePreferencesStore((state) => state.dismissInstallHint)
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    // iOS Safari has no install prompt API, so explain the manual step instead.
    setShowIosHint(isIos())

    const handlePrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    const handleInstalled = () => setInstallPrompt(null)
    window.addEventListener('beforeinstallprompt', handlePrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  if (!hasHydrated || dismissed || (!installPrompt && !showIosHint)) {
    return null
  }

  const install = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    // A prompt event can only be used once.
    setInstallPrompt(null)
    if (outcome === 'accepted') dismiss()
  }

  return (
    <div className="border-b border-border bg-secondary/60 px-4 py-1.5 text-secondary-foreground">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 text-sm">
        <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          {installPrompt
            ? 'Install Roastbook to use it offline, right from your home screen.'
            : 'Install Roastbook for offline use: tap Share, then Add to Home Screen.'}
        </p>
        {installPrompt ? (
          <Button size="xs" variant="outline" onClick={() => void install()}>
            Install
          </Button>
        ) : null}
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Dismiss install hint"
          onClick={dismiss}
        >
          <X />
        </Button>
      </div>
    </div>
  )
}
