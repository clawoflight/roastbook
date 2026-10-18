# Roastbook campaign studio

Five Instagram concepts live in `campaign.json`. Each produces three 1080 × 1350
carousel slides, three 1080 × 1920 video frames, an 14-second H.264 Reel with CC0 jazz,
a caption, alt text, and a draft publishing manifest. The review gallery is
`exports/index.html`.

The real app screenshots, generated scene backgrounds, sample label, and licensed
brand fonts live in `assets/`. These are campaign source assets, not test
screenshots. Rebuildable exports and original image-generator output are ignored
by Git. Copy the exports to your media library before deleting a workspace.

## Rebuild the five posts

Python 3.11 or newer and `uv` are required. From the repository root:

```bash
uv venv .artifacts/marketing-venv
uv pip install --python .artifacts/marketing-venv/bin/python -r marketing/requirements.txt
.artifacts/marketing-venv/bin/python marketing/render.py --video
.artifacts/marketing-venv/bin/python marketing/verify.py
```

FFmpeg comes from the pinned `imageio-ffmpeg` wheel. Rendering uses the committed
source screenshots and backgrounds, so this command needs neither a running app
nor an API key. Run without `--video` to iterate on images only. Use
`--video --only 04-cafe-journal` to rebuild just the café concept and refresh the
gallery, manifests, and archive without re-encoding the other Reels. Existing output
files are replaced. Exported manifests always return to draft and unapproved.

To review through a managed preview, check `vibepod-preview list` first and reuse
`roastbook-studio` if it exists. For a new preview, run the following from the
repository root. In T3, include `--owner-thread` with the live parent thread ID.

```bash
vibepod-preview run roastbook-studio -- \
  sh -c 'python3 -m http.server "$PORT" --directory marketing/exports'
vibepod-preview doctor roastbook-studio
```

Use the exact URL printed by the preview manager. The static server exposes only
the exported draft packages, never provider settings or the application database.

## Capture fresh screenshots

Use the dedicated campaign database. Do not point these commands at a personal
or production database. Its port is loopback-only and its named volume survives
shutdown. Local storage is `.artifacts/campaign-uploads`.

```bash
docker compose -p roastbook-campaign -f marketing/compose.yaml up -d --wait
python3 marketing/local-app.py bun run db:migrate
# Run the seed command only once, against an empty campaign database.
python3 marketing/local-app.py bun run db:seed
.artifacts/marketing-venv/bin/python marketing/install-fixture-icons.py
bun run build
```

`local-app.py` pins the database URL and storage directory. It resolves the
provider in memory from the authorized Codex configuration, with an API key in
`~/.codex/auth.json` taking precedence. It never copies credentials into files.
The isolated app defaults to `gpt-6-luna` for label extraction; set
`CAMPAIGN_VISION_MODEL` to an available vision-capable model for another provider.
The app itself retains its normal defaults.

Reuse the managed `roastbook-campaign` preview when present. For its first launch:

```bash
vibepod-preview run \
  --stop-hook \
  'docker compose -p roastbook-campaign -f marketing/compose.yaml stop' \
  roastbook-campaign -- python3 marketing/local-app.py bun .output/server/index.mjs
vibepod-preview doctor roastbook-campaign
```

This is a separate writable variant of Roastbook, seeded with the same fictional
records as the read-only public demo. Keep its registered preview behind the
preview gateway. Its create and AI actions are available only for local capture.

The screenshot producer reuses the existing `design/` package's Playwright Core
dependency. No browser automation dependency is added to the application. This
browser produces campaign assets; use T3's shared browser for interactive QA.

```bash
cd design
bun install --frozen-lockfile
bunx playwright-core install chromium-headless-shell
cd ..
# Substitute the port reported by the managed preview.
ROASTBOOK_URL=http://localhost:43361 bun marketing/capture.mjs
```

