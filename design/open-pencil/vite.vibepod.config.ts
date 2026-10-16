// VibePod overlay: serves the editor behind the preview gateway and reaches the
// dev MCP companion through a same-origin /__mcp proxy, so the browser never
// needs the pod's loopback port or a second authenticated hostname.
//
// The dev server sends ~2,700 unbundled modules, which stalls behind the
// gateway, so this config builds a bundle in development mode (which keeps the
// MCP bridge, gated on import.meta.env.DEV) and serves it with `vite preview`.
import { createReadStream } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { extname, sep } from 'node:path'
import process from 'node:process'

import {
  type Connect,
  defineConfig,
  mergeConfig,
  type Plugin,
  type UserConfig,
} from 'vite'
import { openPencilAutomationPlugin } from './vite/automation'
import base from './vite.config'

const publicOrigin = process.env.OPENPENCIL_DEV_ORIGIN
const mcpPort = process.env.OPENPENCIL_DEV_MCP_PORT ?? '7600'
const filesRoot = process.env.OPENPENCIL_FILES_ROOT
if (!publicOrigin)
  throw new Error('OPENPENCIL_DEV_ORIGIN must be the public editor origin')

// In a browser, MCP open_file fetches the file's absolute path from this origin.
// Serve read-only design files under OPENPENCIL_FILES_ROOT at those paths.
function designFiles(root: string): Plugin {
  async function install(middlewares: Connect.Server) {
    const realRoot = await realpath(root)
    // Each editor load re-sends its MCP settings; an empty root means this one.
    middlewares.use(
      '/__openpencil/mcp/restart',
      async (request, _response, next) => {
        const chunks: Buffer[] = []
        for await (const chunk of request) chunks.push(Buffer.from(chunk))
        let body = Buffer.concat(chunks)
        let parsed: unknown = null
        try {
          parsed = JSON.parse(body.toString('utf8'))
        } catch {
          // Malformed bodies pass through; the automation plugin rejects them.
        }
        if (
          parsed &&
          typeof parsed === 'object' &&
          Reflect.get(parsed, 'rootDirectory') === ''
        ) {
          body = Buffer.from(
            JSON.stringify({ ...parsed, rootDirectory: realRoot }),
          )
        }
        Object.assign(request, {
          [Symbol.asyncIterator]: async function* () {
            yield body
          },
        })
        next()
      },
    )
    middlewares.use(async (request, response, next) => {
      const path = decodeURIComponent(
        new URL(request.url ?? '/', 'http://x').pathname,
      )
      if (request.method !== 'GET' || !['.fig', '.pen'].includes(extname(path)))
        return next()
      const real = await realpath(path).catch(() => null)
      if (!real?.startsWith(realRoot + sep)) return next()
      response.setHeader('content-type', 'application/octet-stream')
      createReadStream(real).pipe(response)
    })
  }
  return {
    name: 'vibepod-design-files',
    // Before the automation plugin, so its restart handler sees the patched body.
    enforce: 'pre',
    configureServer: (server) => install(server.middlewares),
    configurePreviewServer: (server) => install(server.middlewares),
  }
}

// The base config only starts the MCP companion for `vite` (serve); start it
// for `vite preview` too, with the dev token the bundle embeds.
function previewAutomation(): Plugin {
  const plugin = openPencilAutomationPlugin('serve', undefined)
  const configureServer = plugin.configureServer as (server: unknown) => unknown
  return {
    name: 'vibepod-preview-automation',
    configurePreviewServer: (server) => configureServer(server),
  }
}

const gateway = {
  allowedHosts: [new URL(publicOrigin).hostname],
  proxy: {
    '/__mcp': {
      target: `http://127.0.0.1:${mcpPort}`,
      ws: true,
      rewrite: (path: string) => path.replace(/^\/__mcp/, '') || '/',
    },
  },
}

export default defineConfig(async (env) => {
  const resolved = typeof base === 'function' ? await base(env) : await base
  return mergeConfig(resolved as UserConfig, {
    // Relative, so it follows whichever origin served the page (WebSocket accepts
    // relative http(s) URLs since Chrome 125, Firefox 124, and Safari 17.3).
    define: {
      __OPENPENCIL_LOCAL_AUTOMATION_TOKEN__: JSON.stringify(
        process.env.OPENPENCIL_DEV_TOKEN,
      ),
      __OPENPENCIL_LOCAL_AUTOMATION_URL__: JSON.stringify('/__mcp'),
      __OPENPENCIL_LOCAL_AUTOMATION_HTTP_URL__: JSON.stringify('/__mcp'),
    },
    plugins: [
      ...(filesRoot ? [designFiles(filesRoot)] : []),
      previewAutomation(),
    ],
    server: gateway,
    preview: gateway,
  })
})
