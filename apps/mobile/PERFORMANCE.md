# Mobile performance review

This pass addresses delays in stocking, mortality, harvesting, pond creation,
history browsing, and the shared data/sync work used by the other screens.

## Changes

- Saves wait for local data, derived pond state, history, and the sync queue to
  persist. Cloud work runs afterward through a shared background sync controller.
  Auto-sync and Wi-Fi-only preferences still apply; manual sync remains available.
- One provider owns sync state, network monitoring, and the periodic sync timer.
  Mounted screens no longer each start their own sync and queue polling loops.
- Local record views and farm summaries subscribe to database changes while
  focused. The AsyncStorage fallback publishes write notifications too. There are
  no recurring 2–3 second whole-table reads just to refresh these screens.
- Native pond queries use the existing `pond_id` indexes. Whole-farm stock
  recalculation groups transactions once and batches native pond updates.
- Record lists use FlatList windowing, including grouped recent entries, history,
  and the queue. The artificial 550 ms loading delay is removed. Route parameters
  select the correct transaction form on its first render.
- The save action guards against repeated taps. Storage failures propagate to
  the caller instead of falsely reporting success.
- Queue writes serialize, and an upload commits only its processed item. New
  entries and newer revisions remain queued. Cloud data is fetched outside the
  local mutation lock; applying it preserves records with pending local changes.
- Sync ID mappings persist in one storage batch per pull instead of one bridge
  call per record. Icon imports include only the two font families in use.
- Unchanged native pull records and repeated identical fallback writes avoid
  redundant database updates. The fallback write cache is bounded and cleared
  when local data is reset.

## Verification

Run from the repository root:

```sh
npm run typecheck -w apps/mobile
npm test -w apps/mobile
node apps/mobile/tests/mobile-performance.test.cjs
```

The performance regressions execute the actual TypeScript with native storage
and networking replaced by controlled test doubles. They cover local save
durability, storage failures, concurrent queue changes, filtered native queries,
coalesced refreshes, stock calculations, and a harvest saved during a delayed
cloud pull.

The scale test uses 100 ponds and 2,000 stockings. It checks at most 4,000 pond-ID
reads and one native update batch, compared with 200,000 stocking-to-pond checks
in the previous per-pond scan. This is a work-count comparison, not a measured
phone latency or FPS result.

An Android JavaScript export checks Metro/module integration without creating an
APK. Tests do not replace validation on a physical Android device.

Validation for this pass: TypeScript passed, all 11 performance/data regressions
and 6 existing auth regressions passed, and the final Android Metro/Hermes export
succeeded. Direct icon imports reduced bundled font families from 19 to 2 and
font assets from 4,076,840 to 1,697,384 bytes (2.38 MB less before APK compression).
The Android JavaScript bundle decreased from approximately 4.16 MB to 3.99 MB.

## Before the final APK

On the intended test phone, use a development build with the native database:

1. Open stocking, mortality, and harvest forms repeatedly and switch tabs. Check
   that the correct form appears immediately, the keyboard stays focused, and
   the selected pond/species updates after transactions.
2. Save each transaction offline and on a slow connection. Confirm local success
   and pond counts without waiting for sync. Reconnect and confirm each record
   reaches the server exactly once.
3. Save again while sync is active, including partial/full harvests and restocking.
   Force-close after local success, reopen, and check pending records survive.
4. Check Wi-Fi-only, disabled auto-sync, manual retry, background/foreground, and
   account switching. Validate queue status on the Records and Sync screens.
5. Browse a large pond history, scroll to older rows, collapse recent groups, and
   use all filters. Compare tap-to-form, tap-to-local-success, and scrolling using
   the same device and data before/after; record median and slowest timings.

No Android device was connected during this pass, so device latency, frame rate,
and memory under a long session remain unmeasured. Field-staff cloud pulls retain
their existing full account-scoped reconciliation; changing that to incremental
updates needs a separate update/deletion cursor design and server validation.
