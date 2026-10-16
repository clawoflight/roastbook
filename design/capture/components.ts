// Turns repeated layers into components: every Lucide icon, and every layer a
// shared React component rendered that occurs more than once with the same
// structure. The first occurrence becomes the main component on the Components
// page, and every occurrence, that one included, becomes an instance carrying
// its own text, images, colors and sizes as overrides. shadcn's `data-variant`
// and `data-size` become the variant properties of a component set.
import {
  FigmaAPI,
  type FigmaComponentNode,
  type FigmaNodeProxy,
} from '@open-pencil/core/figma-api'
import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'
import type { Box, SnapshotElement } from './snapshot'

/** Fields that make up a layer's identity or structure rather than how it looks. */
const STRUCTURE_FIELDS = new Set<string>([
  'id',
  'type',
  'name',
  'parentId',
  'childIds',
  'componentId',
  'instanceOverrides',
  'source',
  'derivedLayout',
  'componentPropertyDefinitions',
  'componentPropertyReferences',
  'componentPropertyAssignments',
  'componentPropertyValues',
  'variantPropSpecs',
])

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Route files hold pages, not reusable components.
const isRouteFile = (file: string) =>
  /^(index|__root|\$.*|.*-page|new|settings|stats)\.tsx$/.test(file)

function signature(graph: SceneGraph, node: SceneNode): string {
  const own =
    node.type === 'INSTANCE'
      ? `I:${node.componentId}`
      : node.type === 'RECTANGLE'
        ? `R:${node.fills[0]?.type === 'IMAGE' ? 'image' : 'shape'}`
        : `${node.type}:${node.layoutMode}`
  if (
    node.type === 'TEXT' ||
    node.type === 'INSTANCE' ||
    node.type === 'VECTOR'
  )
    return own
  return `${own}[${graph
    .getChildren(node.id)
    .map((child) => signature(graph, child))
    .join(',')}]`
}

// What a .fig instance cannot override on its layers (tested by saving and reopening):
// they always come from the component, so occurrences have to agree on them.
const FIXED_IN_COMPONENT = [
  'layoutMode',
  'clipsContent',
  'horizontalConstraint',
  'verticalConstraint',
  'gridPosition',
] as const

/**
 * Whether two same-shaped layers agree on everything an instance takes from its component:
 * the fields above, and where freely placed descendants sit.
 */
function samePlacement(graph: SceneGraph, a: SceneNode, b: SceneNode): boolean {
  if (FIXED_IN_COMPONENT.some((field) => !same(a[field], b[field])))
    return false
  const others = graph.getChildren(b.id)
  return graph.getChildren(a.id).every((child, i) => {
    const other = others[i]
    if (!other) return false
    const free =
      a.layoutMode === 'NONE' || child.layoutPositioning === 'ABSOLUTE'
    if (
      free &&
      (Math.abs(child.x - other.x) > 1 || Math.abs(child.y - other.y) > 1)
    )
      return false
    return child.type === 'INSTANCE' || samePlacement(graph, child, other)
  })
}

function height(graph: SceneGraph, node: SceneNode): number {
  if (node.type === 'INSTANCE') return 1
  return (
    1 +
    Math.max(
      0,
      ...graph.getChildren(node.id).map((child) => height(graph, child)),
    )
  )
}

