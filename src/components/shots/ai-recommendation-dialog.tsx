import { History, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useState } from 'react'
import {
  ChangeBlock,
  KeepConstantBlock,
  NoteBlock,
  RichText,
} from '@/components/shots/recommendation-blocks'
import { RecommendationChat } from '@/components/shots/recommendation-chat'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useDateFormatter } from '@/hooks/use-date-formatter'
import { getErrorMessage } from '@/lib/error-message'
import { getShotRecommendation } from '@/lib/server/shot-recommendations'
import {
  isFocusedShotRecommendationRequest,
  type ShotRecommendationRequest,
} from '@/lib/shot-recommendation'
import { cn } from '@/lib/utils'

type RecommendationResult = Awaited<ReturnType<typeof getShotRecommendation>>

const DIAGNOSIS_LABELS = {
  under_extracted_and_strong: 'Under-extracted · strong',
  under_extracted_and_weak: 'Under-extracted · weak',
  balanced: 'Sweet spot',
  over_extracted_and_strong: 'Over-extracted · strong',
  over_extracted_and_weak: 'Over-extracted · weak',
  uneven_extraction: 'Uneven extraction',
  insufficient_evidence: 'More evidence needed',
} as const

export function AiRecommendationDialog({
  request,
  enabled,
  className,
  size = 'default',
  showDisabledReason = false,
}: {
  readonly request: ShotRecommendationRequest | null
  readonly enabled: boolean
  readonly className?: string
  readonly size?: 'sm' | 'default' | 'lg'
  /**
   * Print why the button is disabled under it. Hover titles never show on
   * touch screens, so forms opt in to visible text.
   */
  readonly showDisabledReason?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RecommendationResult | null>(null)
  const [mobilePane, setMobilePane] = useState<'recommendation' | 'chat'>(
    'recommendation',
  )
  const isFocusedShot = request
    ? isFocusedShotRecommendationRequest(request)
    : false

  const loadRecommendation = async () => {
    if (!request) return
    setLoading(true)
    setError(null)
    setResult(null)
    setMobilePane('recommendation')
    try {
      setResult(await getShotRecommendation({ data: request }))
    } catch (caught) {
      setError(getErrorMessage(caught, 'Could not generate a recommendation'))
    } finally {
      setLoading(false)
    }
  }

  const buttonTitle = !request
    ? 'Choose beans and a brewing method first'
    : undefined
  const helpText = isFocusedShot
    ? 'Assesses this brew and suggests the next adjustment. Uses its beans, method, exact gear, parameters, tasting result, and matching history.'
    : 'Suggests the next controlled brew adjustment from the latest completed brew for the selected beans and its history. Unsaved form values are not used.'

  const visibleDisabledReason = showDisabledReason ? buttonTitle : undefined

  // Without a configured AI provider there is nothing to offer, so no button at all.
  if (!enabled) return null

  return (
    <>
      <div className={`flex flex-wrap items-center gap-1.5 ${className ?? ''}`}>
        <Tooltip>
          <TooltipTrigger>
            <Button
              type="button"
              variant="outline"
              size={size}
              className={className ? 'min-w-0 flex-1' : undefined}
              disabled={!request}
              title={visibleDisabledReason ? undefined : buttonTitle}
              onClick={() => {
                setOpen(true)
                void loadRecommendation()
              }}
            >
              <Sparkles />
              AI Recommendation
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            sideOffset={6}
            className="w-72 items-start rounded-lg border border-border bg-popover p-3 text-sm leading-relaxed text-muted-foreground shadow-coffee [&>svg]:hidden"
          >
            {helpText}
          </TooltipContent>
        </Tooltip>
        {visibleDisabledReason ? (
          <p className="basis-full text-center text-xs text-muted-foreground">
            {visibleDisabledReason}
          </p>
        ) : null}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(
            'sm:max-w-2xl lg:max-w-5xl',
            // A fixed height keeps the chat from resizing the dialog as it
            // grows or when switching tabs on a phone.
            result &&
              'h-[calc(100dvh-2rem)] lg:h-[min(46rem,calc(100dvh-2rem))]',
          )}
        >
          <DialogHeader>
            <DialogTitle>
              {isFocusedShot ? 'AI opinion on this brew' : 'AI recommendation'}
            </DialogTitle>
            <DialogDescription className={cn(result && 'max-sm:sr-only')}>
              {isFocusedShot
                ? 'An assessment of this specific brew and a next-brew adjustment based on its beans, brewing method, exact gear, tasting result, and matching history.'
                : 'A next-brew adjustment based on the latest completed brew for these beans, its brewing method and exact gear setup, and matching history. Unsaved form values are not used.'}
            </DialogDescription>
          </DialogHeader>
          {result && request ? (
            <div data-slot="dialog-body" className="flex min-h-0 flex-col">
              <Tabs
                value={mobilePane}
                onValueChange={(value) =>
                  setMobilePane(value === 'chat' ? 'chat' : 'recommendation')
                }
                className="border-b border-border/70 px-5 py-3 sm:px-6 lg:hidden"
              >
                <TabsList className="h-11 w-full">
                  <TabsTrigger value="recommendation">
                    Recommendation
                  </TabsTrigger>
                  <TabsTrigger value="chat">Ask a follow-up</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-2 lg:divide-x lg:divide-border/70">
                <RecommendationChat
                  request={request}
                  recommendation={result.recommendation}
                  className={
                    mobilePane === 'chat' ? undefined : 'hidden lg:flex'
                  }
                />
                <ScrollArea
                  className={cn(
                    'min-h-0',
                    mobilePane === 'recommendation'
                      ? undefined
                      : 'hidden lg:block',
                  )}
                  viewportClassName="px-5 py-5 sm:px-6"
                >
                  <RecommendationResultView
                    result={result}
                    isFocusedShot={isFocusedShot}
                  />
                </ScrollArea>
              </div>
            </div>
          ) : (
            <DialogBody>
              {loading ? (
                <div
                  className="flex min-h-56 flex-col items-center justify-center gap-3 text-center"
                  aria-live="polite"
                >
                  <Loader2 className="size-7 animate-spin text-primary" />
                  <div>
                    <p className="font-medium">
                      {isFocusedShot
                        ? 'Analyzing this brew and its history…'
                        : 'Analyzing brew history…'}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Comparing settings, extraction, strength, and flavor
                      development.
                    </p>
                  </div>
                </div>
              ) : error ? (
                <div
                  className="flex min-h-56 flex-col items-center justify-center gap-4 text-center"
                  role="alert"
                >
                  <div>
                    <p className="font-medium">Recommendation unavailable</p>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">
                      {error}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void loadRecommendation()}
                  >
                    <RefreshCw />
                    Try again
                  </Button>
                </div>
              ) : null}
            </DialogBody>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Close
            </DialogClose>
            {result ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void loadRecommendation()}
              >
                <RefreshCw />
                Regenerate
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function RecommendationResultView({
  result,
  isFocusedShot,
}: {
  readonly result: RecommendationResult
  readonly isFocusedShot: boolean
}) {
  const formatDate = useDateFormatter()

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {DIAGNOSIS_LABELS[result.recommendation.diagnosis]}
        </Badge>
        <Badge variant="outline">
          {result.recommendation.confidence} confidence
        </Badge>
      </div>

      <section className="space-y-2">
        <h3 className="font-display text-lg font-bold">
          {result.recommendation.headline}
        </h3>
        <p className="leading-relaxed">
          <RichText text={result.recommendation.summary} />
        </p>
      </section>

      <section className="rounded-xl border border-border bg-muted/35 p-4">
        <h3 className="flex items-center gap-2 font-semibold">
          <History className="size-4 text-primary" />
          {isFocusedShot
            ? 'How this brew compares'
            : 'How this setup developed'}
        </h3>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          <RichText text={result.recommendation.historyInsight} />
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">Change for the next brew</h3>
        {result.recommendation.changes.length > 0 ? (
          <ol className="space-y-3">
            {result.recommendation.changes.map((change) => (
              <li key={change.parameter}>
                <ChangeBlock change={change} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-xl border border-positive/35 bg-positive/10 p-4 text-sm text-positive-text">
            No parameter change is recommended. Repeat{' '}
            {isFocusedShot ? 'this' : 'the latest'} brew as consistently as
            possible.
          </p>
        )}
      </section>

      {result.recommendation.keepConstant.length > 0 ? (
        <section className="space-y-2">
          <h3 className="font-semibold">Keep constant</h3>
          <ul className="space-y-2">
            {result.recommendation.keepConstant.map((item) => (
              <li key={item.parameter}>
                <KeepConstantBlock item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <NoteBlock text={result.recommendation.caveat} />

      <p className="text-xs text-muted-foreground">
        Based on {result.basis.historyIncluded} of{' '}
        {result.basis.matchingShotCount} matching brew
        {result.basis.matchingShotCount === 1 ? '' : 's'} for{' '}
        {result.basis.beanName} · {result.basis.brewingMethodName}
        {result.basis.gearNames.length > 0
          ? ` · ${result.basis.gearNames.join(', ')}`
          : ' · no gear recorded'}
        {result.basis.focusedShotAt
          ? ` · focused ${formatDate(result.basis.focusedShotAt)}`
          : result.basis.latestShotAt
            ? ` · latest ${formatDate(result.basis.latestShotAt)}`
            : ''}
        {result.basis.historyTruncated ? ' · recent history limit applied' : ''}
      </p>
    </div>
  )
}
