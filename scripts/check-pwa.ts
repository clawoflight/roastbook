import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { z } from 'zod'

const STATIC_OUTPUT_DIRS = ['.output/public', '.vercel/output/static']
const REQUIRED_ICON_SIZES = ['192x192', '512x512'] as const
const REQUIRED_ICON_PURPOSES = ['any', 'maskable'] as const
const REQUIRED_BUILD_FILES = [
  'manifest.json',
  'sw.js',
  'offline.html',
  'apple-touch-icon.png',
  'favicon.ico',
]
const MAX_SERVICE_WORKER_BYTES = 20 * 1024

const iconSchema = z.object({
  src: z.string().regex(/^\//),
  sizes: z.string().regex(/^\d+x\d+$/),
  type: z.literal('image/png'),
  purpose: z.enum(['any', 'maskable', 'monochrome']),
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
        (icon) => icon.purpose === purpose && icon.sizes === sizes,
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
    !/https?:\/\//.test(offlinePage),
    `${offlinePath} must not depend on external URLs`,
  )
}

const serviceWorkerPath = 'public/sw.js'
if (!existsSync(serviceWorkerPath)) {
  failures.push(`${serviceWorkerPath} does not exist`)
} else {
  const serviceWorker = await readFile(serviceWorkerPath, 'utf8')
  for (const marker of [
    '__BUILD_ID__',
    "const OFFLINE_URL = '/offline.html'",
    "request.mode === 'navigate'",
    "const ASSET_CACHE = 'roastbook-assets'",
  ]) {
    record(
      serviceWorker.includes(marker),
      `${serviceWorkerPath} is missing ${marker}`,
    )
  }
}

const outputDirs = STATIC_OUTPUT_DIRS.filter((directory) =>
  existsSync(directory),
)
if (outputDirs.length === 0) {
  failures.push('No built static output found. Run bun run build first.')
}

for (const directory of outputDirs) {
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
      !builtServiceWorker.includes('__BUILD_ID__'),
      `${builtServiceWorkerPath} still contains the build placeholder`,
    )
    record(
      /^const BUILD_ID = '[0-9a-f]{12}'$/m.test(builtServiceWorker),
      `${builtServiceWorkerPath} does not contain a generated build ID`,
    )
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