const pascal = (file: string) =>
  file
    .replace(/\.tsx$/, '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

interface Group {
  family: string
  variant: Record<string, string>
  nodes: SceneNode[]
  kind: 'icon' | 'primitive' | 'component'
}

const PRIMITIVES =
  /^(button|badge|card|input|select|textarea|separator|skeleton|switch|checkbox|label|tabs|tooltip|toggle|toggle-group|slider|progress|avatar)\.tsx$/

function candidates(
  graph: SceneGraph,
  pageIds: string[],
  elements: Map<string, SnapshotElement>,
) {
  const groups = new Map<
    string,
    Group & { file?: string; source?: string; part?: string }
  >()
  const visit = (node: SceneNode) => {
    for (const child of graph.getChildren(node.id)) visit(child)
    if (node.type !== 'FRAME') return
    let group: Omit<Group, 'nodes'> & {
      file?: string
      source?: string
      part?: string
    }
    if (node.name.startsWith('icon/')) {
      group = {
        family: `Icon/${node.name.slice(5)}`,
        variant: {},
        kind: 'icon',
      }
    } else {
      const element = elements.get(node.id)
      const file = element?.source?.split(':')[0]
      if (!element || !file || !node.name.includes(' · ') || isRouteFile(file))
        return
      group = {
        family: pascal(file),
        variant: element.variant ?? {},
        kind: PRIMITIVES.test(file) ? 'primitive' : 'component',
        file,
        source: element.source,
        // The part of the file it is: its shadcn slot, else its element, never data-bearing labels.
        part: element.slot ?? element.tag,
      }
    }
    const key = `${group.source ?? group.family}|${JSON.stringify(group.variant)}|${signature(graph, node)}`
    const entry = groups.get(key) ?? { ...group, nodes: [] }
    entry.nodes.push(node)
    groups.set(key, entry)
  }
  for (const pageId of pageIds)
    for (const child of graph.getChildren(pageId)) visit(child)
  // Instances keep their layers where the component puts them (.fig, like Figma, has no
  // position overrides), so occurrences share a component only where those places agree.
  for (const [key, group] of [...groups]) {
    if (group.kind === 'icon') continue
    const clusters: SceneNode[][] = []
    for (const node of group.nodes) {
      const cluster = clusters.find((members) =>
        samePlacement(graph, members[0] as SceneNode, node),
      )
      if (cluster) cluster.push(node)
      else clusters.push([node])
    }
    groups.delete(key)
    for (const [i, nodes] of clusters.entries())
      groups.set(`${key}#${i}`, { ...group, nodes })
  }
  const artboard = (node: SceneNode) => {
    let top = node
    while (top.parentId && graph.getNode(top.parentId)?.type !== 'CANVAS')
      top = graph.getNode(top.parentId) as SceneNode
    return top
  }
  // Something a view shows once per viewport is a section of that view, not a component:
  // it has to recur on another page, or more than once on one artboard.
  const recurs = (group: Group) => {
    const pages = new Set(group.nodes.map((node) => artboard(node).parentId))
    const perArtboard = new Map<string, number>()
    for (const node of group.nodes) {
      const id = artboard(node).id
      perArtboard.set(id, (perArtboard.get(id) ?? 0) + 1)
    }
    return pages.size > 1 || Math.max(...perArtboard.values()) > 1
  }
  const kept = [...groups.values()].filter(
    (group) => group.kind === 'icon' || recurs(group),
  )
  // A file that renders several roots names each by its part, then by line if parts repeat.
  const sources = new Map<string, Set<string>>()
  for (const group of kept)
    if (group.file && group.source)
      (
        sources.get(group.file) ??
        sources.set(group.file, new Set()).get(group.file)
      )?.add(group.source)
  const parts = new Map<string, Set<string>>()
  for (const group of kept) {
    if (
      !group.file ||
      !group.source ||
      (sources.get(group.file)?.size ?? 0) < 2
    )
      continue
    const key = `${group.file}|${group.part}`
    ;(parts.get(key) ?? parts.set(key, new Set()).get(key))?.add(group.source)
  }
  // Parts that only one viewport shows are told apart by it, others by their line.
  const viewport = (node: SceneNode) => artboard(node).name.split(' — ').at(-1)
  for (const group of kept) {
    if (
      !group.file ||
      !group.source ||
      (sources.get(group.file)?.size ?? 0) < 2
    )
      continue
    const shared = (parts.get(`${group.file}|${group.part}`)?.size ?? 0) > 1
    const viewports = new Set(group.nodes.map(viewport))
    const suffix = !shared
      ? ''
      : viewports.size === 1
        ? ` · ${[...viewports][0]}`
        : ` ${group.source.split(':')[1]}`
    group.family = `${pascal(group.file)}/${group.part}${suffix}`
  }
  return kept
}

export interface ComponentReport {
  components: number
  sets: number
  instances: number
}

/**
 * Records that a layer differs from its component in `field`, on every instance it sits in,
 * as OpenPencil does: the nearest keeps it through its own syncs, the outer ones through theirs.
 */
function markOverride(instances: SceneNode[], nodeId: string, field: string) {
  for (const instance of instances) {
    if (nodeId === instance.id) {
      instance.instanceOverrides.self.set(field, true)
      continue
    }
    const fields =
      instance.instanceOverrides.descendants.get(nodeId) ??
      new Map<string, unknown>()
    fields.set(field, true)
    instance.instanceOverrides.descendants.set(nodeId, fields)
  }
}

/** Points each cloned instance's overrides at the cloned layers instead of the originals. */
function remapClonedOverrides(
  graph: SceneGraph,
  source: SceneNode,
  clone: SceneNode,
) {
  const ids = new Map<string, string>()
  const pair = (a: SceneNode, b: SceneNode) => {
    ids.set(a.id, b.id)
    graph.getChildren(a.id).forEach((child, i) => {
      const twin = graph.getChildren(b.id)[i]
      if (twin) pair(child, twin)
    })
  }
  pair(source, clone)
  for (const [from, to] of ids) {
    const original = graph.getNode(from)
    const copy = graph.getNode(to)
    if (original?.type !== 'INSTANCE' || !copy) continue
    copy.instanceOverrides = {
      self: new Map(original.instanceOverrides.self),
      descendants: new Map(
        [...original.instanceOverrides.descendants].map(([id, fields]) => [
          ids.get(id) ?? id,
          new Map(fields),
        ]),
      ),
    }
  }
}

/** Copies what an occurrence shows onto the instance that replaces it, layer by layer. */
function applyOverrides(
  graph: SceneGraph,
  instances: SceneNode[],
  from: SceneNode,
  to: SceneNode,
  measured: Map<string, Box>,
) {
  const box = measured.get(from.id)
  if (box) measured.set(to.id, box)
  // Everything an occurrence shows differently from its component becomes an override.
  const changes: Partial<SceneNode> = {}
  for (const [field, value] of Object.entries(from))
    if (
      !STRUCTURE_FIELDS.has(field) &&
      !same(value, to[field as keyof SceneNode])
    )
      Object.assign(changes, { [field]: structuredClone(value) })
  if (Object.keys(changes).length) {
    graph.updateNode(to.id, changes)
    for (const field of Object.keys(changes))
      markOverride(instances, to.id, field)
  }
  const sources = graph.getChildren(from.id)
  const targets = graph.getChildren(to.id)
  sources.forEach((source, i) => {
    const target = targets[i]
    if (target)
      applyOverrides(
        graph,
        target.type === 'INSTANCE' ? [...instances, target] : instances,
        source,
        target,
        measured,
      )
  })
}

export function extractComponents(
  graph: SceneGraph,
  viewPageIds: string[],
  libraryPageId: string,
  elements: Map<string, SnapshotElement>,
  measured: Map<string, Box>,
): ComponentReport {
  const api = new FigmaAPI(graph)
  const report: ComponentReport = { components: 0, sets: 0, instances: 0 }
  // The library page is one column of titled shelves, each wrapping its components.
  const column = graph.createNode('FRAME', libraryPageId, {
    name: 'Roastbook design system',
    layoutMode: 'VERTICAL',
    itemSpacing: 96,
    paddingTop: 64,
    paddingRight: 64,
    paddingBottom: 64,
    paddingLeft: 64,
    primaryAxisSizing: 'HUG',
    counterAxisSizing: 'HUG',
    fills: [],
  })
  const shelves = new Map<Group['kind'], SceneNode>()
  const shelf = (kind: Group['kind']) => {
    let frame = shelves.get(kind)
    if (!frame) {
      const title = {
        icon: 'Icons',
        primitive: 'Primitives',
        component: 'Roastbook components',
      }[kind]
      const section = graph.createNode('FRAME', column.id, {
        name: title,
        layoutMode: 'VERTICAL',
        itemSpacing: 32,
        primaryAxisSizing: 'HUG',
        counterAxisSizing: 'HUG',
        fills: [],
      })
      graph.createNode('TEXT', section.id, {
        name: 'title',
        text: title,
        fontFamily: 'Bricolage Grotesque',
        fontWeight: 800,
        fontSize: 40,
        lineHeight: 48,
        textAutoResize: 'WIDTH_AND_HEIGHT',
        width: 400,
        height: 48,
      })
      frame = graph.createNode('FRAME', section.id, {
        name: `${title} shelf`,
        layoutMode: 'HORIZONTAL',
        layoutWrap: 'WRAP',
        itemSpacing: 48,
        counterAxisSpacing: 48,
        width: kind === 'icon' ? 960 : 2800,
        primaryAxisSizing: 'FIXED',
        counterAxisSizing: 'HUG',
        counterAxisAlign: 'MIN',
        fills: [],
      })
      shelves.set(kind, frame)
    }
    return frame
  }

  // Inner components first, so outer ones are built from instances of them.
  const groups = candidates(graph, viewPageIds, elements).sort(
    (a, b) =>
      height(graph, a.nodes[0] as SceneNode) -
      height(graph, b.nodes[0] as SceneNode),
  )
  const families = new Map<string, { group: Group; main: FigmaNodeProxy }[]>()

  for (const group of groups) {
    const nodes = group.nodes.filter((node) => graph.getNode(node.id))
    const first = nodes[0]
    if (!first) continue
    const clone = graph.cloneTree(first.id, shelf(group.kind).id, {
      x: 0,
      y: 0,
      layoutGrow: 0,
      layoutAlignSelf: 'AUTO',
      layoutPositioning: 'AUTO',
      gridPosition: null,
    })
    if (!clone) continue
    remapClonedOverrides(graph, first, clone)
    const proxy = api.createComponentFromNode(
      api.getNodeById(clone.id) as FigmaNodeProxy,
    )
    const main = graph.getNode(proxy.id) as SceneNode
    graph.updateNode(main.id, { name: group.family })
    if (group.kind === 'icon')
      for (const child of graph.getChildren(main.id))
        graph.updateNode(child.id, {
          horizontalConstraint: 'SCALE',
          verticalConstraint: 'SCALE',
        })
    report.components++

    for (const node of nodes) {
      const parent = node.parentId && graph.getNode(node.parentId)
      if (!parent) continue
      const index = parent.childIds.indexOf(node.id)
      const instance = graph.createInstance(main.id, parent.id)
      if (!instance) continue
      graph.reorderChild(instance.id, parent.id, index)
      // Where the occurrence sat and how it sized itself come along with what it showed.
      applyOverrides(graph, [instance], node, instance, measured)
      graph.deleteNode(node.id)
      report.instances++
    }
    const family = families.get(group.family) ?? []
    family.push({ group, main: proxy })
    families.set(group.family, family)
  }

  // Occurrences of one React component that differ by variant or structure share a set.
  for (const [name, members] of families) {
    if (members.length < 2) continue
    const keys = [
      ...new Set(
        members.flatMap((member) => Object.keys(member.group.variant)),
      ),
    ]
    const values = members.map((member) =>
      keys.map((key) => `${key}=${member.group.variant[key] ?? 'none'}`),
    )
    // Occurrences alike in variant but not in structure are told apart by a layout number.
    const repeats =
      new Set(values.map((value) => value.join())).size < values.length
    const seen = new Map<string, number>()
    members.forEach((member, i) => {
      const own = values[i] ?? []
      const count = (seen.get(own.join()) ?? 0) + 1
      seen.set(own.join(), count)
      graph.updateNode(member.main.id, {
        name: [...own, ...(repeats ? [`layout=${count}`] : [])].join(', '),
      })
    })
    const parent = graph.getNode(members[0]?.main.id ?? '')?.parentId
    if (!parent) continue
    const set = api.combineAsVariants(
      members.map((member) => member.main as unknown as FigmaComponentNode),
      api.getNodeById(parent) as FigmaNodeProxy,
    )
    graph.updateNode(set.id, { name })
    report.sets++
  }
  return report
}
