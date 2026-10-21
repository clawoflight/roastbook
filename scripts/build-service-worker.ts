import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const SOURCE_SERVICE_WORKER = 'public/sw.js'
const PRECACHED_FILES = [
  'offline.html',
  'manifest.json',
  'logo192.png',
  'logo512.png',
  'logo-maskable-192.png',
  'logo-maskable-512.png',
  'apple-touch-icon.png',
  'favicon.ico',
]
const STATIC_OUTPUT_DIRS = ['.output/public', '.vercel/output/static']

const template = await readFile(SOURCE_SERVICE_WORKER, 'utf8')
if (!template.includes('__BUILD_ID__')) {
  throw new Error(
    `${SOURCE_SERVICE_WORKER} is missing the __BUILD_ID__ placeholder`,
  )
}

const hash = createHash('sha256').update(template)
for (const file of PRECACHED_FILES) {
  hash.update(file)
  hash.update(await readFile(join('public', file)))
}
const buildId = hash.digest('hex').slice(0, 12)
const serviceWorker = template.replaceAll('__BUILD_ID__', buildId)

const outputDirs = STATIC_OUTPUT_DIRS.filter((directory) =>
  existsSync(directory),
)
if (outputDirs.length === 0) {
  throw new Error(
    `No static output directory found (${STATIC_OUTPUT_DIRS.join(', ')}). Run vite build first.`,
  )
}

for (const directory of outputDirs) {
  const target = join(directory, 'sw.js')
  await writeFile(target, serviceWorker)
  console.log(`Generated ${target} (build ${buildId})`)
}
