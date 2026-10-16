# Roastbook designs

`views/roastbook.fig` is one [OpenPencil](https://openpencil.dev) document of
every Roastbook view, captured from a running instance:

- **Pages:** a page per view, holding its desktop (1440×900) and mobile
  (390×844) artboards, then a **Components** page. A page longer than the
  screen grows its artboard to show everything.
- **Content:** the seed data's mock records, but lists show at most six
  items, so a view shows the pattern rather than the whole database.
- **Layout:** auto layout throughout. Flex and block stacks become stacks, CSS
  grids become grid layouts, and `ml-auto` pushes become grow spacers.
  Positioned elements are absolute children with matching constraints, so the
  mobile tab bar stays pinned to the bottom.
- **Components:** every Lucide icon, and each shared React component that
  occurs more than once, is a component on the Components page. Every
  occurrence in the views is an instance, carrying its own text, images and
  sizes as overrides. shadcn's `data-variant` and `data-size` become variant
  properties.
- **Variables:** colour variables have a Light and a Dark mode, taken from
  `src/styles.css`. Switch an artboard's Color mode to Dark and every bound
  colour follows; photos and colours the app hardcodes stay as they are.
  There are also variables for the 4 px spacing scale, the radius scale and the
  two font families.
- **Bindings:** fills, strokes and text colours are bound only where the light
  and the dark theme both drew that token. Paddings, gaps and corner radii are
  bound where they sit on the scales.
- **Styles:** text styles follow the type scale in `DESIGN.md` (Page title,
  Section title, Body, Small, and so on), and effect styles hold the app's
  shadows.

Layers are named after the element's role and the component file that
rendered it, for example `page-header · page-layout`, so a layer leads back to
its source in `src/`.

`tokens/` holds the same tokens as W3C design token (DTCG) files: one folder
per collection, with a file per mode, and `styles.tokens.json` for typography
and shadows. Code can read them, and OpenPencil's design token import (the
`import_design_tokens` MCP tool), or any other DTCG tool, can load them.

## Capture

Start Roastbook with seeded data (see `docs/development.md`), then:

```bash
cd design
bun install
bunx playwright-core install chromium-headless-shell
ROASTBOOK_URL=http://localhost:3000 bun capture.ts
```

Before measuring, the capture cuts every list rendered by one JSX line to its
first six items (`LIST_LIMIT` in `capture.ts`) and lets the page lay itself out
again. `VIEWS="Beans,Bean"` captures only the named views. `CDP_URL` points it at a
remote Chrome instead of a local headless one, and `OUTPUT` writes somewhere
other than `views/roastbook.fig`. A capture replaces the document and
`tokens/`, so commit or export design edits you want to keep first.

`capture/` holds the steps:

1. `snapshot.ts` runs in the page. It records each element's measured box and
   computed styles, and reads every colour again under the `dark` class.
2. `build.ts` turns the snapshot into layers. Layout is read from the measured
   boxes, so auto layout reproduces the page rather than re-deriving it from
   CSS.
3. `verify.ts` lays each artboard out with OpenPencil's own text measurement
   (CanvasKit, as in the editor) and compares every layer with the browser. An
   auto-layout frame whose children do not land on their boxes falls back to
   fixed positions; the capture prints how many did per artboard.
4. `tokens.ts` makes the token files, imports them, and binds layers to
   variables and styles.
5. `components.ts` turns repeated layers into components and instances. The
   capture then checks the layout again.

Known gaps:
- Pseudo-elements, hover and focus states, and open menus or dialogs are not
  captured.
- CSS transforms are not captured, so the rotated chart labels in Stats sit at
  fixed positions.
- The capture switches transitions off before measuring.

## Editor

`open-pencil/editor.sh` runs the OpenPencil editor against `views/`. Only
development builds connect a browser tab to OpenPencil's MCP server, but the
development server sends about 2,700 separate modules, which stalls behind the
preview gateway. The script therefore builds a development-mode bundle (about
30 s on each start) and serves it with `vite preview`.
`open-pencil/vite.vibepod.config.ts` adapts it to a VibePod preview:

- the MCP bridge is proxied through the editor's own origin at `/__mcp`;
- `.fig` files under `views/` are served read-only at their absolute paths,
  which is where a browser tab fetches MCP `open_file` paths from, and at
  `/views/<name>.fig`;
- `/` opens `views/roastbook.fig`; open another file with
  `/?file=https://open-pencil.<preview-domain>/views/<name>.fig`;
- OpenPencil's service worker is replaced by one that unregisters itself, so a
  rebuild is not shadowed by a cached bundle;
- an empty MCP root setting in the editor means `views/`.

```bash
design/open-pencil/editor.sh setup
vibepod-preview run --port 1420 open-pencil -- \
  env OPENPENCIL_DEV_ORIGIN=https://open-pencil.<preview-domain> \
  design/open-pencil/editor.sh start
```

The MCP bearer token lives in `~/.config/vibepod/open-pencil/token` and is
embedded in the editor's development bundle, so keep the editor behind the
authenticated preview gateway.

## Agents

Claude Code and Codex connect through OpenPencil's stdio MCP server, which
forwards to the editor tab a person has open:

```bash
# The editor's discovery file; the directory name is derived from port 7600.
discovery=/tmp/open-pencil-mcp/18d901424f534c7b/mcp.json
claude mcp add --scope user open-pencil \
  -e OPENPENCIL_MCP_DISCOVERY_PATH="$discovery" \
  -e OPENPENCIL_MCP_ROOT="$PWD/design/views" \
  -- bun ~/workspaces/open-pencil/packages/mcp/src/stdio.ts
```

Agents call `open_file` with `roastbook.fig`, then read and edit a view's
layers by passing that page's `page_id` (from `list_pages`) to each tool;
`switch_page` alone does not retarget later calls. The document holds about
21,000 nodes. OpenPencil loads pages lazily, but refuses agent edits once the
pages loaded so far exceed 10,000 nodes, so after visiting many pages, reopen
the document.

A browser tab cannot write a document back into `views/`; **File → Save**
downloads it instead. Without an open tab, agents edit files directly:

```bash
cd ~/workspaces/open-pencil
bun open-pencil eval ~/workspaces/roastbook/design/views/roastbook.fig --write \
  -c 'figma.root.findOne((node) => node.name === "Beans — Desktop").name'
```
