import { Loader2, MessageCircle, RefreshCw, Send } from 'lucide-react'
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage } from '@/lib/error-message'
import { chatAboutShotRecommendation } from '@/lib/server/shot-recommendations'
import type {
  ShotRecommendation,
  ShotRecommendationRequest,
} from '@/lib/shot-recommendation'
import {
  SHOT_RECOMMENDATION_CHAT_MAX_MESSAGES,
  SHOT_RECOMMENDATION_CHAT_MAX_QUESTION_LENGTH,
  type ShotRecommendationChatMessage,
} from '@/lib/shot-recommendation-chat'
import { cn } from '@/lib/utils'

const SUGGESTED_QUESTIONS = [
  'Could I change the grind setting instead?',
  'Why this change and not another one?',
  'How big should the step be?',
] as const

/**
 * Follow-up questions about one recommendation. The conversation lives only in
 * this component's state, so regenerating the recommendation or closing the
 * dialog starts it over.
 */
export function RecommendationChat({
  request,
  recommendation,
  className,
}: {
  readonly request: ShotRecommendationRequest
  readonly recommendation: ShotRecommendation
  readonly className?: string
}) {
  const [messages, setMessages] = useState<
    ReadonlyArray<ShotRecommendationChatMessage>
  >([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const limitReached = messages.length >= SHOT_RECOMMENDATION_CHAT_MAX_MESSAGES

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the thread or its status changes
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, pending, error])

  const ask = async (thread: ReadonlyArray<ShotRecommendationChatMessage>) => {
    setMessages(thread)
    setPending(true)
    setError(null)
    try {
      const { reply } = await chatAboutShotRecommendation({
        data: { request, recommendation, messages: [...thread] },
      })
      setMessages([...thread, { role: 'assistant', content: reply }])
    } catch (caught) {
      setError(getErrorMessage(caught, 'Could not get an answer'))
    } finally {
      setPending(false)
    }
  }

  const send = (question: string) => {
    const content = question.trim()
    if (!content || pending || limitReached) return
    setDraft('')
    void ask([...messages, { role: 'user', content }])
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    send(draft)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return
    event.preventDefault()
    send(draft)
  }

  return (
    <section
      aria-labelledby="recommendation-chat-title"
      className={cn('flex min-h-0 flex-col', className)}
    >
      <div className="border-b border-border/70 px-5 py-3 sm:px-6">
        <h3
          id="recommendation-chat-title"
          className="flex items-center gap-2 font-semibold"
        >
          <MessageCircle aria-hidden className="size-4 text-primary" />
          Ask a follow-up
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Not saved — the conversation ends when you close this window or
          regenerate.
        </p>
      </div>

      <ScrollArea
        className="min-h-0 flex-1"
        viewportClassName="px-5 py-4 sm:px-6"
      >
        <div role="log" aria-live="polite" className="space-y-3">
          {messages.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Ask about the reasoning, another setting you could change, or
                how to test the suggestion.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <Button
                    key={question}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-11 whitespace-normal py-1.5 text-left font-normal"
                    disabled={pending}
                    onClick={() => send(question)}
                  >
                    {question}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          {messages.map((message, index) => (
            <div
              // The thread is append-only, so the position is a stable key.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              key={index}
              className={cn(
                'max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                message.role === 'user'
                  ? 'ml-auto bg-primary/12 text-foreground'
                  : 'mr-auto bg-muted',
              )}
            >
              <span className="sr-only">
                {message.role === 'user' ? 'You: ' : 'Assistant: '}
              </span>
              {message.content}
            </div>
          ))}
          {pending ? (
            <div className="mr-auto flex items-center gap-2 rounded-2xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              Thinking…
            </div>
          ) : null}
          {error ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/35 bg-destructive/10 p-3 text-sm"
            >
              <p className="min-w-0 flex-1">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void ask(messages)}
              >
                <RefreshCw />
                Try again
              </Button>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <form
        onSubmit={onSubmit}
        className="flex items-end gap-2 border-t border-border/70 bg-muted/35 px-5 py-3 sm:px-6"
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={SHOT_RECOMMENDATION_CHAT_MAX_QUESTION_LENGTH}
          rows={1}
          aria-label="Your question about this recommendation"
          placeholder={
            limitReached ? 'Conversation limit reached' : 'Ask a question…'
          }
          disabled={limitReached}
          className="max-h-32 min-h-11 flex-1 resize-none"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send question"
          disabled={pending || limitReached || draft.trim().length === 0}
        >
          <Send />
        </Button>
      </form>
      {limitReached ? (
        <p className="border-t border-border/70 bg-muted/35 px-5 pb-3 text-xs text-muted-foreground sm:px-6">
          This conversation is full. Regenerate the recommendation to start a
          new one.
        </p>
      ) : null}
    </section>
  )
}
