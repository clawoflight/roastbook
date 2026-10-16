// Captures Roastbook routes from a running instance into OpenPencil documents.
// Each view loads in headless Chrome, its computed styles are snapshotted, and
// OpenPencil lays the layers out again as editable auto-layout frames.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BUILTIN_IO_FORMATS, IORegistry } from '@open-pencil/core/io'
import { sceneGraphFromStyledHTML } from '@open-pencil/core/io/formats/html/layers'
import { chromium, type Page } from 'playwright-core'

const APP_URL = process.env.ROASTBOOK_URL ?? 'http://localhost:3000'
// Optional remote Chrome (for example a chromedp/headless-shell container).
const CDP_URL = process.env.CDP_URL
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? 'views'
const ONLY = process.env.VIEWS?.split(',')

const VIEWPORTS = [
  { name: 'Desktop', width: 1280, height: 800 },
  { name: 'Mobile', width: 390, height: 844 },
]

// `detail` opens the first entry linked from `path` instead of `path` itself.
const VIEWS: { name: string; path: string; detail?: RegExp }[] = [
  { name: 'Overview', path: '/overview' },
  { name: 'Brews', path: '/brews' },
  { name: 'Brew', path: '/brews', detail: /^\/brews\/(?!new)[^/]+$/ },
  { name: 'New brew', path: '/brews/new' },
  { name: 'Beans', path: '/beans' },
  { name: 'Bean', path: '/beans', detail: /^\/beans\/(?!new)[^/]+$/ },
  { name: 'New bean', path: '/beans/new' },
  { name: 'Roasters', path: '/roasters' },
  { name: 'Roaster', path: '/roasters', detail: /^\/roasters\/(?!new)[^/]+$/ },
  { name: 'Recipes', path: '/recipes' },
  { name: 'Recipe', path: '/recipes', detail: /^\/recipes\/(?!new)[^/]+$/ },
  { name: 'Gear', path: '/gear' },
  { name: 'Gear item', path: '/gear', detail: /^\/gear\/(?!new)[^/]+$/ },
  { name: 'Gear sets', path: '/gear-sets' },
  { name: 'Brewing methods', path: '/brewing-methods' },
  { name: 'Places', path: '/places' },
  { name: 'Place', path: '/places', detail: /^\/places\/(?!new)[^/]+$/ },
  { name: 'Visits', path: '/visits' },
  { name: 'Stats', path: '/stats' },
  { name: 'Settings', path: '/settings' },
]

interface DesignElement {
  type: 'element'
  tagName: string
  attrs: Record<string, string>
  children: DesignNode[]
  computedStyle?: Record<string, string>
}
type DesignNode = DesignElement | { type: 'text'; text: string }

