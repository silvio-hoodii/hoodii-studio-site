# hoodii.studio full-site audit, master index

Date: 2026-08-26 (Vercel report finished 2026-08-27 after a session-limit interruption).
Produced by eight parallel audit agents plus orchestrator verification. These reports are for
EXECUTOR agents: every finding carries file paths, quoted evidence, an exact fix, and a
verification step. Read the relevant report in full before executing anything in it.

**Scope exclusion: /swim.** Another agent owns it. Findings touching shared files
(`src/app/training.css`, `src/app/charts.css`, `src/lib/gym/week.ts`, `src/app/swim/api/baseline/route.ts`)
are marked "coordinate with swim agent" inside the reports. Do not edit swim routes from this audit.

## The reports

| Report | Scope | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| `01-hub-shell.md` | `/`, layout, /work, /callback, PSN/Spotify APIs, robots, sitemap, OG | 0 | 2 | 4 | 5 |
| `02-kitchen.md` | /kitchen pages, 5 write APIs, recipe pipeline, probe | 0 | 4 | 6 | 7 |
| `03-gym.md` | /gym pages, 6 write APIs, ladder, notes, probes | 0 | 3 | 6 | 10 |
| `04-reading.md` | /reading routes, shelf-db, ReadingOS sync pipeline | 1 | 3 | 10 | 5 |
| `05-small-apps.md` | /health, /music, /curio, /french | 0 | 2 | 7 | 11 |
| `06-security.md` | whole site: proxy, writes, injection, secrets, SSRF | 0 | 2 | 5 | 2 |
| `07-vercel-cost.md` | live metrics vs baseline, rendering modes, round trips | 0 | 1 | 3 | 5 |
| `08-ux-ui.md` | tokens, --signal, 390px screenshots, a11y, copy | 0 | 1 | 6 | 10 |

Raw total 1 P0, 18 P1. After deduplication (the same defect found from two angles), the distinct
count is 1 P0 and 15 P1. The overlaps are named below so no executor fixes the same thing twice.

## Verdicts in one paragraph each

**Security.** No exploitable hole found in the write surface: all writes gated in both the proxy
prefix check and the matcher, all 110 Neon queries are tagged templates, 235-commit public history
is clean of secrets. But the single gate that protects everything fails OPEN if
`KITCHEN_SESSION_SECRET` is ever unset, the deployed Next 16.2.6 has a published proxy-bypass
advisory (fixed in 16.2.11), and /kitchen/want serves an anonymous arbitrary-URL server-side fetch
(the security sweep missed it; the kitchen and Vercel audits found it and the orchestrator verified
it by reading `src/lib/kitchen/want.ts` lines 159-216).

**Vercel cost.** Inside Hobby limits today on every axis (~1.3% of invocations, ~15% of Active
CPU, ~1% of memory), and only because the firewall holds: meta-externalagent came back 08-22 to
08-24, burned 572,953 requests and a 9x-allowance monthly pace in three days, and was ended by the
deny rule. All four firewall rules verified byte-for-byte with zero drift. The one uncovered cost
door is /kitchen/want.

**Honesty of the pages.** The recurring defect class across five reports is present-tense claims
served off stale mirrors: the hub reading row says "right now" off a snapshot up to a week old, the
health and curio rows cannot tell "he stopped" from "the pipeline stopped", music writes its
known-data-loss warning where nothing reads it, and the French day resets at 18:00 Calgary because
it is computed in UTC. The site's stated posture is honest states only; these are the gaps.

**UX/UI.** The design system held: zero hardcoded colours, zero live em dashes, zero horizontal
scroll at 390px, measured on 12 live routes. The failures are discipline drift on the one chromatic
colour (a data-loss alarm painted in the healthy colour) and a family of sub-44px tap targets.

**Code quality.** The verbatim recipe pipeline survived adversarial reading. The write net is
intact. The debt is concentrated in un-batched Neon round trips (hub 30 per regeneration, gym plan
up to ~150 per page open, french 11 and music 18 per anonymous request) and in dead code
(PSN endpoints, /gym/api/next, two unimported dependencies, one unread table).

## Deduplicated cross-report themes

