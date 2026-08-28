---
date: 2026-08-26
scope: /kitchen app of hoodii.studio (src/app/kitchen/**, src/lib/kitchen/**, content/kitchen/**, scripts/probe-kitchen.mjs, src/proxy.ts as it touches /kitchen)
audience: executor agents
method: adversarial read-only audit. Ran validate.mjs and validate.mjs --strict (file reads only), one read-only SELECT on cook_log, and `vercel firewall rules inspect` (read-only). No writes, no builds, no POSTs.
---

# Kitchen audit, 2026-08-26

Named failures hunted, per the brief: the step an agent wrote, the ungated write, the beginner
trap, the combinatorial cost shape, the stale-confidence lie, the unanswered capture, DB round
trips, and 390px usability. Severity: P0 would burn a dish, write real data, or leak; P1 lies to
him or breaks mid-cook; P2 cost, debt, or drift; P3 polish.

## P0

None found. Every write route under `/kitchen/api` is gated by BOTH the path-prefix check
(`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\proxy.ts` line 72) AND `config.matcher`
(`'/kitchen/:path*'`, line 98). All five routes export POST only, the unlock route is exempted on
purpose, and `sameSite: 'lax'` on the `kos` cookie blocks cross-site POST CSRF. The probe
(`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\probe-kitchen.mjs`) installs its write
guard as a document-start script and refuses to run without it. Checked the 2026-08-11 defect
class directly: no offered card's step text contains a heat instruction, doneness cue, or number
that is not backed by `sourceText`, and strict validation exits 0 against the captures.

## P1

### P1-1. /kitchen/want is the same cost shape that cost 178K invocations, plus an open server-side fetch, and the firewall does not cover it

Evidence, verified against the LIVE firewall on 2026-08-26, not just AGENTS.md:

```
Rule: Filter surface cost gate
Conditions: path matches regex ^/(reading/(shelf|want)|kitchen/find)
```

`/kitchen/want` is not in that regex, is not in the robots Disallow list
(`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\robots.ts` line 81 lists only
`/kitchen/find`, `/reading/shelf`, `/reading/want`), is `force-dynamic`
(`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\kitchen\want\page.tsx` line 7), and
exposes its state as crawlable `<Link>` hrefs, which is the exact shape rule 3 exists for:

- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\kitchen\MealRow.tsx` lines 57 to 61
  and 144: every corpus row that is short something links to
  `/kitchen/want?url=<encoded publisher URL>`, and every cookable external row carries a second
  "check it against the kitchen" link to the same. That is thousands of distinct URLs across
  /kitchen and /kitchen/find.
- `want/page.tsx` line 184 links each search hit to `/kitchen/want?url=...`, and line 219 links
  the six example queries as `?q=`.

The aggravator that makes this worse than /kitchen/find ever was: `wantByUrl` in
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\kitchen\want.ts` (lines 159 to 216)
performs a live outbound `fetch` of ANY http/https URL in the query string, on a GET, with no
cookie, with a 20 second timeout. So each crawler hit boots a function, holds provisioned memory
for up to 20s waiting on a stranger's server, and makes hoodii.studio send an outbound request to
an attacker-chosen or crawler-chosen URL. The differing error strings ("answered 403" vs "Could
not reach that page" vs "carries no machine-readable recipe") also make it a status oracle for
probing arbitrary hosts from Vercel's IP space.

Why it matters: the 2026-08-24 incident was ten times the Hobby monthly allowance in twelve hours
on a surface with this shape, and this one adds an outbound fetch per hit.

Executor fix, three parts:
1. Edit firewall rule 3's regex to `^/(reading/(shelf|want)|kitchen/(find|want))`. Rule 2 (the
   `kos` cookie bypass) keeps it usable on his unlocked devices.
2. Add `/kitchen/want` to the disallow array in `src/app/robots.ts`.
3. In `wantByUrl`, reject non-default ports and literal-IP hosts (and `localhost`/`.internal`)
   before fetching; that closes the probing oracle without touching the legitimate use.

Verification: `curl -A "meta-externalagent/1.1" https://hoodii.studio/kitchen/want?url=...`
returns the challenge; the same URL from a browser with the `kos` cookie renders; a `?url=`
pointing at `http://127.0.0.1:9222` returns the "does not look like a web address" style refusal
without any fetch attempt.

### P1-2. Stock confidence (fresh/modeled/stale) is computed and consumed by NOTHING

`deriveStock` computes `conf` per row
(`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\kitchen\stock.ts` lines 179 to 183) and
`grep -rn "\.conf" src/app/kitchen src/lib/kitchen` finds zero readers. KitchenOS/DESIGN.md:
"Staleness is visible or it is a lie... Past ten days without confirmation the app says 'not
checked in N days' rather than asserting." HOODII/CLAUDE.md: "On a stale row, propose anyway and
say the assumption out loud." The propose-anyway half holds (usableIds ignores conf, correct);
the say-it-out-loud half does not exist anywhere in the rebuilt app.

The one line that gestures at it makes it worse: the stock receipt on
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\kitchen\page.tsx` (lines 257 to 262)
takes `Math.min(...ageDays)`, the MOST RECENTLY touched item, so "Stock last read today: 1 item
moved" renders while every other row can be three weeks unconfirmed, and the qualifying sentence
("Everything below assumes nothing has changed since") only prints on the 2-plus-days branch.

Why it matters: a "ready" badge built on a 20-day-old unconfirmed row is asserted as fact, which
is the project's own definition of a lie (the 2026-08-04 thirteen-untruths day is why `conf`
exists).

Executor fix: thread staleness to the two places a claim is made. (a) On the home receipt, count
rows instead of taking the min: "Stock last read today. N of M tracked items not confirmed in over
10 days." (b) In `findCandidates` in
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\kitchen\corpus.ts`, carry a
`staleDeps: string[]` per candidate (ids in `usesIds` whose `conf === 'stale'`) and render it in
MealRow the same way `needsThaw` renders: "assuming the ground beef from 15 days ago is still
there". Do not block anything on it.

Verification: any stock row with `ageDays > 10` produces the qualifier on rows that depend on it;
`node scripts/probe-kitchen.mjs` extended with a check that the string "not confirmed" appears
when the fold contains a stale row.

### P1-3. A captured question sits unanswered since 2026-08-19 and no mechanism will ever surface it

Read-only SELECT on `cook_log` (2026-08-26):

```
2026-08-19 00:21 | question | step 4 | Peruvian Arroz con Pollo |
  HIS WORDS: "the only thing I wasn't convinced about was blending the beer with the greens."
```

The card (`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\kitchen\recipes\arrozconpolloaji.json`)
has `build` and `readAt` of `2026-08-18c`, which PREDATE the question, so nothing has been folded
back. Step 4's `look` explains batching the blender jar and never answers his actual question (why
blend beer with the cilantro at all, what it does, whether the alcohol matters). The 00:43 note the
same night ("YIELD AND PROTEIN CORRECTED BY HIM, pack held TEN thighs and he used EIGHT") is also
newer than the card.

The standing rule (HOODII/CLAUDE.md): `kind:"question"` rows "must be answered in chat AND folded
into the step so he never asks twice." The gym learned this lesson FROM the kitchen and built
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\gym-notes.mjs` with a `--handled <id>`
flow; the kitchen has no equivalent script, no handled flag, and `recentNotes` in
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\kitchen\cook.ts` (line 25) shows only
the LAST 3 notes per dish, so three newer notes push an unanswered question off the only surface
that shows it. The note box's success copy ("It will be waiting next time you open this dish",
`CookClient.tsx` line 671) is therefore a promise with a three-note shelf life.

Why it matters: in the project's own words, a captured question nobody answers teaches him the box
does nothing.

Executor fix: build `scripts/kitchen-notes.mjs` mirroring gym-notes.mjs (list cook_log rows with
`kind in ('question','broke','confusing')` newer than each dish's `readAt`, plus a `--handled`
marker column or table), document "run it at kitchen session start" next to the gym rule in
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\AGENTS.md`, then answer the beer question, fold
it into step 4's `look`, and re-stamp build/readAt/readHash. Check the thigh-count correction
against `serves.proteinMath` (it computes from the FULL 1.427 kg pack) while there.

Verification: the new script lists zero unhandled rows after the fold; `node
content/kitchen/validate.mjs arrozconpolloaji` exits 0 with the new stamp.

### P1-4. The step-progress dots overflow the screen mid-cook on any recipe with 13 or more steps

`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\kitchen\kitchen.css`: `.kos .dots` is
`display: flex` with `gap: 3px` and no wrap (line 159); line 572 sets `.kos .dots button
{ min-width: 26px }` for tap targets. Flex items never shrink below min-width and the row has no
overflow container. At 390px the content column is 350px (20px padding each side), so 13 dots need
374px and 14 need 403px: the cook screen scrolls sideways. Gnocchi
(`content\kitchen\recipes\gnocchi.json`) is OFFERED with 14 steps today; piccata's page (18 steps)
is reachable. The probe never catches it because its 390px fit loop
(`scripts\probe-kitchen.mjs` line 287) visits only `/kitchen`, `/kitchen/find`, `/kitchen/shop`
and `/kitchen/want`, never a dish page, which is the one surface DESIGN.md says matters most.

Why it matters: horizontal page scroll on the one-step-fills-the-screen surface, operated with wet
hands, and the dots are also the step navigation.

Executor fix: add `flex-wrap: wrap` to `.kos .dots` (a second row of dots is honest and tappable),
or drop `min-width` to `(350 - 3*(n-1))/n` behavior by removing it and keeping only the `::after`
hit area, which already extends 22px vertically and 1px horizontally. Then add one dish page (use
the longest offered recipe, found dynamically) to the probe's fit loop.

Verification: `node scripts/probe-kitchen.mjs <base>` reports `/kitchen/gnocchi fits a 390px
screen` green, and red if the wrap is reverted.

## P2

### P2-1. Server actions are a write channel no gate watches

`src/proxy.ts` gates POSTs by URL prefix and every kitchen write lives under `/kitchen/api`. A
server action POSTs to the PAGE path (`/kitchen/want`), which passes the proxy (GATED_PAGES is
empty), passes the probe's write guard (it matches `/kitchen/api` in the URL,
`scripts\probe-kitchen.mjs` line 169), and is invisible to
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\lint-probe-routes.mjs`, whose API_ROOTS
list (line 28) covers gym and swim only and whose mechanism walks `route.ts` files that server
actions do not have. Today the only kitchen action is `checkPaste` in
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\kitchen\want\actions.ts`, which reads
(its own header says so, correctly). Nothing enforces that the SECOND action written stays a read.
This is the exact shape of the /swim matcher incident: a thing that reads as covered and is
covered by nothing.

Executor fix: a build-time lint (add to `verify.mjs` chain) that finds every `'use server'` file
under `src/app` and fails if it imports any writing module (`appendStockEvent`, `logShop`,
`logVeto`, anything from `lib/kitchen/cook.ts`, or `./db`'s `sql` directly) unless the file is on
an explicit allowlist with a stated reason. Cheap grep-level AST-free check, same posture as
lint-probe-routes.

Verification: temporarily add `import { logShop } from '@/lib/kitchen/list'` to actions.ts and
watch the lint fail; remove it and watch it pass.

### P2-2. /kitchen home issues 7 Neon round trips per render, two of them the same full stock_event scan

`src/app/kitchen/page.tsx` lines 150 to 157: the page awaits `deriveStock()`, `lastCookedMap()`,
`proteinToday()`, `getProteinTarget()`, `findCandidates()` and `vetoed()`; `findCandidates`
(`src/lib/kitchen/corpus.ts` line 240) internally awaits `deriveStock()` and `vetoed()` AGAIN.
Neither function is wrapped in React `cache()` (unlike `allRecipes`), so that is two full
`select ... from stock_event order by at asc` scans and two `dish_veto` scans per hit, 7 HTTP
round trips total. `/kitchen/shop` folds stock twice the same way (`shoppingView` and
`shoppingList` each call `deriveStock()`). The AGENTS.md lesson is verbatim: count round trips,
not work; every Neon query is a billable external API request and held memory.

Executor fix: wrap `deriveStock` and `vetoed` exports in `react`'s `cache()` (per-request dedupe,
zero staleness risk since both are already per-request reads). That alone removes 2 of 7 on the
home page and 1 of 3 on shop. Optionally batch the home page's remaining independent queries with
`sql.transaction` per the `getShelfBundle` precedent in
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\reading\shelf-db.ts`.

Verification: `vercel.external_api_request.count` grouped by `origin_route` drops for `/kitchen`
after deploy; or a one-line counter around `sql` in dev confirms 5 not 7.

### P2-3. "and N more" renders unguarded on the one-ingredient-short section

`src/app/kitchen/page.tsx` lines 421 to 433: the section renders when `missingOne.length > 0`,
slices 14 rows, and then prints `and {d.missingOne.length - 14} more.` UNCONDITIONALLY, so at 14
or fewer it prints "and 0 more" or "and -3 more". The sibling sections guard theirs
(`d.ready.length > 10` at line 401, `d.thaw.length > 8` at line 450). Today the bucket is in the
hundreds; the day a filter or an empty fridge shrinks it, the front page does arithmetic in public.

Executor fix: wrap the paragraph in `{d.missingOne.length > 14 && (...)}` exactly like line 401.

Verification: unit-level render or temporary `slice` change; the string "and 0 more" cannot occur.

### P2-4. The banned-cue table is only partially mechanized

`content\kitchen\validate.mjs` BANNED_CUE (lines 96 to 106) covers 9 phrases. The banned tables in
`C:\Users\sneyr\Desktop\HOODII\KitchenOS\DESIGN.md` also ban: "until golden brown" without a
comparison, "season generously/well", the water-flick oil test, "a knob", "a pinch" undefined, and
"a glug". Those rows currently execute nowhere, and the meta-law in
`C:\Users\sneyr\Desktop\HOODII\.agents\ENGINEERING.md` says a rule that does not execute is
decoration. Mitigation observed: every offered card that quotes such a phrase today annotates it
anyway (sesamechicken step 4 defines golden brown as "the colour of a digestive biscuit";
cottagecheesepancakes step 3 the same; checked directly), so this is drift risk, not a live defect.

Executor fix: add the missing rows to BANNED_CUE. The source-quote exemption path (in sourceText
AND text, plus a `look`) already exists, so publisher sentences keep standing and only an
unannotated quote or an agent invention fails.

Verification: validator exits 1 on a synthetic step saying "cook until golden brown" with no
`look`, and 0 once a `look` names the comparison; the current 27 strict recipes still pass.

### P2-5. Published sentences that never reach a step are a permanent warning nobody reads

The no-omission check (`validate.mjs` lines 587 to 614) is a WARN, deliberately, because headings
and conditions are indistinguishable in text. The result: the strict build carries 25 standing
warnings, among them two that are not headings:

- pastafrittata: "If you have sauced spaghetti: Heat the 4 ounces cold leftover spaghetti and two
  tablespoons of water..." (5 sentences). A CONDITIONAL branch of the method that never reaches
  the screen. His stock row is plain leftover spaghetti today, so the card is right for his
  kitchen, and the day the leftovers are sauced the card silently gives the wrong method.
- bananabread: "Bake the banana muffins for 30 minutes in the preheated 350F oven..." A
  temperature and a time (the muffin variant) reaching no step.

A warning that is always present is wallpaper; the repo has written this lesson down twice.

Executor fix: add `provenance.omittedOk: [...]` (exact sentence prefixes, acked with a one-word
reason each, e.g. "muffin-variant", "heading"), and promote unacked omissions to FAIL. The
standing 25 go to zero by acking, and the NEXT dropped condition fails the build instead of
scrolling past.

Verification: strict run prints 0 sourcing warnings; deleting one ack turns the build red.

### P2-6. The probe has no cook-screen coverage at all

`scripts\probe-kitchen.mjs` opens `/kitchen/want`, the three list pages, and `/kitchen/shop`. It
never opens a `/kitchen/[id]` page, so the two bugs that motivated its existence (its own header,
lines 5 to 12: the step-4 stale amounts row) have no regression test, and P1-4 above shipped
invisible. One tab opening the longest offered dish, walking two steps via the dots, and asserting
the amounts table and no sideways scroll would cover the class. The write guard already blocks
every `/kitchen/api` POST, so the debrief screen can be rendered (not submitted) safely.

Executor fix: add a dish-page section to the probe: open `/kitchen/<id>?step=2` for a known
offered dish, assert `.step` text is non-empty, assert `.amounts .row` count matches the step's
`uses` with amounts, assert no horizontal scroll, tap a dot, assert the URL's `?step=` moved.

Verification: the probe's own count goes from 20 checks to 25 or so and stays green; reverting the
P1-4 CSS fix turns exactly the new fit check red.

## P3

### P3-1. Dead code and a hand-maintained duplicate in shop.ts

`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\kitchen\shop.ts` line 8 reads
`stock/aliases.json` into `ALIASES` at module top level and never uses it (top-level await on
every cold start for nothing). Line 16's `STAPLE_IDS` is a hand-typed set of 14 stock ids whose
membership can drift from the real staples the moment a staple item is added to
`content/kitchen/stock/items.json`, which is the exact copy-goes-stale class the repo documents.
Fix: delete `ALIASES`; derive `STAPLE_IDS` from a `staple: true` property on the items catalogue
or export the set from `match.mjs`. Verify: typecheck plus the shop page still lists no staples
under idle.

### P3-2. finishCook is N+1 sequential writes and a retry double-logs the debrief

`src/lib/kitchen/cook.ts` lines 60 to 88: one cook_log INSERT then one awaited stock_event INSERT
per non-staple ingredient (a 10-ingredient dish is 11 round trips on the debrief tap, on aisle-
grade wifi). Not atomic: a failure mid-loop returns 500, the client keeps the text and offers
retry, and the retry inserts a SECOND cook_log debrief row (only protein_log has an upsert).
Fix: build the statements and send one `sql.transaction`. Verify: one network round trip in dev
tools per finish; a forced mid-transaction failure leaves zero rows.

### P3-3. MealRow prints the raw requirement key in substitution lines

`src/app/kitchen/MealRow.tsx` line 135 renders `${v.item} via your ${v.via}`; corpus.ts resolves
only `via` to a display name. Current substitute keys ('stock', 'tinned tomatoes') happen to read
as words; an item-id key would print an id. The want page already does it right
(`{v.item ? label(v.item) : v.shown}`). Fix: same expression in MealRow. Verify: find page rows
with substitutions show display names.

### P3-4. Login server action has no failure delay

`src/app/kitchen/login/page.tsx` signIn redirects instantly on a wrong password, while the unlock
route (`src/app/kitchen/api/unlock/route.ts` line 37) deliberately sleeps 600ms for exactly the
guessing-target reason. Same password, two doors, one throttled. Fix: same 600ms before the bad
redirect. Verify: wrong password takes visibly longer than a right one.

### P3-5. match.mjs CLI folds stock with its own simplified fold

`content\kitchen\match.mjs` lines 689 to 705 reimplement stock folding (a `froze` event reads as
usable, seed `frozen` counts as available, no use-by handling). Right-ish for "do I need to shop",
and it is a second implementation of a question `deriveStock` answers, which is the two-copies
class this repo keeps paying for. CLI-only blast radius. Fix when touched next: have the CLI print
its fold's assumptions, or read the app's fold via a small exported helper.

### P3-6. missingTwo is computed and rendered nowhere

`src/lib/kitchen/corpus.ts` line 507 filters and sorts the 2-missing bucket on every request of
every corpus surface, and no page renders it (the "up to 2 missing" chip filters `all` instead).
The repo's own history calls a computed-and-unrendered bucket a bug shape. Fix: delete it, or
render it. Verify: grep for `missingTwo` consumers stays empty after deletion, typecheck passes.

### P3-7. The note box promise outlives its surface

`CookClient.tsx` line 671: "It will be waiting next time you open this dish" is true only while it
is among the dish's 3 most recent notes (`recentNotes(recipe.name, 3)`). Covered properly by the
P1-3 mechanism; if that is deferred, raise the limit for `kind='question'` rows or soften the copy.

## What is actually good, so nobody "fixes" it

- **The annotation layer on offered cards is the best writing in the app.** Spot-checked the
  banned-cue sites directly: "until fragrant" on arrozconpolloaji step 3 gets "UNTIL FRAGRANT IS
  HER PHRASE AND IT IS NOT A TEST YOU CAN PERFORM" plus a look-based endpoint; golden brown is
  defined twice as "the colour of a digestive biscuit"; sesamechicken step 4 pairs the crust test
  with a 165F probe and names the 2026-08-16 failure it prevents. Do not compress these; length is
  not a cost here by explicit rule.
- **The verbatim pipeline held under adversarial reading.** Text-inside-sourceText,
  sourceText-inside-capture, capture hashes, readHash, the frozen `_migration` backlog, and the
  heatFree cross-check close every loop the 2026-08-11 incident named. I looked for a number or an
  instruction on an offered card that the capture does not carry and found none.
- **The proxy gate is real in both places.** Prefix AND matcher, the /swim lesson applied. The
  unlock exemption is documented and rate-limited by a deliberate delay.
- **Timers are end-timestamp based, kitchen-scoped, and carry their step text and doneness with
  them.** The rail answers "what was this for" without navigation, wake lock is held only while
  something runs, and the alarm's fire-on-return behavior is documented as honest rather than
  patched over. One dish at a time survives: nothing anywhere builds an interleaved timeline.
- **Dimmed-not-hidden and the veto fold both honor the 2026-08-09 rule.** Blocked and unread
  dishes stay reachable; a veto is append-only with the undo beside it.
- **Absences that are decisions, do not restore:** plain `<img>` instead of next/image (Hobby
  transform allowance, stated at both call sites); `localStorage` deliberately not used for step
  position (a laptop must never scroll the phone, the sync table in DESIGN.md); shop ticks not
  synced; no dark mode; `confirm` has no UI tap on purpose (stock.ts line 138 says revisit before
  adding one); the kitchen probe's blanket write guard instead of a WRITE_ROUTES list is the
  stronger mechanism, not a gap in lint-probe-routes.

## Severity counts

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 4 |
| P2 | 6 |
| P3 | 7 |

Single most important: P1-1, `/kitchen/want` is an unchallenged, crawlable, force-dynamic URL
space that makes a live outbound fetch per hit; one regex edit to live firewall rule 3 covers it.
