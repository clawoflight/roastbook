import { z } from 'zod'
import {
  buildShotRecommendationPrompt,
  recommendationChangeSchema,
  recommendationKeepConstantSchema,
  type ShotRecommendationContext,
  shotRecommendationParameterSchema,
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

const answerBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string().trim().min(1).max(1_200),
  }),
  recommendationChangeSchema.extend({ type: z.literal('change') }),
  recommendationKeepConstantSchema.extend({ type: z.literal('keep') }),
  z.object({
    type: z.literal('note'),
    text: z.string().trim().min(1).max(400),
  }),
])

/**
 * A chat answer is a short list of blocks. Plain text carries most answers; the
 * other blocks reuse the recommendation's own change, keep-constant, and caveat
 * presentation so a concrete suggestion stands out from the prose.
 */
export const shotRecommendationAnswerSchema = z.object({
  blocks: z.array(answerBlockSchema).min(1).max(6),
})

/**
 * What the model is asked to return. OpenAI structured outputs reject the
 * `oneOf` a discriminated union compiles to, so a block is one flat object
 * whose unused fields are null; `parseShotRecommendationAnswer` turns it into
 * the typed union.
 */
export const shotRecommendationAnswerWireSchema = z.object({
  blocks: z
    .array(
      z.object({
        type: z.enum(['text', 'change', 'keep', 'note']),
        text: z.string().nullable(),
        parameter: shotRecommendationParameterSchema.nullable(),
        currentValue: z.string().nullable(),
        recommendedValue: z.string().nullable(),
        reason: z.string().nullable(),
      }),
    )
    .max(6),
})

/** Keeps the well-formed blocks of a model answer; throws when none survive. */
export function parseShotRecommendationAnswer(
  wire: z.infer<typeof shotRecommendationAnswerWireSchema>,
) {
  const blocks = wire.blocks.flatMap((block) => {
    const parsed = answerBlockSchema.safeParse(
      Object.fromEntries(
        Object.entries(block).filter(([, value]) => value !== null),
      ),
    )
    return parsed.success ? [parsed.data] : []
  })
  return shotRecommendationAnswerSchema.parse({ blocks })
}

export type ShotRecommendationAnswer = z.infer<
  typeof shotRecommendationAnswerSchema
>

/** The conversation history the model sees for an earlier structured answer. */
export function shotRecommendationAnswerToText(
  answer: ShotRecommendationAnswer,
) {
  return answer.blocks
    .map((block) => {
      switch (block.type) {
        case 'text':
          return block.text
        case 'change':
          return `Change [[${block.parameter}]] from ${block.currentValue} to ${block.recommendedValue}: ${block.reason}`
        case 'keep':
          return `Keep [[${block.parameter}]] at ${block.currentValue}: ${block.reason}`
        default:
          return `Note: ${block.text}`
      }
    })
    .join('\n\n')
}

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

- Answer the user's question directly and briefly. Lead with the answer.
- Ground claims about the user's brews in the supplied evidence and say so when the evidence cannot answer the question. Keep observations and general coffee knowledge clearly apart.
- Questions about other adjustments, such as the grind setting, are welcome even when the recommendation did not change them: explain the likely effect and the trade-off against the recommended change, and prefer testing one variable at a time.
- Keep every rule from the original instructions about grinder scales and limits, recording errors, and never changing the bean, brewing method, or gear.
- Do not repeat the whole recommendation; refer back to it only where it helps.

Return the answer as blocks in reading order, in plain text without markdown. Every block has a type and all of text, parameter, currentValue, recommendedValue, and reason; set the fields a block does not use to null. The block types are:
- text (uses text): a short paragraph. Most of an answer is text blocks. When a paragraph mentions one of the parameters, write it as [[parameterKey]] with the exact key (for example [[grindSetting]]); it is rendered as a labelled chip. Never use markers elsewhere.
- change (uses parameter, currentValue, recommendedValue, reason): only when you propose a concrete new value for one enabled parameter for the next brew. Same fields as a recommendation change. Do not use it for general explanations or for the change the recommendation already shows.
- keep (uses parameter, currentValue, reason): only when you explicitly advise leaving one parameter at its current value.
- note (uses text): at most one short caveat or warning that the user should not miss.
Use one to four blocks and avoid a block type when plain text says it as clearly.`

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