**T1. /kitchen/want, the one finding that is security AND cost at once.**
Sources: 02-kitchen P1-1, 07-vercel P1-1, orchestrator verification.
`src/lib/kitchen/want.ts` (wantByUrl) fetches any anonymous visitor's `?url=` over http/https with
a spoofed Chrome UA, a 20s timeout, no host allowlist and no private-address block, on a public
force-dynamic page linked with crawlable `?q=`/`?url=` hrefs from /kitchen and /kitchen/find. It
took 15,367 invocations during the scrape and sits outside firewall rule 3 (verified regex
`^/(reading/(shelf|want)|kitchen/find)`). The URL-fetch feature is deliberate (it exists so he can
point at NYT Cooking), so keep it, gate it. Composite fix, both halves:
(a) in-repo, class-eliminating: require the auth cookie for the `?url=` path (and the PasteBox
fetch path if any), rendering the paste box with a "log in" note otherwise; corpus search by `?q=`
stays public. (b) platform: extend firewall rules 3 AND 2 to
`^/(reading/(shelf|want)|kitchen/(find|want))`. The firewall edit is outside the repo and outside
any gate: confirm with Silvio before publishing, then curl-test both the should-block and
should-pass side per the AGENTS.md rule.

**T2. The gate that fails open.** Sources: 06-security P1-1 and P1-2.
`src/proxy.ts` compares the cookie with `===` against `process.env.KITCHEN_SESSION_SECRET`; unset
env var means `undefined === undefined` and every write route opens. One-line fail-closed fix.
Pair it with the Next upgrade to >=16.2.11 (published App Router proxy-bypass advisory
GHSA-6gpp-xcg3-4w24 against the exact component doing this gating). Upgrade via pnpm only, never
by editing package.json (the 2026-08-09 lockfile lesson).

**T3. Present tense off a stale mirror.** Sources: 01 P1-2 and P2-3, 04 P1-1, 05 H5 and C3 and M1.
One pattern fixes five findings: every mirror-backed row and badge needs the /music treatment
(a liveness row written by the pipeline, a shout past a threshold). Instances: hub reading row and
the green shelf badge (respect `getLiveness()` from `src/lib/reading/queue-db.ts`, which already
exists), hub swim row (export liveness, coordinate with swim agent), hub health row (sync
liveness), curio mirror (nothing shouts when writes stop), and music's saturation warning (written
into `music_sync.error` with ok=true, read by nothing; route it to the page and hub).

**T4. Regeneration without a shrink guard.** Sources: 04 P0-1 and P2-10, 05 C1 and C2.
The ONLY P0 of the audit: `ReadingOS/scripts/enrich-openlibrary.mjs` regenerates
`ReadingOS/data/all/enrichment.json` (6,569 books) from whatever pool it walked; the documented
refresh command walks 778, so following AGENTS.md today silently strips covers and descriptions
from ~5,100 shelf rows on next sync. `HealthOS/guard-regen.mjs` is the house pattern (refuse to
shrink, keep .prev, --force says so). Apply it to enrich-openlibrary.mjs, ingest.mjs/master.json,
and the curio mirror's parse path.

**T5. Un-batched Neon round trips.** Sources: 07 P2-1/P2-2/P2-3 and P3-2/P3-3, 02 P2-2, 03 P2-1, 04 P2-3/P2-4.
Neon is the entire External API Requests bill; `getShelfBundle` in
`src/lib/reading/shelf-db.ts` (9 became 1, verified live) is the house style. Targets in cost
order: /gym/api/plan (~150 per page open), hub `/` (30 per regeneration, 90% of remaining Neon
traffic, ~3 after batching per database), music (~18 per anonymous hit), french (~11), kitchen
(7, two of them the same stock_event scan run twice), reading queue page and hub row (4+4),
/api/music/sync (~110 sequential per cron run). A `Promise.all` is concurrency, not batching.

**T6. The day boundary is UTC in two apps.** Sources: 05 F1 and H3.
`src/lib/day.ts` exists precisely for this. French's 12-new-cards ceiling resets at 18:00 Calgary,
"reviewed today" and the streak bend after dinner, and the health "today" ring flips early. Route
every date-bucketing through the shared day helper.

**T7. His captured words go unread.** Sources: 03 P1-2, 02 P1-3.
Nine unhandled gym notes (eight from the 08-25 session, including program-defect reports) and one
kitchen `kind:"question"` from 2026-08-19 with no kitchen equivalent of
`scripts/gym-notes.mjs`. A prose rule already requires reading them and nobody did: build the
mechanism (the gym report proposes a SessionStart hook plus an on-page unhandled count; extend the
same to the cook log). A captured question nobody answers teaches him the box does nothing.

**T8. --signal discipline.** Sources: 08 P1-1/P2-2/P2-4, 05 H2 and M1.
The one chromatic colour is reserved for a value that is true right now. Violations: the music
data-loss alarm is painted with it (`src/app/music/music.css` lines 43-53, one-line fix to
`--destructive`), the health trend line is hardcoded to the good colour whichever way weight
moves, two "BORROW NOW" chips mean different facts distinguished by colour alone (add a text
carrier, also the colourblind fix), and navigation/category uses have crept in.

