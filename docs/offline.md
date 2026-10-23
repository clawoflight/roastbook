# Offline journaling

Roastbook can create brews while the browser is offline. The app shell, the
new-brew reference data, and the new-brew route are cached after an online
visit. Pending brews live in IndexedDB and sync when connectivity returns.

## What works offline

- Logging a brew with the new-brew form, including the tasting step.
- Pending brews survive reloads and app restarts.
- Pending brews are labeled on the pending page and in the app banner.
- Sync runs when the app opens, when connectivity returns, and from the manual
  retry action.

## What stays online-only

- Editing or deleting saved brews.
- Attaching brew images.
- Saving a brew into a recipe.
- AI label scanning, research, and recommendations.
- The shottimer integration.

Those actions are disabled or show an error while offline. The core daily
workflow — log a brew, rate it, and sync later — works without a connection.

## Sync behavior

- Each queued brew has a client operation ID.
- `brews.client_operation_id` has a unique index. Repeating a create with the
  same ID returns the existing brew instead of inserting another one.
- A queued item is removed only after a successful server response. If the app
  closes after the server commits but before the response arrives, the next
  retry returns the same brew.
- A sync flush is single-flight. The app-open, reconnect, visibility, and
  manual triggers cannot run duplicate flushes concurrently.
- If authentication expires, the queue is kept and marked “sign in to sync.”
  After signing in, sync resumes.
- If the server rejects a queued brew (for example, its bean was deleted), the
  item stays on the device with the error and Retry/Discard actions.

## Storage and privacy

- Pending brews and reference data live in IndexedDB in this browser. They are
  per-device and are not encrypted by Roastbook.
- The service worker caches app HTML for offline boot. Cached documents are
  versioned by build, bounded, and cleared on logout.
- Clearing site data removes pending brews. Discarding a pending brew is
  permanent.
- Queued creates are independent across devices. Syncing two devices creates
  two brews if both queued one separately. Edits and deletes are not queued, so
  they cannot conflict with another device.

## Offline readiness

- After an online app load, the app idle-prefetches the new-brew route and its
  reference data, then saves the data in IndexedDB.
- When `/brews/new` is opened through client-side navigation while offline, its
  loader falls back to the saved data and shows an offline notice.
- The service worker's document cache lets the installed app reopen offline.
  Routes that were never visited online may still show the offline page.
- The form disables server-only actions and queues the brew on submit. The
  tasting dialog updates the queued payload in place.

## Verification

- Unit tests: `src/modules/offline/*.test.ts` and
  `scripts/service-worker.test.ts`.
- `bun run test:integration` covers the duplicate-operation-ID contract.
- Manual check: create a brew offline, reload or close and reopen the app,
  reconnect, and confirm exactly one server record. Also exercise an
  interrupted sync and an expired session.
