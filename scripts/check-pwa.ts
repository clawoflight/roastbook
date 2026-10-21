import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { z } from 'zod'
import {
  BUILD_ID_PLACEHOLDER,
  createServiceWorkerBuildId,
  PRECACHED_FILES,
  readServiceWorkerTemplate,
} from './service-worker-build'

const DEFAULT_OUTPUT_DIR = '.output/public'
const REQUIRED_ICON_SIZES = ['192x192', '512x512'] as const
const REQUIRED_ICON_PURPOSES = ['any', 'maskable'] as const
const REQUIRED_BUILD_FILES = ['sw.js', ...PRECACHED_FILES]
const MAX_SERVICE_WORKER_BYTES = 20 * 1024
const ICON_PURPOSES = new Set(['any', 'maskable', 'monochrome'])

const iconPurposeSchema = z.string().refine(
  (value) => {
    const tokens = value.trim().split(/\s+/)
    return (
      tokens.length > 0 && tokens.every((token) => ICON_PURPOSES.has(token))
    )
  },
  { message: 'purpose must contain any, maskable, or monochrome tokens' },
)

const iconSchema = z.object({
  src: z.string().regex(/^\//),
  sizes: z.string().regex(/^\d+x\d+$/),
  type: z.literal('image/png'),
  purpose: iconPurposeSchema,
})

const manifestSchema = z.object({
  id: z.string().regex(/^\//),
  name: z.string().min(1),
  short_name: z.string().min(1),
  description: z.string().min(1),
  lang: z.string().min(1),
  start_url: z.string().regex(/^\//),
  scope: z.string().regex(/^\//),
  display: z.literal('standalone'),
  background_color: z.string().regex(/^#[0-9a-f]{6}$/i),
  theme_color: z.string().regex(/^#[0-9a-f]{6}$/i),
  icons: z.array(iconSchema).min(2),
})

type Manifest = z.infer<typeof manifestSchema>
type ManifestIcon = z.infer<typeof iconSchema>

const failures: string[] = []

function record(condition: boolean, message: string) {
  if (!condition) failures.push(message)
}

function parseIconSize(
  sizes: string,
): { width: number; height: number } | null {
  const match = /^(\d+)x(\d+)$/.exec(sizes)
  if (!match) return null
  const [, widthText, heightText] = match
  if (!widthText || !heightText) return null
  return { width: Number(widthText), height: Number(heightText) }
}

function hasIconPurpose(icon: ManifestIcon, purpose: string): boolean {
  return icon.purpose.trim().split(/\s+/).includes(purpose)
}

const manifestText = await readFile('public/manifest.json', 'utf8')
const manifest: Manifest = manifestSchema.parse(JSON.parse(manifestText))

record(
  manifest.start_url === '/overview',
  'public/manifest.json must start at /overview',
)
record(manifest.scope === '/', 'public/manifest.json must scope the root URL')
record(manifest.id === '/', 'public/manifest.json must use / as its identity')

for (const purpose of REQUIRED_ICON_PURPOSES) {
  for (const sizes of REQUIRED_ICON_SIZES) {
    record(
      manifest.icons.some(
        (icon) => hasIconPurpose(icon, purpose) && icon.sizes === sizes,
      ),
      `public/manifest.json is missing a ${sizes} ${purpose} icon`,
    )
  }
}

for (const icon of manifest.icons) {
  const iconPath = join('public', icon.src.slice(1))
  if (!existsSync(iconPath)) {
    failures.push(`${iconPath} does not exist`)
    continue
  }

  const dimensions = parseIconSize(icon.sizes)
  if (!dimensions) {
    failures.push(`Cannot parse ${icon.sizes} for ${icon.src}`)
    continue
  }

  const metadata = await sharp(iconPath).metadata()
  record(
    metadata.format === 'png',
    `${iconPath} is ${metadata.format}, expected png`,
  )
  record(
    metadata.width === dimensions.width &&
      metadata.height === dimensions.height,
    `${iconPath} is ${metadata.width}x${metadata.height}, expected ${icon.sizes}`,
  )
}

const offlinePath = 'public/offline.html'
if (!existsSync(offlinePath)) {
  failures.push(`${offlinePath} does not exist`)
} else {
  const offlinePage = await readFile(offlinePath, 'utf8')
  record(
    offlinePage.includes('<title>Offline | Roastbook</title>'),
    `${offlinePath} must have the Roastbook offline title`,
  )
  record(
    !/(?:https?:)?\/\//i.test(offlinePage),
    `${offlinePath} must not depend on external or protocol-relative URLs`,
  )
}

const serviceWorkerPath = 'public/sw.js'
let serviceWorkerTemplate: string | null = null
if (!existsSync(serviceWorkerPath)) {
  failures.push(`${serviceWorkerPath} does not exist`)
} else {
  serviceWorkerTemplate = await readServiceWorkerTemplate()

  for (const marker of [
    BUILD_ID_PLACEHOLDER,
    "const OFFLINE_URL = '/offline.html'",
    "request.mode === 'navigate'",
    "const ASSET_CACHE = 'roastbook-assets'",
    "if (request.method !== 'GET') return",
    'if (url.origin !== self.location.origin) return',
    'if (isExcludedPath(url.pathname)) return',
    "if (url.pathname.startsWith('/assets/'))",
    "new Set(['/sw.js'])",
    '/api/',
    '/_serverFn/',
    '/_gate/',
    '/media/',
    'PRECACHE_PATHS.has(url.pathname)',
    'async function cacheFirstPrecache(request)',
    'cache.match(request, { ignoreSearch: true })',
    'await Promise.all(',
  ]) {
    record(
      serviceWorkerTemplate.includes(marker),
      `${serviceWorkerPath} is missing ${marker}`,
    )
  }

  record(
    !serviceWorkerTemplate.includes('allSettled'),
    `${serviceWorkerPath} must fail installation when a precache request fails`,
  )

  for (const file of PRECACHED_FILES) {
    record(
      serviceWorkerTemplate.includes(`'/${file}'`),
      `${serviceWorkerPath} is missing the /${file} precache entry`,
    )
  }
}

const expectedBuildId = serviceWorkerTemplate
  ? await createServiceWorkerBuildId(serviceWorkerTemplate)
  : null

const outputDirs = process.argv.slice(2)
if (outputDirs.length === 0) outputDirs.push(DEFAULT_OUTPUT_DIR)

for (const directory of outputDirs) {
  if (!existsSync(directory)) {
    failures.push(
      `${directory} does not exist. Run the matching build before checking it.`,
    )
    continue
  }

  for (const file of [
    ...REQUIRED_BUILD_FILES,
    ...manifest.icons.map((icon) => icon.src.slice(1)),
  ]) {
    record(existsSync(join(directory, file)), `${directory}/${file} is missing`)
  }

  const builtManifestPath = join(directory, 'manifest.json')
  if (existsSync(builtManifestPath)) {
    record(
      (await readFile(builtManifestPath, 'utf8')) === manifestText,
      `${builtManifestPath} does not match public/manifest.json`,
    )
  }

  const builtServiceWorkerPath = join(directory, 'sw.js')
  if (existsSync(builtServiceWorkerPath)) {
    const builtServiceWorker = await readFile(builtServiceWorkerPath, 'utf8')
    record(
      !builtServiceWorker.includes(BUILD_ID_PLACEHOLDER),
      `${builtServiceWorkerPath} still contains the build placeholder`,
    )
    if (expectedBuildId) {
      record(
        builtServiceWorker.includes(`const BUILD_ID = '${expectedBuildId}'`),
        `${builtServiceWorkerPath} does not match the expected build ID ${expectedBuildId}`,
      )
    }
    record(
      Buffer.byteLength(builtServiceWorker) <= MAX_SERVICE_WORKER_BYTES,
      `${builtServiceWorkerPath} exceeds ${MAX_SERVICE_WORKER_BYTES} bytes`,
    )
  }
}

if (failures.length > 0) {
  throw new Error(`PWA verification failed:\n${failures.join('\n')}`)
}

console.log(
  `PWA assets verified (${manifest.icons.length} icons, ${outputDirs.length} build output(s))`,
)