**T9. Fix the class with a gate, not the instance.** Sources: 08 P2-1/P2-5/P2-6/P2-3, 02 P2-1 and P2-4, 06 P2-3.
Per the workspace meta-law, these executor tasks are gate extensions, with today's instances fixed
under them: a lint-tokens colour gate (nothing currently blocks a hardcoded hex), a 44px tap-floor
probe check (seven instances today, plus gym set-row inputs at ~40px and two shelf controls), emoji
and Neon-delivered prose coverage in `scripts/lint-prose.mjs`, server actions added to the
write-route linter's scope (`src/app/kitchen/want/actions.ts` is a write channel no gate watches),
mechanizing more of the banned-cue table, and body-size caps on write routes.

**T10. Hand-typed facts on the hub.** Sources: 01 P2-1, 04 P3-1.
"55 published lists" is typed in a component whose own comment bans typed facts. Derive it from
`reading_source_list` in the same query batch T5 creates for the hub.

**T11. Deletions (verify each is a decision first, per the absence rule).**
Sources: 01 P2-2, 03 P3-3, 07 P3-1, 04 P2-5.
Dead public endpoints `/api/psn` and `/api/psn-image` (expired NPSSO, zero consumers),
`/gym/api/next`, dependencies `lucide-react` and `radix-ui` (zero imports in src, remove via
`pnpm remove` only), table `reading_catalog_entry` plus `content/reading/sync-catalog.mjs` (written,
never read), health `trend90` query (computed, never rendered).

**T12. Documentation drift.** Sources: 01 P2-4 and P3-1, 04 P2-2 and P1-2, 07 P3-4.
One pass over `AGENTS.md` and `/reading/about`: the surfaces table omits the four /work routes,
/reading is ISR 300 not force-dynamic (since commit 8963763), /reading/about still describes the
retired /reading/all and never mentions Want, plus three AGENTS.md spots the Vercel report names.

## Execution order for follow-up agents

Batch 1, before anything else (small diffs, highest stakes):
1. T2 fail-closed proxy fix + Next 16.2.11 upgrade (one branch, run the full verify gate).
2. T1a cookie-gate the /kitchen/want `?url=` path.
3. T4 shrink guard on enrich-openlibrary.mjs BEFORE anyone runs the documented reading refresh.
4. T1b firewall regex extension: needs Silvio's go-ahead, then curl-verify both directions.

Batch 2, the lies (each independent):
5. Gym plan API `rangeWidth` drop (03 P1-1, one file) and farmer-carry seconds-as-reps (03 P1-3).
6. T3 liveness shouts (hub reading row first, it is live today: snapshot was 6 days old at audit).
7. T6 UTC day boundary in french and health.
8. T7 note-surfacing mechanism for gym and kitchen, then actually answer the nine notes and the
   2026-08-19 blending-beer question in session with Silvio.
9. T8 signal-colour fixes (music alarm first, one line).
10. Kitchen step-dots overflow at 13+ steps (02 P1-4, gnocchi is offered today with 14) and stock
    confidence surfaced (02 P1-2).

Batch 3, the money (no allowance is burning today, so after the lies):
11. T5 round-trip batching, in the cost order listed.
12. T11 deletions, T10 derived hub fact.
13. Rendering-mode corrections from the 07 report's full table (music and french force-dynamic
    reconsideration lives there).

Batch 4, polish and gates:
14. T9 gate extensions with their instances.
15. Remaining P3s per report, plus T12 doc pass last (docs describe the code that exists after
    the batches, not before).

Constraints that bind every executor: read the finding in its source report first; never edit
package.json dependencies by hand; run `node scripts/verify.mjs` before any push and
`git pull --rebase origin main` first; probe rules in AGENTS.md apply (no POSTs to real APIs, new
write routes go in WRITE_ROUTES); no em dashes in anything rendered or written; coordinate-with-
swim-agent items stay untouched until that work lands.

## What held up (do not churn)

The write-gating net (all routes verified on all three lists), the recipe verbatim pipeline under
adversarial reading, the score formula's single home in `ReadingOS/scripts/lib/score.mjs` with zero
leakage, getShelfBundle's one-round-trip transaction (verified live at 9 to 1), plain-img covers
costing zero image transformations, the music death chain (throw-only client, row per run,
CRON_SECRET both ways, 36h shout), all four firewall rules byte-for-byte intact, crons exactly 8h
apart, `/` revalidate 60 and the static opengraph image, zero hardcoded colours, zero horizontal
scroll at 390px, zero live em dashes, and /work carrying zero availability claims (the clause 7(c)
check passed).