// Runs in the page: mirrors @open-pencil/dom-css's browser runtime, but reads
// the live layout instead of a 1000px sandbox, and turns SVGs, images, and
// form fields into layers the importer can draw.
async function snapshotPage(props: string[]): Promise<DesignNode[]> {
  const imageCache = new Map<string, Promise<string | null>>()

  const toDataURL = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })

  const rasterize = (src: string, width: number, height: number) =>
    new Promise<string | null>((resolve) => {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(width * 2)
        canvas.height = Math.ceil(height * 2)
        canvas
          .getContext('2d')
          ?.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png'))
      }
      image.onerror = () => resolve(null)
      image.src = src
    })

  const imageSource = (src: string) => {
    let cached = imageCache.get(src)
    if (!cached) {
      cached = fetch(src)
        .then((response) => (response.ok ? response.blob() : null))
        .then((blob) => (blob ? toDataURL(blob) : null))
        .catch(() => null)
      imageCache.set(src, cached)
    }
    return cached
  }

  const styleOf = (
    element: Element,
    overrides: Record<string, string> = {},
  ) => {
    const computed = getComputedStyle(element)
    const style: Record<string, string> = {}
    for (const property of props) {
      const value = computed.getPropertyValue(property)
      if (value) style[property] = value
    }
    return { ...style, ...overrides }
  }

  const layerName = (element: Element) => {
    const source = element
      .getAttribute('data-tsd-source')
      ?.match(/([^/]+)\.tsx/)?.[1]
    const role =
      element.getAttribute('aria-label') ??
      element.getAttribute('data-slot') ??
      element.tagName.toLowerCase()
    return source ? `${role} · ${source}` : role
  }

  const isHidden = (element: Element) => {
    const style = getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') return true
    const rect = element.getBoundingClientRect()
    // sr-only and other visually hidden helpers
    return style.position === 'absolute' && rect.width <= 1 && rect.height <= 1
  }

  const isInline = (node: Node | null) =>
    node instanceof Element &&
    getComputedStyle(node).display.startsWith('inline')

  const box = (element: Element) => {
    const rect = element.getBoundingClientRect()
    return { width: `${rect.width}px`, height: `${rect.height}px` }
  }

  const imageLayer = (element: Element, src: string | null): DesignElement => ({
    type: 'element',
    tagName: 'img',
    attrs: { id: layerName(element), ...(src ? { src } : {}) },
    children: [],
    computedStyle: styleOf(element, box(element)),
  })

  async function visit(node: Node): Promise<DesignNode | null> {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text.trim()) return { type: 'text', text }
      const keep =
        text.length > 0 &&
        (isInline(node.parentNode) ||
          isInline(node.previousSibling) ||
          isInline(node.nextSibling))
      return keep ? { type: 'text', text } : null
    }
    if (!(node instanceof Element)) return null
    const tag = node.tagName.toLowerCase()
    if (
      ['script', 'style', 'link', 'meta', 'template', 'noscript'].includes(tag)
    )
      return null
    if (isHidden(node)) return null

    if (tag === 'svg') {
      const { width, height } = node.getBoundingClientRect()
      const clone = node.cloneNode(true) as SVGElement
      clone.setAttribute('width', String(width))
      clone.setAttribute('height', String(height))
      clone.setAttribute('color', getComputedStyle(node).color)
      const markup = new XMLSerializer().serializeToString(clone)
      const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
      return imageLayer(node, await rasterize(src, width, height))
    }
    if (tag === 'img') {
      const src =
        (node as HTMLImageElement).currentSrc || (node as HTMLImageElement).src
      return imageLayer(node, src ? await imageSource(src) : null)
    }
    if (tag === 'canvas')
      return imageLayer(node, (node as HTMLCanvasElement).toDataURL())
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      const field = node as HTMLInputElement
      if (
        ['checkbox', 'radio', 'hidden', 'range', 'file'].includes(field.type)
      ) {
        return {
          type: 'element',
          tagName: 'div',
          attrs: { id: layerName(node) },
          children: [],
          computedStyle: styleOf(node, box(node)),
        }
      }
      const value =
        tag === 'select'
          ? ((node as HTMLSelectElement).selectedOptions[0]?.text ?? '')
          : field.value
      const placeholder = getComputedStyle(node, '::placeholder').color
      return {
        type: 'element',
        tagName: 'div',
        attrs: { id: layerName(node) },
        children: [{ type: 'text', text: value || field.placeholder || '' }],
        computedStyle: styleOf(node, {
          ...box(node),
          display: 'flex',
          'align-items': tag === 'textarea' ? 'flex-start' : 'center',
          ...(value ? {} : { color: placeholder }),
        }),
      }
    }

    const children: DesignNode[] = []
    for (const child of Array.from(node.childNodes)) {
      const layer = await visit(child)
      if (layer) children.push(layer)
    }
    const overrides: Record<string, string> = {}
    // The importer has no CSS grid; items keep their measured sizes in a wrapping row.
    if (getComputedStyle(node).display.endsWith('grid')) {
      Object.assign(overrides, {
        display: 'flex',
        'flex-direction': 'row',
        'flex-wrap': 'wrap',
        'align-items': 'flex-start',
      })
    }
    // Text the browser kept on one line stays there when the design font measures wider.
    const hasText = Array.from(node.childNodes).some(
      (child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim(),
    )
    if (hasText) {
      const range = document.createRange()
      range.selectNodeContents(node)
      const lines = new Set(
        Array.from(range.getClientRects(), (rect) => Math.round(rect.bottom)),
      )
      const leaf = Array.from(node.childNodes).every(
        (child) => child.nodeType === Node.TEXT_NODE,
      )
      if (lines.size === 1)
        Object.assign(
          overrides,
          { 'white-space': 'nowrap' },
          leaf ? { width: 'auto', height: 'auto' } : {},
        )
    }
    return {
      type: 'element',
      tagName: tag,
      attrs: { id: layerName(node) },
      children,
      computedStyle: styleOf(node, overrides),
    }
  }

  const layers: DesignNode[] = []
  for (const child of Array.from(document.body.childNodes)) {
    const layer = await visit(child)
    if (layer) layers.push(layer)
  }
  return layers
}

// The same list @open-pencil/dom-css's browser runtime reads.
const PROPS = [
  'align-items',
  'aspect-ratio',
  'background-color',
  'background-image',
  'border-bottom-color',
  'border-bottom-style',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'border-bottom-width',
  'border-left-color',
  'border-left-style',
  'border-left-width',
  'border-radius',
  'border-right-color',
  'border-right-style',
  'border-right-width',
  'border-top-color',
  'border-top-style',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-top-width',
  'box-shadow',
  'box-sizing',
  'color',
  'column-gap',
  'display',
  'align-self',
  'bottom',
  'flex-direction',
  'flex-wrap',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'gap',
  'height',
  'justify-content',
  'letter-spacing',
  'left',
  'line-height',
  'max-height',
  'max-width',
  'min-height',
  'min-width',
  'object-fit',
  'opacity',
  'overflow',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'position',
  'right',
  'row-gap',
  'text-align',
  'text-decoration-line',
  'text-shadow',
  'text-transform',
  'top',
  'white-space',
  'width',
]

