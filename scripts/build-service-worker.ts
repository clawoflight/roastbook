import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  BUILD_ID_PLACEHOLDER,
  createServiceWorkerBuildId,
  createServiceWorkerSource,
  readServiceWorkerTemplate,
} from './service-worker-build'

const outputDirs = process.argv.slice(2)
if (outputDirs.length === 0) {
  throw new Error(
    'Usage: bun run scripts/build-service-worker.ts <static-output-dir> [...]',
  )
}

const template = await readServiceWorkerTemplate()
if (!template.includes(BUILD_ID_PLACEHOLDER)) {
  throw new Error(
    `public/sw.js is missing the ${BUILD_ID_PLACEHOLDER} placeholder`,
  )
}

const buildId = await createServiceWorkerBuildId(template)
const serviceWorker = createServiceWorkerSource(template, buildId)

for (const directory of outputDirs) {
  if (!existsSync(directory)) {
    throw new Error(`Static output directory does not exist: ${directory}`)
  }

  const target = join(directory, 'sw.js')
  await writeFile(target, serviceWorker)
  console.log(`Generated ${target} (build ${buildId})`)
}
