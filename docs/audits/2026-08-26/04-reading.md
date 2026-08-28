---
audit: /reading app, hoodii.studio
date: 2026-08-26
auditor: adversarial read-only pass (no edits, no builds, no writes; one read-only Neon session)
scope: src/app/reading/**, src/lib/reading/**, content/reading/**, ReadingOS scripts feeding this surface
data-checked: reading_sync, reading_shelf_sync, reading_shelf_entry, reading_acquisition_entry, reading_source_list, reading_want (read-only), ReadingOS/data/{queue,acquire,all/*}.json
severity-key: P0 data loss/leak/cost blowup; P1 lies or broken; P2 cost/debt/drift; P3 polish
---

# /reading audit, 2026-08-26

## P0

### P0-1. The documented refresh pipeline shrinks enrichment.json from 6,569 books to about 778, silently, with no guard

- Files: `C:\Users\sneyr\Desktop\HOODII\ReadingOS\scripts\enrich-openlibrary.mjs` lines 41-48 and 123-128; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\AGENTS.md` line 123 (the refresh block).
- Evidence: the script selects `const pool = (ALL ? master : master.filter((b) => worth.has(b.key)))` and then `writeFileSync(p('data', 'all', 'enrichment.json'), JSON.stringify({ ... count: Object.keys(out).length, books: out }))` where `out` holds only the pool it just walked. The live file was last written by an `--all` run: `data/all/enrichment.json` holds `count: 6569` against `worth = 778` non-maybe books today, and Neon holds 5,900 rows with `cover_url`. AGENTS.md's own refresh sequence says to run `node scripts/enrich-openlibrary.mjs` with no flag.
- Why: running the documented command today replaces a 6,569-book artifact with a ~778-book one; the next `sync-shelf.mjs` then pushes about 5,100 books' covers, descriptions and ratings to null, every step logging success. This is exactly the half-extracted-export class AGENTS.md documents ("any script regenerating an accumulated artifact must refuse to shrink it without --force"), and the guard is absent. Recoverable from `raw/openlibrary/` cache, but nothing would notice until someone opened the shelf.
- Fix: in `enrich-openlibrary.mjs`, before the final `writeFileSync`, read the existing `enrichment.json`, merge `out` over its `books` (new data wins per key, absent keys are kept), and refuse to write a `books` object smaller than the existing one without `--force` that says so, the same contract as `C:\Users\sneyr\Desktop\HOODII\HealthOS\guard-regen.mjs`. Alternatively route it through guard-regen itself.
- Verify: run `node scripts/enrich-openlibrary.mjs --limit 5` on a copy; the output file must still hold 6,569+ books, and a forced shrink must print that it shrank.

## P1

### P1-1. The green "on the shelf right now" badge and the hub row present a six-day-old library check as a present-tense fact

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\reading\page.tsx` lines 94-111 (`const actionableNow = acquisition?.homeBranchNow ?? false;` feeding `verdict now`); `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\page.tsx` lines 206-227 (`readingRow`).
- Evidence: Neon today: `reading_acquisition_entry` holds `whitehead|underground railroad, BORROW NOW, home_branch_now: true, checked_at: 2026-08-20`. Six days later the queue page renders the green `.now` badge with no date on it, and the hub row renders "N of the next ten on a home-branch shelf right now" without calling `getLiveness()` at all. The stale banner in `page.tsx` (lines 69-76) only appears past the 7-day window, and even then the badge underneath stays green: nothing gates `actionableNow` on `liveness.stale`. The file's own comment says "--signal stays reserved for a fact that is true right now, and a week-old BORROW NOW claim is the opposite of that", and the CSS comment in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\reading\reading.css` line 404 repeats it. `getLiveness()` also states holds move daily, then allows seven days before saying anything.
- Why: sync.mjs runs by hand (last acquisition check 2026-08-20), holds move daily, and both surfaces claim "right now" for up to seven days on data that ages in one; the hub row claims it forever.
- Fix: pass `liveness` into `QueueRow`, and when `liveness.stale` render the verdict without the `.now` class plus the checked date ("on the shelf as of Aug 20"); in `readingRow()` in `src/app/page.tsx`, fetch liveness (fold it into one round trip, see P2-4) and either drop the "right now" phrasing when stale or shout the age the way `musicRow` does, which is the pattern this row lacks and needs more, not less, given the sync is manual.
- Verify: set `reading_sync.acquire_generated` back 8 days in a scratch copy or stub `getLiveness`; the badge must render un-green with a date, and the hub row must not say "right now".

### P1-2. /reading/about describes the retired /reading/all as one of "the four pages" and never mentions Want

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\reading\about\page.tsx` lines 38-44 and the metadata description on line 9.
- Evidence: `<li><strong>All books</strong>: everything scored, ranked. A book disappears from here the moment it enters the ten.</li>` on a page whose nav renders tabs Next up / Browse / Want / Finished. `/reading/all` was retired into the shelf on 2026-08-21 (`next.config.ts` 307) and the want list shipped the same day. The list also calls the third page "Shelf check" while every tab and title says "Browse".
- Why: the how-this-works page is the one page whose entire job is describing the app, and it describes an app that stopped existing five days ago; this is the "copy that explains a mechanism" drift the engineering doc names.
- Fix: rewrite the list to the four real pages (Next up, Browse, Want, Finished), describing Want as "costs nothing, evicts nothing" per the standing distinction, and align "Shelf check" naming with "Browse".
- Verify: every page name in the list matches a tab in the nav directly above it.

### P1-3. "Surprise me" picks from the current 50-row page, not from the filtered pool it claims

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\reading\shelf\page.tsx` lines 66-71 and 223-230.
- Evidence: `const picked = seed && entries.length ? entries[seed % entries.length] : null;` where `entries` comes from `qEntries(f)` which carries `limit ${PAGE_SIZE}` (50). The comment above it says "Picks one book from whatever is currently filtered, which is the point", and the clear link says "show all {total}". On the default browse (778 worth pulling, 16 pages, author sort) every pick lands on an author surname starting with A or B.
- Why: the feature's stated contract is the whole filtered set and its mechanism is page 1 of it, so 728 of 778 books can never be picked; the label and the comment are both false.
- Fix: when `pick` is set, replace the pick-from-page logic with a tenth lazy query in the existing `getShelfBundle` transaction, `... offset (seed mod total) limit 1` using the same `where`, or compute `seed % total` and reuse `qEntries` with that offset and limit 1; keep the seed-in-URL behaviour.
- Verify: with no filters, repeatedly following "Pick another" must eventually surface an author past the letter B.

## P2

### P2-1. sync-shelf.mjs silently drops key-colliding books while its comment claims it refuses

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\reading\sync-shelf.mjs` lines 81-86.
- Evidence: the comment reads "refuse on a collision rather than letting an upsert quietly drop a book", and the code reads `if (seen.has(key)) continue;`. Measured today: shelf-finder.json holds 7,552 books, `reading_shelf_entry` holds 7,548; the four dropped (Master of the Senate, Solitary, Sounds Wild and Broken, Robert Kennedy and His Times) never appear in any log line. The post-insert count check on line 137 can no longer fire because the collisions were consumed before insert.
- Why: today's four are case-variant duplicates upstream, so the drop happens to be right, but the mechanism cannot tell a duplicate from two different books sharing `surname|title`, and it reports nothing either way.
- Fix: on collision, compare the colliding rows; if title and author match case-insensitively, keep the higher-scoring one and count it, else throw. Print the collision count in the summary line so a jump is visible.
- Verify: run `--dry-run`; the summary must say "4 case-duplicates folded" (and the four upstream dupes deserve an ingest.mjs fold fix of their own, see P3-4).

### P2-2. AGENTS.md still says /reading is force-dynamic; it has been ISR 300 since commit 8963763

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\AGENTS.md` line 138 ("**`/reading`'s queue is `force-dynamic` on purpose.**"); `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\reading\page.tsx` line 22 (`export const revalidate = 300;`).
- Evidence: git log shows commit `8963763` ("Cache six pages: Active CPU passed the Hobby allowance") replacing `dynamic = 'force-dynamic'` with `revalidate = 300`, deliberately and with a good in-file comment. The binding doc was not updated.
- Why: a future session obeying AGENTS.md would "restore" force-dynamic and re-add the exact request-time cost that commit removed; the doc is now instructions for a regression.
- Fix: update the AGENTS.md paragraph to say ISR 300 and why (hand-run sync, five-minute lag is not staleness), keeping the build-route-table lesson (`ƒ` vs `○`) that paragraph carries.
- Verify: grep AGENTS.md for "force-dynamic" and confirm every mention matches the route's actual directive.

### P2-3. The queue page is four Neon round trips behind a Promise.all, with getLiveness itself two sequential queries

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\reading\page.tsx` lines 41-43; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\reading\queue-db.ts` lines 77-101.
- Evidence: `Promise.all([getQueue(), getAcquisitionMap(), getLiveness()])` where `getLiveness` awaits the ok-row query and then the error-row query. Round trips per render, counted per route today: `/reading` 4, `/reading/shelf` 1 (the bundle), `/reading/want` 1, `/reading/about` 1, `/reading/finished` and `/reading/[slug]` 0, hub `readingRow` 4 (see P2-4). `getShelfBundle`'s own header explains why the count of round trips, not the work, is the bill ("A `Promise.all` makes queries concurrent, not free"), and this page is the shape it warns about.
- Why: ISR 300 caps it at 4 round trips per five minutes so the cost is small, but it is the exact pattern the shelf page was rebuilt to eliminate, sitting one file away from the function that eliminates it.
- Fix: add a `getQueueBundle()` to `queue-db.ts` sending the four lazy queries through one `sql.transaction([...], { readOnly: true })`, same construction as `getShelfBundle`.
- Verify: `vercel.external_api_request.count` grouped by `origin_route` shows at most 1 per `/reading` regeneration.

### P2-4. The hub's reading row is four more un-batched round trips, every 60 seconds

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\page.tsx` lines 206-210.
- Evidence: `Promise.all([allPacks(), getQueue(), getAcquisitionMap(), getShelfStats(), getWantKeys()])`, of which four hit Neon. The hub carries `revalidate = 60`, and AGENTS.md's 2026-08-25 sweep found `/` was 67.1% of account CPU before its revalidate fix, so this route is the one already known to multiply per-render cost.
- Why: four round trips per hub regeneration for one row, when one transaction returns all of it, and the row needs `getLiveness` added anyway (P1-1), which would make it five.
- Fix: one `getReadingFrontRow()` in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\reading\shelf-db.ts` or `queue-db.ts` batching queue count, borrow-now count, shelf stats, want count, and liveness in one transaction; the row needs counts, not full rows, so the queries shrink too.
- Verify: external API requests for `origin_route /` drop by 3 per regeneration.

### P2-5. reading_catalog_entry is written by sync-catalog.mjs and read by nothing

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\reading\sync-catalog.mjs` (the whole entry-mirroring half); `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\reading\catalog-db.ts` lines 23-51 and 76-88.
- Evidence: the only imports from `catalog-db.ts` anywhere in `src/` are `getSourceLists` and the `SourceList` type (in `src/app/reading/about/page.tsx`). `getCatalogPage`, `getCatalogTrackCounts` and `getCatalogLiveness`, the only readers of `reading_catalog_entry` and `reading_catalog_sync`, have no callers. `catalogHref` in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\reading\catalog-types.ts` still builds `/reading/all?...` URLs nothing renders.
- Why: every catalog sync uploads ~7,000 rows to feed dead functions; the dead exports read plausibly and will tempt a future page into resurrecting the two-scores problem the 2026-08-21 rebuild killed.
- Fix: delete the dead exports from `catalog-db.ts` and `catalogHref`/`CatalogFilters`/`CatalogEntry`/`PAGE_SIZE` from `catalog-types.ts` (keeping `Track`, `trackLabel`); cut sync-catalog.mjs down to the `reading_source_list` mirror and rename or re-comment it accordingly; drop `reading_catalog_entry` and its indexes when convenient.
- Verify: `pnpm typecheck` clean; `/reading/about` still lists 55 sources.

### P2-6. sync.mjs re-implements refill.mjs's display sort, an admitted copy that will drift

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\reading\sync.mjs` lines 77-83; `C:\Users\sneyr\Desktop\HOODII\ReadingOS\scripts\refill.mjs` lines 408-414 and `LONG_PAGES = 600` on line 19.
- Evidence: both files carry `paceRank = { propulsive: 0, steady: 1, demanding: 2 }` and the heavy/pace/pages comparator; sync.mjs hardcodes `>= 600` where refill reads `LONG_PAGES`, and its comment admits "Same sort, copied from refill.mjs". The page's own header explains the stake: a second, disagreeing "the queue" is the drift this app exists to avoid.
- Why: change refill's sort or its 600 threshold and /reading silently stops matching QUEUE.md, the exact failure the sort was added to fix, reintroduced as a copy.
- Fix: have refill.mjs write the displayed order into queue.json (a `display_position` per entry, or emit `entries` already in display order with the selection order as a field), and make sync.mjs mirror it with no sort of its own. The ledger should carry its own rendering order; two files computing it is one going stale.
- Verify: reorder the comparator in refill.mjs on a branch and re-run both; /reading and QUEUE.md must agree without touching sync.mjs.

### P2-7. Accented surnames file under '#' on the letter rail

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\reading\sync-shelf.mjs` lines 68-71.
- Evidence: `const c = (fileUnder || '').charAt(0).toUpperCase(); return c >= 'A' && c <= 'Z' ? c : '#';`. Neon today: Énard (three rows) and Ōe sit under `#` alongside one garbage row. A shop shelves Énard under E; the page's stated job is walking the alphabet the way the aisle is walked.
- Why: the rail is the shop-floor feature, and a Spanish/translated-heavy corpus is exactly where diacritics appear; every such author is findable only by search or `#`.
- Fix: strip diacritics before the range test, same as ReadingOS `lib/keys.mjs` `strip()`: `const c = (fileUnder || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').charAt(0).toUpperCase();`. Keep `file_under` itself accented for display.
- Verify: after re-sync, `select letter from reading_shelf_entry where file_under like 'Énard%'` returns E, and the `#` bucket holds only genuine non-letters.

### P2-8. Two shelf controls sit under the 44px tap floor the same stylesheet declares

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\reading\reading.css` line 824 (`.wantbtn ... min-height: 32px`) and line 852 (`.pickbtn ... min-height: 40px`).
- Evidence: line 141 in the same file: "44px, the tap floor. Eight controls on this site were found under it by measuring every control on every page, so a new surface starts at the floor". The want button is the page's only write control, used one-handed in a shop.
- Why: the site's own measured standard, stated in the same file, is violated by the two most-pressed controls on the shelf.
- Fix: `min-height: 44px` on both; the row grid already gives the want row room.
- Verify: measure both in devtools at 390px; both boxes at or above 44px tall.

### P2-9. tierMeaning describes a mechanism the tiers do not use

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\reading\shelf-types.ts` lines 59-63; `C:\Users\sneyr\Desktop\HOODII\ReadingOS\scripts\build-shelf-finder.mjs` lines 116-137.
- Evidence: the legend says good means "more than one honour, or one honour it actually won" and grab means "vetted more than one way: a jury, critics and readers landing on it separately". The actual gate is `CUTS = [['grab', 0.02, 5], ['good', 0.10, 25]]`: top 2% / top 10% of each section by score, floor 5 / 25, with only a score > 0 requirement. A single strong honour in a small section can be grab; three honours can be maybe in a crowded one.
- Why: score correlates with the prose so it reads plausibly, but the legend is a definition and the definition is wrong; the first time Silvio checks a specific badge against its lists row the legend loses his trust.
- Fix: reword the legend to what the cut is: grab "the best of its section, top 2 percent by evidence", good "the next tier, top 10 percent of the section", maybe unchanged. Or, if honour-count semantics are wanted, change CUTS to implement them; either direction, one file must stop lying about the other.
- Verify: pick three grab and three good rows on the live shelf and confirm each matches the printed definition.

### P2-10. ingest.mjs and master.json have no shrink guard

- File: `C:\Users\sneyr\Desktop\HOODII\ReadingOS\scripts\ingest.mjs` lines 215-220.
- Evidence: `writeFileSync(join(ROOT, cfg.out), ...)` unconditionally. A source file that half-parses to a valid-but-small `entries` array (the class `fetch-award-sources.mjs` gates at ITS write, but `fetch-nyt-bestsellers.mjs`, `fetch-amazon-charts.mjs` and hand-edited sources are not behind that gate) or a deleted sources file shrinks master.json, then shelf-finder.json, then the site, with only the console count changing. sync-shelf's zero-row refusal does not fire on 7,552 becoming 4,000.
- Why: master.json is the accumulated artifact every downstream file regenerates from; the workspace rule after 2026-08-26 is that regeneration of an accumulated artifact refuses to shrink without --force.
- Fix: before writing, read the existing out file and refuse when `master.length` is below, say, 95% of the previous count, overridable by `--force` that names both numbers. Same for the per-track outs.
- Verify: temporarily empty one large source file and run `ingest.mjs all`; it must refuse rather than write.

## P3

### P3-1. The hub row hardcodes "55 published lists"

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\page.tsx` line 225.
- Evidence: `"${shelf.total.toLocaleString()} books scored from 55 published lists"` in a function whose own comment says "Writing a fact down here that a script did not just compute is the exact mistake that comment is about". Currently true (`reading_source_list` holds 55) and it goes stale the day source 56 lands. AGENTS.md line 90 already shows the drift: it still says 33.
- Fix: count `reading_source_list` in the same transaction P2-4 creates, or drop the number from the sentence.
- Verify: add-a-source dry run changes the rendered number with no code edit.

### P3-2. /reading/[slug] renders unknown slugs on demand

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\reading\[slug]\page.tsx`.
- Evidence: `generateStaticParams` exists but `dynamicParams` is left at its default (true), so `/reading/anything` invokes the function, reads the filesystem, and 404s. No DB cost and rule 4's burst limit caps abuse, but each probe is a billed invocation for a route whose full slug set is known at build.
- Fix: `export const dynamicParams = false;`.
- Verify: build route table shows the slugs prerendered; an unknown slug 404s without an invocation in the logs.

### P3-3. The locked want button drops the user's place

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\reading\shelf\WantButton.tsx` line 35.
- Evidence: `href="/kitchen/login?to=/reading/shelf"`, a fixed string; the user's search, letter, filters and page are lost on return.
- Fix: pass the current URL (`location.pathname + location.search` at click time) as `to`.
- Verify: sign in from a filtered view; land back on the same filtered view.

### P3-4. Upstream duplicate rows the fold missed, visible on the shelf

- Files: `C:\Users\sneyr\Desktop\HOODII\ReadingOS\scripts\ingest.mjs` (subtitleFold/fuzzyFold); data checked in `reading_shelf_entry`.
- Evidence: Énard carries both "Compass" and "Compass'Boussole" as separate rows; four case-variant duplicates ("Master of the Senate: the Years..." vs "...The Years...") survive to shelf-finder.json and are only removed by sync-shelf's silent skip (P2-1). One row files under "(writer)" with the title The Obama Inheritance, a parenthetical `dropParenthetical` did not catch.
- Fix: add "compass boussole" to `ALIASES` in `C:\Users\sneyr\Desktop\HOODII\ReadingOS\scripts\lib\keys.mjs` (or extend the fold to an apostrophe-joined translated title), and inspect the source entry behind "(writer)"; the merge-report near-misses list is the place these should already be surfacing.
- Verify: re-run `ingest.mjs all` and `build-shelf-finder.mjs`; shelf-finder count drops by the folded rows and no `file_under` begins with a parenthesis.

### P3-5. Small dead and stale fragments

- `isActionableNow` in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\reading\queue-types.ts` line 128 is exported and never called; `src/app/reading/page.tsx` line 96 re-derives it inline. Use it or delete it (P1-1's fix will rewrite this logic anyway).
- `pickedViaLabel` (same file, lines 95-116) still translates the quota vocabulary refill.mjs deleted on 2026-08-21 ('language floor', 'current quota', 'spread: ...'); harmless while old strings can persist in queue.json, worth a dated comment so nobody thinks the quotas still exist.
- `Track` in queue-types.ts lacks `'spanish'` while the unified pool contains Spanish books; if one enters the ten, `trackLabel[entry.track]` renders undefined. One union member and one label row.
- Stale counts in comments: `shelf-types.ts` lines 68-69 ("1,152 / 2,362", "96 books") and line 120 ("3,171 of 3,610") describe the pre-rebalance corpus; the table holds 7,548 today. Reword to avoid absolute counts.
- `reading.css` line 493 still titles a block "/reading/all: search, filters, pagination"; the classes are live on the shelf page, only the heading is stale.

## Crawl-cost shape (adversarial goal 2), verdict: covered today, with the notes above

- Every crawlable filter-state `<Link>` under /reading (`shelfHref`, the pager, `pickHref`, the letter rail, the sort menu, the filter chips) resolves to `/reading/shelf?...`, which firewall rule 3 challenges and `robots.ts` disallows and the page's own metadata noindexes. `/reading/want` emits zero filter links. `/reading` (queue), `/reading/about`, `/reading/finished` emit only fixed-URL links, and the first two are ISR so query-string walking hits cache.
- `/reading/all?...` legacy URLs 307 through `next.config.ts` with the query preserved, landing on the challenged path. The URL-building `catalogHref` is dead code (P2-5), so no page emits `/reading/all` links.
- The `pick=` LCG mints an effectively unbounded URL space on the shelf, and the URL-narrowing lesson ("naming paths one at a time loses") still stands: the protection is that the whole space lives under one challenged path. Any future page that lifts the pick or pager pattern onto an unchallenged route recreates the 178k-invocation shape; `/reading/[slug]` with `dynamicParams` unset (P3-2) is the only current route where a scraper can force per-URL invocations.

## Rendering modes (adversarial goal 8), all justified except the doc

| Route | Directive | Verdict |
|---|---|---|
| /reading | `revalidate = 300` | Right for a hand-run mirror; AGENTS.md says force-dynamic and is wrong (P2-2) |
| /reading/shelf | `force-dynamic` | Right; searchParams-driven, behind rule 3 |
| /reading/want | `force-dynamic` | Right; must reflect a want toggled seconds ago |
| /reading/about | `revalidate = 3600` | Right; changes a few times a year |
| /reading/finished | none (static) | Right; filesystem packs, changes only by deploy |
| /reading/[slug] | static via generateStaticParams | Right; add `dynamicParams = false` (P3-2) |
| /reading/api/want | `force-dynamic`, nodejs | Right; cookie-gated in `src/proxy.ts`, matcher covers `/reading/api/:path*` |

## What is actually good

- `getShelfBundle` in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\reading\shelf-db.ts` is the real thing: nine lazy queries, one `sql.transaction`, `readOnly: true`, a shared `where()` so the rail and the list cannot disagree, and a header that teaches the billing model to the next reader. The main surface costs one round trip per hit.
- Covers are plain `<img>` with fixed dimensions, lazy and async, served straight from covers.openlibrary.org: zero image transformations against the 5,000/month allowance, no reflow, and a labelled placeholder instead of a hole. The decision is written where the tag is.
- The write path is genuinely minimal and honest: one POST route, cookie-gated in proxy with the matcher actually naming it, an idempotent upsert so a double tap is not two rows, and a WantButton that distinguishes locked from failed and offers the way in.
- sync.mjs and sync-shelf.mjs both refuse zero-row writes, run full replaces inside transactions, count rows after insert, and log a liveness row on failure as well as success; the shelf page renders that liveness row instead of pretending.
- `content/reading/validate.mjs` runs in `pnpm build` and gates the exact silent failure that matters for recall decks (mis-sectioned cards, card-less sections, contiguity), with a header that explains what a mis-tag costs.
- Recall.tsx reads localStorage through `useSyncExternalStore` with a stable string snapshot, a same-tab change event, and try/catch on every access: the correct, boring solution, with the reasoning written down.
- The scoring rebuild held its line in the site repo: no weight, coverage table, rank multiplier or dedup fragment leaked into `src/` or the sync scripts; every score constant greps back to `C:\Users\sneyr\Desktop\HOODII\ReadingOS\scripts\lib\score.mjs`, whose table argues for itself line by line.
- The shelf's sort-as-mode design (letter rail only in author order, empty letters kept in place so the thumb map never shifts, 16px search input so iOS does not zoom, filter-panel state in the URL) shows measured phone-first decisions, each with its incident written beside it.
- `fetch-award-sources.mjs` gates on skipped ratio rather than raw count, writes raw captures first and parses from the file, and refuses winner inference where the page marks none.

## Severity counts

| Severity | Count |
|---|---|
| P0 | 1 |
| P1 | 3 |
| P2 | 10 |
| P3 | 5 |

Single most important: P0-1. The refresh pipeline that AGENTS.md tells every future session to run would today silently strip covers and descriptions from ~5,100 shelf rows, because `enrich-openlibrary.mjs` regenerates an accumulated artifact with no shrink guard.
