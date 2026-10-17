import { describe, expect, test } from 'bun:test'
import type { ShotRecommendation } from '@/lib/shot-recommendation'
import {
  buildShotRecommendationChatMessages,
  SHOT_RECOMMENDATION_CHAT_MAX_MESSAGES,
  shotRecommendationChatRequestSchema,
} from '@/lib/shot-recommendation-chat'

const recommendation: ShotRecommendation = {
  diagnosis: 'balanced',
  confidence: 'medium',
  headline: 'Keep it as is',
  summary: 'Recent brews are well balanced.',
  historyInsight: 'Ratings improved after the finer grind.',
  changes: [],
  keepConstant: [],
  caveat: 'Only three rated brews.',
}

const context = {
  bean: { name: 'Test bean' },
  brewingMethod: { name: 'Espresso' },
  exactGear: {},
  enabledParameters: ['grindSetting'],
  matchingShotCount: 1,
  historyIncluded: 1,
  historyTruncated: false,
  shotsOldestToNewest: [{ id: 1 }],
}

const question = { role: 'user', content: 'Could I grind finer instead?' }

describe('recommendation follow-up chat', () => {
  test('accepts a conversation that ends with a question', () => {
    const parsed = shotRecommendationChatRequestSchema.parse({
      request: { shotId: 7 },
      recommendation,
      messages: [
        question,
        { role: 'assistant', content: 'Possibly.' },
        { role: 'user', content: '  By how much?  ' },
      ],
    })

    expect(parsed.messages.at(-1)?.content).toBe('By how much?')
  })

  test('rejects an empty thread, a trailing answer, and an overlong thread', () => {
    const base = { request: { shotId: 7 }, recommendation }
    const answer = { role: 'assistant', content: 'Possibly.' }

    expect(
      shotRecommendationChatRequestSchema.safeParse({ ...base, messages: [] })
        .success,
    ).toBe(false)
    expect(
      shotRecommendationChatRequestSchema.safeParse({
        ...base,
        messages: [question, answer],
      }).success,
    ).toBe(false)
    expect(
      shotRecommendationChatRequestSchema.safeParse({
        ...base,
        messages: Array.from(
          { length: SHOT_RECOMMENDATION_CHAT_MAX_MESSAGES + 1 },
          (_, index) => (index % 2 === 0 ? question : answer),
        ),
      }).success,
    ).toBe(false)
  })

  test('grounds the conversation in the evidence and the given recommendation', () => {
    const { systemPrompts, messages } = buildShotRecommendationChatMessages(
      context,
      recommendation,
      [{ role: 'user', content: question.content }],
    )

    expect(systemPrompts).toHaveLength(1)
    expect(messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
    ])
    expect(messages[0]?.content).toContain('"name": "Test bean"')
    expect(messages[1]?.content).toBe(JSON.stringify(recommendation))
    expect(messages[2]?.content).toBe(question.content)
  })
})