async function settle(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
}

// The app scrolls inside #app-scroll-area, so grow the viewport to its content
// height to capture the whole view.
async function fitToContent(page: Page, width: number) {
  for (let i = 0; i < 3; i++) {
    const overflow = await page.evaluate(() => {
      const area = document.querySelector('#app-scroll-area')
      return area ? area.scrollHeight - area.clientHeight : 0
    })
    if (overflow <= 1) return
    const { height } = page.viewportSize() ?? { height: 800 }
    await page.setViewportSize({
      width,
      height: Math.min(height + overflow, 12000),
    })
    await settle(page)
  }
}

async function captureView(
  page: Page,
  view: (typeof VIEWS)[number],
  viewport: (typeof VIEWPORTS)[number],
) {
  await page.setViewportSize(viewport)
  await page.goto(new URL(view.path, APP_URL).href)
  await settle(page)
  if (view.detail) {
    const pattern = view.detail
    const hrefs = await page.$$eval('a[href]', (links) =>
      links.map((link) => link.getAttribute('href') ?? ''),
    )
    const href = hrefs.find((candidate) => pattern.test(candidate))
    if (!href) return null
    await page.goto(new URL(href, APP_URL).href)
    await settle(page)
  }
  await fitToContent(page, viewport.width)
  const children = await page.evaluate(snapshotPage, PROPS)
  const { height } = page.viewportSize() ?? viewport
  const frame: DesignElement = {
    type: 'element',
    tagName: 'div',
    attrs: { id: `${view.name} — ${viewport.name}` },
    children,
    computedStyle: {
      display: 'flex',
      'flex-direction': 'column',
      width: `${viewport.width}px`,
      height: `${height}px`,
      overflow: 'hidden',
      'background-color': await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    },
  }
  return frame
}

const browser = CDP_URL
  ? await chromium.connectOverCDP(CDP_URL)
  : await chromium.launch()
const context = await browser.newContext({
  deviceScaleFactor: 1,
  colorScheme: 'light',
})
const page = await context.newPage()
const io = new IORegistry(BUILTIN_IO_FORMATS)
await mkdir(OUTPUT_DIR, { recursive: true })

// One document per view, its viewports side by side: OpenPencil limits agent
// editing to 10,000 nodes per document, which the whole app exceeds.
for (const view of VIEWS) {
  if (ONLY && !ONLY.includes(view.name)) continue
  const frames: DesignElement[] = []
  for (const viewport of VIEWPORTS) {
    // A dev server can reload the page mid-capture (dependency re-optimization), so retry.
    for (let attempt = 1; ; attempt++) {
      try {
        const frame = await captureView(page, view, viewport)
        if (frame) frames.push(frame)
        break
      } catch (error) {
        if (attempt === 3) throw error
        console.warn(
          `retry ${view.name} (${viewport.name}): ${error instanceof Error ? error.message.split('\n')[0] : error}`,
        )
      }
    }
  }
  if (frames.length === 0) {
    console.warn(`skip ${view.name}: no entry linked from ${view.path}`)
    continue
  }

  const graph = sceneGraphFromStyledHTML(
    {
      type: 'document',
      children: [
        {
          type: 'element',
          tagName: 'div',
          attrs: { id: view.name },
          children: frames,
          computedStyle: {
            display: 'flex',
            'flex-direction': 'row',
            'align-items': 'flex-start',
            gap: '160px',
          },
        },
      ],
    },
    { pageName: view.name },
  )
  // Lift each viewport frame onto the page as its own artboard, keeping its place.
  const [pageNode] = graph.getPages()
  const [row] = pageNode ? graph.getChildren(pageNode.id) : []
  if (!pageNode || !row)
    throw new Error(`${view.name}: the import produced no page`)
  for (const frame of graph.getChildren(row.id)) {
    const { x, y } = graph.getAbsolutePosition(frame.id)
    graph.reparentNode(frame.id, pageNode.id)
    graph.updateNode(frame.id, { x, y })
  }
  graph.deleteNode(row.id)

  const file = join(
    OUTPUT_DIR,
    `${view.name.toLowerCase().replaceAll(' ', '-')}.fig`,
  )
  const { data } = await io.writeDocument('fig', graph)
  await writeFile(file, data as Uint8Array)
  console.log(`wrote ${file}`)
}
await browser.close()
