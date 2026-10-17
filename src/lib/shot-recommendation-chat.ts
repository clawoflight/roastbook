import { z } from 'zod'
import {
  buildShotRecommendationPrompt,
  type ShotRecommendationContext,
  shotRecommendationRequestSchema,
  shotRecommendationSchema,
} from '@/lib/shot-recommendation'

export const SHOT_RECOMMENDATION_CHAT_MAX_MESSAGES = 20
export const SHOT_RECOMMENDATION_CHAT_MAX_QUESTION_LENGTH = 1_000

const shotRecommendationChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4_000),
})

export type ShotRecommendationChatMessage = z.infer<
  typeof shotRecommendationChatMessageSchema
>

export const shotRecommendationChatRequestSchema = z.object({
  request: shotRecommendationRequestSchema,
  recommendation: shotRecommendationSchema,
  messages: z
    .array(shotRecommendationChatMessageSchema)
    .min(1)
    .max(SHOT_RECOMMENDATION_CHAT_MAX_MESSAGES)
    .refine((messages) => messages.at(-1)?.role === 'user', {
      message: 'The last chat message must be a question',
    }),
})

const CHAT_SYSTEM_PROMPT = `You are a precise coffee dialing assistant answering follow-up questions about a recommendation you already gave. The first message holds the exact filtered evidence and the original instructions; the second is the recommendation you returned.

- Answer the user's question directly in a few short paragraphs of plain text, without markdown headings or tables. Lead with the answer.
- Ground claims about the user's brews in the supplied evidence and say so when the evidence cannot answer the question. Keep observations and general coffee knowledge clearly apart.
- Questions about other adjustments, such as the grind setting, are welcome even when the recommendation did not change them: explain the likely effect and the trade-off against the recommended change, and prefer testing one variable at a time.
- Keep every rule from the original instructions about grinder scales and limits, recording errors, and never changing the bean, brewing method, or gear.
- Do not repeat the whole recommendation; refer back to it only where it helps.`

export function buildShotRecommendationChatMessages(
  context: ShotRecommendationContext,
  recommendation: z.infer<typeof shotRecommendationSchema>,
  conversation: readonly ShotRecommendationChatMessage[],
) {
  return {
    systemPrompts: [CHAT_SYSTEM_PROMPT],
    messages: [
      {
        role: 'user' as const,
        content: buildShotRecommendationPrompt(context),
      },
      {
        role: 'assistant' as const,
        content: JSON.stringify(recommendation),
      },
      ...conversation,
    ],
  }
}