`captures.json` defines the routes, viewport sizes, expected headings, and focused
cards. Captures use light mode, UTC, an English locale, and 2× pixels. The script
waits for fonts, images, and page readiness, records source hashes and the Git
revision, and fails on failed requests or browser exceptions. Use `--only=places` to retake only the map. Its recipe checks that at least
three unobscured café markers fit inside the map, saves an overview, selects
Lantern Room through its marker, and saves the map with café details. It zooms
out through the real controls after selection to keep the other cafés visible.
Both captures include map attribution and record the visible cafés in provenance.
The café Reel shows the overview before the selected state.

It does not replace app text, fabricate results, or hide errors. Seed dates are relative to the date
the database was first seeded; committed captures preserve this campaign's dates.

To refresh the scanning sequence, explicitly add `--scan`. This makes a paid,
real AI request using `assets/sample-label.jpg`. It captures the uploaded label
and the review dialog, then closes without applying changes or creating a coffee.
The sample label is fictional and derives from the demo's Moonrise Lot 17 record.
Recreate it with `make-label.py` using the campaign Python environment.

After capture, run `bunx biome check marketing --write`, render again, and run
`verify.py`. Never use a failed or incomplete capture run for publication. Review
each post visually and check the Reel's framing on a phone.

## Generate new scene backgrounds

Prompts are saved verbatim in `campaign.json`. With the imagegen skill installed:

```bash
.artifacts/marketing-venv/bin/python marketing/generate-scenes.py
```

The wrapper calls the skill's bundled CLI with `gpt-image-2`, high quality,
1024 × 1536 images, and at most two concurrent requests. It only requests missing
backgrounds absent from both `assets/scenes/` and `output/imagegen/roastbook/`.
This is a paid operation. Set
`IMAGE_GEN_CLI` if the skill is installed elsewhere. The credential uses only the
configured provider endpoint, and never becomes part of an export.

The wrapper converts new originals to `assets/scenes/<post-id>.webp` with Pillow
at quality 95. Inspect these drafts before rendering. Existing sources are never
overwritten; archive both the original and WebP to regenerate a concept.
The compositor
adds screenshots and all copy afterward; the image model never draws app UI.
Keep the top of the scene quiet and the device area free of props. The device is
an overhead frame with a shadow, so source photography must also be overhead.

## Review and posting handoff

Every `exports/<post-id>/post.json` includes the caption, ordered carousel media,
alt text, SHA-256 hashes, source capture provenance, scene prompt, and video
metadata. `exports/campaign.json` collects all five packages. These are local
publishing packages, not an implementation of the future posting MCP schema.

Nothing posts, schedules, or approves content. When the MCP is connected, its
adapter should consume an explicitly reviewed package, upload the media, and
record the platform result. Keep approval and publishing separate from rendering.
No credentials or account IDs belong in the manifest.

Videos animate real stills with 60 fps slow zooms and smooth crossfades. They do not simulate
clicks or claim to be generated live-action footage. Audio uses “Jazz Slower” by Alex McCulloch, released under CC0.
The source and license are recorded in `assets/music/LICENSE.md`. Captions disclose fictional demo data and
AI-generated surroundings. Post 5 also explains that AI requires an API key when
self-hosting and is disabled in the public demo. Confirm that the Instagram bio
actually links to the demo before using the supplied captions.

Stop the campaign app with `vibepod-preview stop roastbook-campaign` when capture
is done; its stop hook stops PostgreSQL without removing the named volume. Keep
the static studio preview running while reviewing exports.

The final scanning card uses `assets/coffee-bag.webp`, an AI-generated product
photo with printed fictional packaging. Its prompt is in
`prompts/coffee-bag.txt`. The extraction fixture remains `sample-label.jpg`
to preserve the provenance of the real captured extraction. All displayed
campaign URLs use `www.roastbook.coffee`. Reels hold each card for five seconds
with half-second crossfades; a 4× source canvas gives the gentle zoom subpixel movement, avoiding
whole-pixel stepping at delivery resolution. Audio is mixed at a quiet level
with entry and exit fades.
