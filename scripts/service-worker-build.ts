import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const SOURCE_SERVICE_WORKER = 'public/sw.js'
export const BUILD_ID_PLACEHOLDER = '__BUILD_ID__'
export const PRECACHED_FILES = [
  'offline.html',
  'manifest.json',
  'logo192.png',
  'logo512.png',
  'logo-maskable-192.png',
  'logo-maskable-512.png',
  'apple-touch-icon.png',
  'favicon.ico',
]

export async function readServiceWorkerTemplate(): Promise<string> {
  return readFile(SOURCE_SERVICE_WORKER, 'utf8')
}

export async function createServiceWorkerBuildId(
  template: string,
): Promise<string> {
  const hash = createHash('sha256').update(template)
  for (const file of PRECACHED_FILES) {
    hash.update(file)
    hash.update(await readFile(join('public', file)))
  }
  return hash.digest('hex').slice(0, 12)
}

export function createServiceWorkerSource(
  template: string,
  buildId: string,
): string {
  return template.replaceAll(BUILD_ID_PLACEHOLDER, buildId)
}
