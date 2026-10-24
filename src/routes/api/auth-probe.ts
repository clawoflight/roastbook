import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/auth-probe')({
  server: {
    handlers: {
      GET: async () =>
        new Response(null, {
          status: 204,
          headers: { 'Cache-Control': 'no-store' },
        }),
    },
  },
})
