# Roastbook designs

Editable [OpenPencil](https://openpencil.dev) documents of every Roastbook
view, captured from a running instance. Each file in `views/` holds one view
with its desktop (1280 px) and mobile (390 px) artboards side by side.

Layers are named after the element's role and the component file that
rendered it, for example `page-header · overview-page`, so a layer leads
back to its source in `src/`.

## Capture

Start Roastbook with seeded data (see `docs/development.md`), then:

```bash
cd design
bun install
bunx playwright-core install chromium-headless-shell
ROASTBOOK_URL=http://localhost:3000 bun capture.ts
```

`VIEWS="Beans,Bean"` captures only the named views, and `CDP_URL` points it at
a remote Chrome instead of a local headless one. Captures replace the files in
`views/`, so commit or export design edits you want to keep first.

The capture snapshots each element's computed styles in Chrome and lets
OpenPencil lay the layers out again as auto-layout frames. Icons and charts
become images, form fields become frames with their text, and CSS grids become
wrapping rows. Pseudo-elements, gradients, and hover states are not captured.

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
- `/` opens the overview view; open another with
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

Agents call `open_file` with a path such as `beans.fig`, then read and edit
layers. OpenPencil refuses agent edits in documents above 10,000 nodes, which
is why each view has its own file.

A browser tab cannot write a document back into `views/`; **File → Save**
downloads it instead. Without an open tab, agents edit files directly:

```bash
cd ~/workspaces/open-pencil
bun open-pencil eval ~/workspaces/roastbook/design/views/beans.fig --write \
  -c 'figma.currentPage.findOne((node) => node.name === "Beans — Desktop").name'
```
