import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const require = createRequire(resolve(root, '../design/package.json'))
const { chromium } = require('playwright-core')
const base = process.env.ROASTBOOK_URL
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
  throw new Error('ROASTBOOK_URL must point to the isolated local campaign app')
}
const output = resolve(root, 'assets/captures')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const diagnostics = []
const metadataPath = resolve(output, 'provenance.json')
const metadata = JSON.parse(
  await readFile(metadataPath, 'utf8').catch(() => '{}'),
)
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim()

async function ready(page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      Array.from(document.images, (image) => image.decode().catch(() => {})),
    )
  })
  await page.waitForTimeout(600)
}

async function save(page, id, target = page, evidence = {}) {
  await ready(page)
  const bytes = await target.screenshot({ animations: 'disabled' })
  await writeFile(resolve(output, `${id}.png`), bytes)
  metadata[id] = {
    path: new URL(page.url()).pathname + new URL(page.url()).search,
    framing: target === page ? 'viewport' : 'focused element',
    viewport: page.viewportSize(),
    source: 'canonical demo fixtures in isolated PostgreSQL',
    capturedAt: new Date().toISOString(),
    revision,
    ...evidence,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    text: await page.locator('body').innerText(),
  }
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
  console.log(`Captured ${id}`)
}

try {
  const recipes = JSON.parse(
    await readFile(resolve(root, 'captures.json'), 'utf8'),
  )
  const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7)
  if (only && !recipes.some((recipe) => recipe.id === only))
    throw new Error(`Unknown capture recipe: ${only}`)
  for (const recipe of recipes.filter(
    (recipe) => !only || recipe.id === only,
  )) {
    const context = await browser.newContext({
      viewport: { width: recipe.width, height: recipe.height },
      deviceScaleFactor: 2,
      colorScheme: 'light',
      locale: 'en-GB',
      timezoneId: 'UTC',
      reducedMotion: 'reduce',
      isMobile: recipe.width < 600,
      hasTouch: recipe.width < 600,
    })
    const page = await context.newPage()
    page.on('pageerror', (error) =>
      diagnostics.push(`${recipe.id}: ${error.message}`),
    )
    page.on('response', (response) => {
      if (response.status() >= 400)
        diagnostics.push(
          `${recipe.id}: HTTP ${response.status()} ${response.url()}`,
        )
    })
    page.on('requestfailed', (request) => {
      if (request.failure()?.errorText !== 'net::ERR_ABORTED')
        diagnostics.push(
          `${recipe.id}: ${request.url()} ${request.failure()?.errorText}`,
        )
    })
    await page.goto(new URL(recipe.path, base).href, {
      waitUntil: 'networkidle',
    })
    await page.getByRole('main').waitFor()
    if (recipe.heading)
      await page
        .getByRole('heading', { name: recipe.heading, exact: true })
        .waitFor()
    if (recipe.waitSelector)
      await page.locator(recipe.waitSelector).first().waitFor()
    if (recipe.scrollTo)
      await page
        .getByRole('heading', { name: recipe.scrollTo, exact: true })
        .scrollIntoViewIfNeeded()
    const target = recipe.focus
      ? page.locator('[data-slot="card"]').filter({
          has: page.getByRole('heading', { name: recipe.focus, exact: true }),
        })
      : page
    if (recipe.map) {
      const map = page.getByRole('region', {
        name: 'Map of your saved cafés',
        exact: true,
      })
      const card = map.locator('../../..')
      await card.scrollIntoViewIfNeeded()
      const visibleCafes = () =>
        map.locator('button[aria-label*="café:"]').evaluateAll((markers) =>
          markers
            .filter((marker) => {
              if (marker.hidden) return false
              const rect = marker.getBoundingClientRect()
              const bounds = marker.closest('section').getBoundingClientRect()
              return (
                rect.left >= bounds.left &&
                rect.right <= bounds.right &&
                rect.top >= bounds.top &&
                rect.bottom <= bounds.bottom &&
                marker.contains(
                  document.elementFromPoint(
                    rect.x + rect.width / 2,
                    rect.y + rect.height / 2,
                  ),
                )
              )
            })
            .map((marker) => marker.getAttribute('aria-label')),
        )
      const showCafes = async () => {
        for (let attempt = 0; attempt < 4; attempt++) {
          await ready(page)
          const names = await visibleCafes()
          if (names.length >= recipe.map.minimumMarkers) return names
          await page
            .getByRole('button', { name: 'Zoom out', exact: true })
            .click()
          await page.waitForLoadState('networkidle')
        }
        throw new Error('Map does not show enough unobscured café markers')
      }
      const overview = await showCafes()
      await save(page, `${recipe.id}-overview`, card, {
        visibleCafes: overview,
      })
      await map
        .getByRole('button', { name: recipe.map.select, exact: true })
        .click()
      await page.locator('#visits-map-place-inspector').waitFor()
      await card.scrollIntoViewIfNeeded()
      const selected = await showCafes()
      if ((await map.locator('button[aria-pressed="true"]').count()) !== 1)
        throw new Error('Expected exactly one selected café')
      await save(page, recipe.id, card, {
        visibleCafes: selected,
        selectedCafe: recipe.map.select,
      })
    } else {
      await save(page, recipe.id, target)
    }
    await context.close()
  }
  if (process.argv.includes('--scan')) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      colorScheme: 'light',
      locale: 'en-GB',
      timezoneId: 'UTC',
    })
    const page = await context.newPage()
    await page.goto(new URL('/beans/new', base).href, {
      waitUntil: 'networkidle',
    })
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(resolve(root, 'assets/sample-label.jpg'))
    const extract = page.getByRole('button', {
      name: 'Extract details with AI',
      exact: true,
    })
    await extract.waitFor()
    await save(page, 'scan-before')
    await extract.click()
    await page
      .getByRole('heading', { name: 'Review extracted info', exact: true })
      .waitFor({ timeout: 120000 })
    await page.setViewportSize({ width: 768, height: 1000 })
    await save(page, 'scan-result', page.getByRole('dialog'))
    await context.close()
  }
  await writeFile(
    resolve(output, 'diagnostics.json'),
    `${JSON.stringify(diagnostics, null, 2)}\n`,
  )
  if (diagnostics.length)
    throw new Error(
      `Capture diagnostics need review: ${diagnostics.join('\n')}`,
    )
} finally {
  await browser.close()
}
