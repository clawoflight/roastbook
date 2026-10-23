import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

const env = createEnv({
  clientPrefix: 'VITE_',
  client: {
    VITE_HEAD_HTML: z.string().trim().optional(),
    VITE_UMAMI_SCRIPT_URL: z
      .string()
      .url()
      .default('https://analytics.k8s.lohr.dev/umami'),
    VITE_UMAMI_WEBSITE_ID: z
      .string()
      .uuid()
      .default('ee879bad-67b3-46d2-80c5-9f35fa262f0d'),
    VITE_STORAGE_URL: z
      .string()
      .trim()
      .transform((value) => value || '/media')
      .default('/media'),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
})

export const publicEnv = {
  VITE_HEAD_HTML: env.VITE_HEAD_HTML,
  VITE_UMAMI_SCRIPT_URL: env.VITE_UMAMI_SCRIPT_URL,
  VITE_UMAMI_WEBSITE_ID: env.VITE_UMAMI_WEBSITE_ID,
  VITE_STORAGE_URL: env.VITE_STORAGE_URL,
} as const
