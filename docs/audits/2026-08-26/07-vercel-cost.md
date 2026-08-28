---
audit: vercel cost and performance
date: 2026-08-27
window_requested: 2026-08-20T05:43:26.617Z to 2026-08-27T05:43:26.484Z
window_with_data: 2026-08-22T08:00:00.000Z to 2026-08-27T05:00:00.000Z
post_block_window: 2026-08-25T00:00:00.000Z to 2026-08-27T05:43:26.484Z (2.24 days)
team: team_7KuPUvWnDMCCgHNvPsrVNnBE
project: hoodii-studio-site (prj_byNAjFxFkJe1btfmMIGhBhv1Sk02)
verdict: INSIDE Hobby limits in the post-block steady state; the firewall is the only reason
---

# Vercel cost and performance audit, 2026-08-26/27

Read-only audit. No source edits, no builds, no firewall or project-setting changes. All live
numbers come from `MSYS_NO_PATHCONV=1 vercel api /v2/observability/query -X POST --input body.json`
with `scope: {type:"owner", ownerId:"team_7KuPUvWnDMCCgHNvPsrVNnBE"}`, `aggregation:"sum"` passed
explicitly, and the response value field asserted to end in `_sum` before summing (the
`aggregation` trap in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\AGENTS.md` was honoured;
every number below came out of a field literally named `vercel_..._sum`).

Three measurement caveats, named so a future session does not re-derive them:

1. **Retention truncated the window.** The query asked for 7 days; every bucket before
   2026-08-22T08:00Z is zero across every metric, so the effective data window is ~4.9 days. All
   "window totals" below are over that shorter span.
2. **The query API returns at most ~10 groups in `summary`.** Absence from a grouped table is NOT
   zero. This matters once below: `/kitchen` does not appear in the full-window external-API table
   (cutoff was 990) despite 8,537 invocations, so its scrape-time Neon count is not directly
   measurable from that summary. Post-block it does appear (112 calls over ~29 renders, ~4 per
   render, consistent with the code). The most likely reading is that scrape-time renders often
   aborted before their sequential awaits ran, but that is an inference, not a measurement.
3. **`vercel.request.count` grouped by `waf_action` over the full window 408-timed-out twice.**
   It succeeded over 2026-08-25T00:00Z to now, and `vercel.firewall_action.count` grouped by
   `waf_action, waf_rule_id` succeeded over the full window. Both are reported; the full-window
   per-action request split is the one gap.

## 1. Measured reality vs the 2026-08-25 baseline

### The headline: the scraper came back, and the firewall ended it

`vercel.request.count` grouped by `project_name, bot_name` (7-day body, `body-req_bot.json`):

| bot_name | window total | 08-22 | 08-23 | 08-24 | 08-25 | 08-26 | 08-27 (partial) |
|---|---|---|---|---|---|---|---|
| meta-externalagent | 572,953 | 116,763 | 167,913 | 268,957 | 5,248 | 14,072 | 0 |
| (no bot name) | 44,643 | 3,453 | 39,676 | 586 | 224 | 433 | 271 |
| facebookexternalhit | 1,586 | 238 | 323 | 322 | 322 | 311 | 70 |
| meta-webindexer | 147 | 0 | 0 | 0 | 0 | 147 | 0 |

`vercel.function_invocation.count` grouped by `project_name, route` (`body-fi_route.json`), top
routes and the daily series for the top one:

| route | window total |
|---|---|
| /reading/shelf | 479,696 |
| /kitchen/find | 24,593 |
| /kitchen/want | 15,367 |
| /kitchen | 8,537 |
| /kitchen/shop | 8,322 |
| /gym | 3,640 |
| /reading/want | 3,068 |
| /index.segments/_tree.segment | 1,063 |
| / | 989 |
| **site total** | **546,716** |

/reading/shelf daily: 75,387 (08-22), 165,850 (08-23), 238,458 (08-24), then **1** on 08-25 and
**0** since. The deny rule published 2026-08-24/25 did exactly what its writeup claims.
meta-externalagent still probes at up to ~14k requests/day (08-26) and every one is denied at the
edge with zero function invocations behind it.

### Post-block steady state vs the baseline vs Hobby

Post-block window: 2026-08-25T00:00Z to 2026-08-27T05:43Z, 2.2385 days, computed by splitting the
saved time-bucketed responses at the cutoff (not re-queried).

| Resource | Post-block measured | Projected / month | Baseline 2026-08-25 | Hobby allows | Verdict |
|---|---|---|---|---|---|
| Function invocations | 962 | ~12,900 | ~33,000 | 1,000,000 | 1.3% of allowance |
| Active CPU | 161,040 ms | ~0.60 CPU-hr | ~1.0 CPU-hr | 4 CPU-hr | 15% |
| Provisioned memory | 0.284 GB-hr | ~3.8 GB-hr | ~7 GB-hr | 360 GB-hr | ~1% |
| Fast data transfer | 20.1 MB | ~0.27 GB | ~0.8 GB | 100 GB | 0.3% |
| Image transformations | 0 | 0 | ~111 | 5,000 | 0% |

**Inside Hobby on every axis, and at or below the 2026-08-25 baseline on every axis.** Nothing is
trending up. The invocation and CPU projections are below baseline mostly because the baseline's
13-hour window included more of Silvio's own use plus residual bot traffic.

For contrast, the three scrape days (08-22T08:00Z through 08-24): 545,754 invocations, 3.63 CPU-hr,
33.9 GB-hr, 4.43 GB FDT. At monthly pace that is ~5.5x the invocation allowance, ~9x the CPU
allowance, and ~94% of the memory allowance. **The Hobby plan is viable only while the firewall
stands.**

### External API requests (this is the Neon bill)

`vercel.external_api_request.count` grouped by `project_name, origin_route`
(`body-ext_route.json`), window total 3,304,660:

| origin_route | window | post-block (08-25 to now) |
|---|---|---|
| /reading/shelf | 3,207,362 | 1 |
| /index.segments/_tree.segment | 31,890 | 270 |
| / | 29,608 | 11,618 |
| /kitchen/find | 16,485 | 0 |
| /gym | 10,820 | (below group cap) |
| /kitchen/want | 2,367 | 0 |
| /gym/api/plan | 2,056 | 330 |
| /api/music/sync | 1,822 | 809 |
| /kitchen | (below group cap) | 112 |

Grouped by `request_hostname` post-block: 13,927 to `api.us-west-2.aws.neon.tech`, 71 to
`api.spotify.com`, 25 to `accounts.spotify.com`, 6 to `www.bbcgoodfood.com`, 4 to
`www.budgetbytes.com`. The Neon share is 99.2%; the bbcgoodfood/budgetbytes rows are
`/kitchen/want?url=` doing live outbound fetches (see finding P1-1).

Two things this table proves live, not from reading code:

- **`getShelfBundle` works as billed.** /reading/shelf ran 8.8 Neon calls per hit on 08-22 and 9.0
  on 08-23 (the nine-query shape), 4.4 on 08-24 (the transaction shipped mid-scrape), and exactly
  1 per hit since. The house pattern in
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\reading\shelf-db.ts` is verified in
  production.
- **The hub `/` makes exactly 30 Neon round trips per render.** 29,608 / 989 = 29.9 and the RSC
  segment route 31,890 / 1,063 = 30.0, and the static count of `sql` calls reachable from
  `src/app/page.tsx` is also exactly 30 (breakdown in section 4). Post-block, the hub plus its
  segments are 11,888 of 13,224 external calls: **90% of all remaining Neon traffic is the front
  page regenerating.**

### Firewall: zero drift

`vercel firewall overview`: enabled, 4 active rules, 0 inactive. `vercel firewall rules ls` and the
full config via `vercel api "/v1/security/firewall/config?projectId=...&teamId=..."`:

| # | Rule | Verified condition | Action |
|---|---|---|---|
| 1 | Block AI training crawlers | `user_agent` `re` `.*(meta-externalagent|GPTBot|ClaudeBot|Bytespider|CCBot|PerplexityBot|Amazonbot|Applebot-Extended|Google-Extended|Diffbot|Omgilibot|ImagesiftBot|Timpibot|Webzio-Extended|anthropic-ai|cohere-ai).*` | deny |
| 2 | Unlocked device bypass | path `re` `^/(reading/(shelf|want)|kitchen/find)` AND cookie `kos` exists | bypass |
| 3 | Filter surface cost gate | path `re` `^/(reading/(shelf|want)|kitchen/find)` | challenge |
| 4 | Document burst limit | path NOT prefix `/_next/` | rate_limit 150/60s per IP, then challenge |

All four match the documented intent, rule 1 uses `re` (the `inc` trap is not present), and the
actions fired in the window (`vercel.firewall_action.count` by `waf_action, waf_rule_id`): 15,925
deny by rule 1, 4,687 challenge by rule 3, 887 deny + 437 challenge by `sys_dos_mitigation`,
111,399 allow. Post-block `vercel.request.count` by `waf_action`: 16,062 deny, 3,442 challenge,
773 allow, 1 bypass. **No modification made or needed.** One open question deliberately left
unanswered rather than guessed: whether a firewall-denied request counts toward the Hobby edge
request allowance was not verified in this audit; at the observed ~14k denies/day it would still be
under half the 1M/month edge allowance even if it does.

### Function errors

`vercel.function_invocation.count` grouped by `http_status`: 546,579 x 200, **120 x 500 (all on
2026-08-23, during the scrape), 4 x 404. Zero non-200s post-block.** Window error rate 0.023%;
current error rate 0 of 962.

### Crons (task F)

`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\vercel.json`: `/api/music/sync` at `0 7 * * *`,
`0 15 * * *`, `0 23 * * *`. 07:00, 15:00, 23:00 UTC are exactly 8 hours apart; three once-per-day
entries, legal on Hobby (100 once-per-day jobs allowed). Invocation cost ~93/month, negligible. The
route requires `CRON_SECRET` and 500s loudly without it (verified in
`src/app/api/music/sync/route.ts`). What is not negligible in shape (though bounded in size): each
run makes ~110 sequential Neon round trips (finding P3-2).

## 2. Findings by severity

### P0 (blowing an allowance now): none

Post-block, every metric is 15% of allowance or less. The scrape days were a P0 in progress and the
firewall ended it; nothing is burning today.

### P1 (will blow an allowance on the next scraper)

**P1-1. /kitchen/want has the documented crawl shape, triggers live outbound fetches of arbitrary
URLs, and is NOT behind firewall rule 3.**

- Evidence: `src/app/kitchen/want/page.tsx` line 7 `export const dynamic = 'force-dynamic'`; lines
  184 and 219 render `<Link href={"/kitchen/want?url=..."}>` and `<Link href={"/kitchen/want?q=..."}>`,
  so the page emits crawlable hrefs into its own parameter space. No cookie needed. Rule 3's
  verified regex `^/(reading/(shelf|want)|kitchen/find)` does not match it. `wantByUrl` in
  `src/lib/kitchen/want.ts` (line 159) fetches whatever `?url=` names, with a 20 second timeout per
  the kitchen auditor, so one anonymous GET can hold a function instance open for up to 20 seconds
  of billed provisioned memory while this site crawls someone else's. Measured: 15,367 invocations
  in the scrape window, the third highest route on the site, and 10 live fetches to
  bbcgoodfood/budgetbytes appear in the post-block `request_hostname` table.
- Why: this is exactly the class AGENTS.md rule 3 exists for, found on `/kitchen/find` 2026-08-20
  and `/reading/shelf` 2026-08-21; naming paths one at a time keeps losing, and this is the third
  instance.
- Fix (executor): extend BOTH rule 3 and rule 2 path regexes to
  `^/(reading/(shelf|want)|kitchen/(find|want))` (rule 2 must move in lockstep or the `kos` bypass
  stops covering the page). Test both directions with curl per the AGENTS.md procedure: a plain UA
  on `/kitchen/want?q=x` should get the challenge, the same request with the `kos` cookie should
  pass. The durable fix beyond path-naming: rule 4 already backstops at 150 req/min/IP, but a
  patient single-IP crawler at 149/min on a 20-second-fetch page is ~9 GB-hr/day of held memory, so
  the path gate is still worth having.
- Verification: re-pull `vercel.function_invocation.count` grouped by route after the next bot
  wave; /kitchen/want should pin near zero the way /reading/shelf did on 08-25 (479,696 to 1).

### P2 (paying for nothing)

**P2-1. The hub `/` makes 30 Neon round trips per regeneration, sequential within each row
function, and is now 90% of all remaining Neon traffic.**

- Evidence: measured 29.9 to 30.0 external calls per render (tables above); static count agrees:
  kitchenRow 1, gymRow 5, healthRow 4, frenchRow 9, curioRow 2, musicRow 3, swimRow 2, readingRow 4
  (section 4). `src/app/page.tsx` line 45 `revalidate = 600` caps regenerations (right, and left
  alone), but each regeneration crosses the network 30 times where `getShelfBundle` proved the same
  work fits in one or two transactions.
- Why: round trips, not work, are the External API Requests line and the memory-held-open time; the
  page's own comment calls it "ten data calls" and it is thirty.
- Fix (executor): a `getHubBundle` in the `src/lib/reading/shelf-db.ts` style. Caveat the shelf
  page did not have: the hub spans TWO databases (`DATABASE_URL` for gym/health/french/curio/
  music/swim/reading, `KITCHEN_DATABASE_URL` for the kitchen row, and protein reads
  `HEALTH_DATABASE_URL` with fallbacks per `src/lib/kitchen/protein.ts` lines 30-33), and
  `sql.transaction` batches only queries built from the same client. One transaction per database
  gets 30 down to about 3.
- Verification: `vercel.external_api_request.count` grouped by `origin_route`; `/` should drop from
  ~30 to ~3 per render (post-block daily from ~5,000 to ~500).

**P2-2. /french renders 10 Neon round trips per anonymous request, force-dynamic.**

- Evidence: `src/app/french/page.tsx` line 8 awaits `getSummary()` (9 concurrent `sql` calls,
  `src/lib/french/db.ts` lines 245-253 including `getState` and `getStreak`) plus `getActivity()`
  (1). force-dynamic is correct (the page reads `cookies()`), but 10 round trips per public GET is
  the pre-fix shelf shape. Not currently hot (below the group cap all window), and rule 4 caps the
  burst, but it is the most round trips of any request-time page.
- Fix (executor): same-file `sql.transaction` bundle, 10 to 1. All ten queries are independent
  reads.
- Verification: `origin_route=/french` external calls per invocation drops to ~1.

**P2-3. /music is force-dynamic with ~18 Neon round trips plus a live Spotify token exchange and
now-playing call on every anonymous request, for data that changes three times a day.**

- Evidence: `src/app/music/page.tsx` lines 30 and 66-73: `getNowPlaying(await getAccessToken())`
  server-side per request, then summary (3 calls incl. liveness), recent (1), mostPlayed (2), and
  `getLatestTop` x 6 combinations x 2 calls = 12. The history table only moves when the cron runs
  (07:00/15:00/23:00 UTC). A bot walking /music burns two Spotify API calls per hit against
  Spotify's rate limit as well as the memory-wait.
- Fix (executor): the site already solved this exact split on the hub: `NowPlaying` in
  `src/components/NowPlaying.tsx` is a client component fetching `/api/spotify` (which sets its own
  s-maxage=60). Use it on /music, drop the server-side Spotify calls, set `revalidate = 600`, and
  bundle the ~16 chart queries into one transaction.
- Verification: build route table shows /music as ISR; `origin_route=/music` external calls per
  render ~1; `api.spotify.com` calls per /music page view 0 (the /api/spotify route carries them,
  cached 60s).

### P3 (tidiness)

**P3-1. Two dependencies ship in `package.json` with zero imports anywhere in `src/`:**
`lucide-react` and `radix-ui` (grep for `from 'lucide-react'`, `from 'radix-ui'`, `from '@radix`
found nothing). Dead weight in install and lockfile, not in the client bundle (tree-shaken /
unimported). Fix: `pnpm remove lucide-react radix-ui` (never hand-edit `package.json`; the
2026-08-09 frozen-lockfile incident in AGENTS.md is the mechanism that catches doing it wrong).
Verification: `pnpm build` green, deploy not refused.

**P3-2. `/api/music/sync` makes ~110 sequential Neon round trips per run.** Measured: 1,822
external calls over ~16 runs. Code: `insertPlays` one INSERT per row in a loop (up to 50,
`src/lib/music/db.ts` lines 34-49), `replaceTop` one DELETE plus one INSERT per row for 6
(kind, range) pairs (lines 53-68). Bounded (3 runs/day, ~10k calls/mo) so it costs cents of
nothing, but it is the same class as P2-1 and each run holds the function open for the whole
sequential chain. Fix when touched next: multi-row VALUES or `sql.transaction`. Verification:
`origin_route=/api/music/sync` drops to ~10/run.

**P3-3. /kitchen executes `deriveStock` twice and `vetoed` twice per render.**
`src/app/kitchen/page.tsx` lines 150-157: the page awaits `deriveStock()` and `vetoed()` directly
AND calls `findCandidates()` which awaits both again (`src/lib/kitchen/corpus.ts` line 241).
Neither is wrapped in React `cache()` (only `recipes.ts` is). ~7 round trips where ~5 would do, on
a page only Silvio loads. Fix: wrap `deriveStock` and `vetoed` in `cache()` from react, which
dedupes within one render without changing any call site. Verification: `origin_route=/kitchen`
external calls per render drops by 2.

**P3-4. Doc drift in AGENTS.md against the code, three spots.** (a) "/reading's queue is
force-dynamic on purpose": `src/app/reading/page.tsx` line 22 is `revalidate = 300` with a comment
explaining the change; (b) the baseline note says `/` carries `revalidate = 60`: line 45 is 600,
raised 2026-08-25 per its own comment; (c) rule 3's documented path list will need
`/kitchen/want` after P1-1 lands. One editing pass over
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\AGENTS.md` fixes all three.

**P3-5. /gym ships ~120 KB of program JSON in the RSC payload per load.**
`src/app/gym/page.tsx` line 29 passes `program` (content/gym/program.json, 114 KB) plus warmups,
cooldowns and rirGuide into the client `GymClient`. The client genuinely needs the program to run
the workout offline-ish between sets, FDT is at 0.3% of allowance, and the only viewer is Silvio,
so: noted, no change recommended. Recorded so a future "why is /gym's payload big" question costs a
lookup instead of an investigation.

### Severity count

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 1 |
| P2 | 3 |
| P3 | 5 |

## 3. Rendering-mode table (every route under src/app)

Derived from the code (the `export const dynamic` / `revalidate` sweep plus reading each page), NOT
from a build route table; no build was run because parallel agents share `.next`.

| Route | Mode (from code) | Data source | Data changes | Verdict |
|---|---|---|---|---|
| `/` | ISR 600 (`page.tsx:45`) | Neon x30 + fs | few times/day | RIGHT. Checked and left alone 2026-08-25; round-trip count is the finding (P2-1), not the mode |
| `/kitchen` | force-dynamic | kitchen Neon + fs corpus | when he taps | right (live tool); duplicate calls P3-3 |
| `/kitchen/[id]` | force-dynamic | fs recipe + stock + notes | live stock | right (cook screen) |
| `/kitchen/find` | force-dynamic | fs corpus + 2 Neon | live stock | right; behind rule 3; 60-135ms CPU/hit is the price of live scoring |
| `/kitchen/want` | force-dynamic | corpus + stock + live external fetch | live | mode right, **exposure wrong: P1-1** |
| `/kitchen/shop` | force-dynamic | stock + shop_item (3 round trips, deriveStock twice) | live | right |
| `/kitchen/login`, `/gym/login`, `/health/login`, `/french/login` | force-dynamic | none | n/a | right (cookie flows) |
| `/gym` | force-dynamic | 5 Neon + fs | live training | right |
| `/gym/conditioning` | force-dynamic | up to 4 Neon + fs | daily | right; `?p=&s=` is a finite ~15-URL space, rule 4 suffices |
| `/health` | ISR 1800 | ~10 Neon | 1x/day (07:15 sync) | right |
| `/french` | force-dynamic (reads cookies) | 10 Neon | live reviews | mode right; round trips P2-2 |
| `/curio` | ISR 3600 | 4 Neon | occasional mirror | right |
| `/music` | force-dynamic | ~18 Neon + live Spotify | 3x/day + now-playing | **should be ISR ~600 with client now-playing: P2-3** |
| `/swim` | force-dynamic | up to 4 Neon + fs JSON | daily sessions, rare plan edits | acceptable; ISR 300 would also be honest (the /reading queue took exactly that path); not worth churn while traffic is ~0 |
| `/reading` | ISR 300 (`page.tsx:22`) | 4 Neon | hand-run syncs | right (AGENTS.md description is stale: P3-4) |
| `/reading/shelf` | force-dynamic | **1 Neon transaction** | live filters | right; behind rule 3; the house-style exemplar |
| `/reading/want` | force-dynamic | 1 Neon | live | right; behind rule 3 |
| `/reading/about` | ISR 3600 | 1 Neon | rare | right |
| `/reading/finished` | static (no directive, fs only) | packs JSON at build | on deploy | right (data ships with the repo) |
| `/reading/[slug]` | SSG (`generateStaticParams`) | packs JSON | on deploy | right |
| `/work/{themoment,versatile,brixel,kitchen}` | static (no directive, no data) | inline | on deploy | right |
| `/callback` | force-dynamic | search params | n/a | right |
| `/opengraph-image` | static (checked 2026-08-25, left alone) | inline | on deploy | right |
| `/api/music/sync` | force-dynamic route, CRON_SECRET | Spotify + Neon | cron 3x/day | right (P3-2 is round trips, not mode) |
| `/api/spotify`, `/api/psn`, `/api/psn-image` | force-dynamic routes | external APIs | live | right (spotify sets s-maxage=60) |
| write APIs: `/kitchen/api/*`, `/gym/api/*`, `/french/api/*`, `/reading/api/want`, `/swim/api/baseline` | force-dynamic, cookie-gated via `src/proxy.ts` (matcher verified lines 95-105, includes `/swim/api/:path*`) | Neon writes | n/a | right |

Neither documented failure class is present today: no static-shaped page renders per request
(the two candidates, /music and /swim, are live-data pages whose mode is defensible and flagged
above), and no DB-backed page is prerendered static (the /reading queue class): every Neon-backed
page is either force-dynamic or ISR, and ISR regenerates against Neon.

## 4. Round-trip table (Neon HTTP round trips per render, counted from code)

Every un-transactioned `sql\`\`` awaited during a render is one HTTP round trip.
`Promise.all` makes them concurrent, not fewer: each still holds its own connection and its slice
of provisioned-memory wait. Flag threshold is >2 per the brief.

| Route | Round trips / render | Breakdown | Flag / fix |
|---|---|---|---|
| `/` | **30** (measured 29.9-30.0) | kitchenRow 1 (deriveStock) + gymRow 5 (getLastTrainingRow 1, getSessionDay 1, actualBlock 3) + healthRow 4 (latest 1, recent 1, trendAt x2) + frenchRow 9 (getSummary) + curioRow 2 + musicRow 3 (counts 1, liveness 2) + swimRow 2 + readingRow 4 (queue, acquisition, shelfStats, wantKeys) | **FLAG. P2-1: one transaction per database, ~30 to ~3** |
| `/french` | 10 | getSummary 9 + getActivity 1 | **FLAG. P2-2: one transaction** |
| `/music` | ~18 (+2 Spotify) | summary 3 + recent 1 + mostPlayed 2 + getLatestTop 6x2 | **FLAG. P2-3: transaction + ISR** |
| `/health` | 10 per regen | summary 4 + series x2 + adherence 3 + liveness 1 | flag, but ISR 1800 bounds it to ~48 regens/day worst case; batch only if touched |
| `/kitchen` | 7 | deriveStock x2, lastCooked 1, proteinToday 1, proteinTarget 1, vetoed x2 | flag. P3-3: React cache() dedupe, 7 to 5 |
| `/gym` | 5 | computeNextUp 2 (sequential) + streak 3 | flag, mild; his own tool, measured ~3/render live |
| `/gym/conditioning` | 4 (week tab) / 1 (others) | actualBlock 3 + recovery 1 | flag at boundary; fine |
| `/swim` | 4 (now tab) / 1 (plan) / 0 (how, teach, me) | pbs 1 + lastSession 1 + history 2, all concurrent | flag at boundary; fine |
| `/curio` | 4 per regen | summary 2 + digests 1 + items 1 | ISR 3600; fine |
| `/reading` | 4 per regen | queue 1 + acquisition 1 + liveness 2 | ISR 300; fine |
| `/kitchen/shop` | 3 | shoppingView deriveStock 1 + shoppingList deriveStock 1 + shop_item 1 | deriveStock twice; same cache() fix as P3-3 |
| `/kitchen/find` | 2 | deriveStock 1 + vetoed 1 | ok |
| `/kitchen/[id]` | 2 | stock 1 + recentNotes 1 | ok |
| `/kitchen/want` | 1 (+1 arbitrary external fetch on ?url=) | usableStock 1 | ok on Neon; the external fetch is P1-1 |
| `/reading/shelf` | **1** | getShelfBundle: 9 queries in one `sql.transaction` | the pattern everything above should copy |
| `/reading/want` | 1 | getWants | ok |
| `/reading/about` | 1 | getSourceLists | ok |
| `/api/music/sync` | ~110 per run (measured) | insertPlays up to 50 sequential + replaceTop 6x(1+N) + recordSync + newestPlayedAt | P3-2, bounded by cron |

Batching caveat that the shelf never faced: the site runs more than one Neon client
(`DATABASE_URL`, `KITCHEN_DATABASE_URL`, and protein's `HEALTH_DATABASE_URL` fallback chain), and
`sql.transaction` only batches queries built from the same client, so "one round trip" for the hub
means one per database.

## 5. Client bundle (task E)

- **No barrel-import problem exists**: `lucide-react` is installed but imported nowhere (P3-1 is
  to remove it, not to fix imports). No icon library is in use at all; the hub draws inline SVG.
- **No component library ships**: `radix-ui` also has zero imports (P3-1). `clsx`,
  `tailwind-merge`, `class-variance-authority` are utilities, fine.
- **Client components are few and sized to the job**: 15 files, the big ones being
  `src/app/gym/GymClient.tsx` (860 lines, genuinely interactive), `src/app/kitchen/[id]/CookClient.tsx`
  (858, the cook screen), `src/app/french/FrenchClient.tsx` (472). None is a server component
  wearing 'use client'; each holds real state (timers, set logging, review queue).
- **Content JSON to the client**: /gym ships ~120 KB of program/warmup JSON as props (P3-5, noted
  and accepted); /swim, /reading/shelf and /kitchen/find render their JSON server-side and ship
  HTML, which is the right direction.
- **Images**: `next.config.ts` has NO `images` config and the code uses plain `<img>` for every
  external image ON PURPOSE, with the reasoning written at each site
  (`src/app/reading/shelf/page.tsx:308`, `src/app/kitchen/MealRow.tsx:66`,
  `src/app/kitchen/[id]/CookClient.tsx:219`): hundreds of Open Library and recipe-site thumbnails
  through the optimizer would burn the 5,000/month transform allowance. Measured result: **0
  transformations this window** against 5,000 allowed. Open Library covers therefore never touch
  the transformer at all; there is nothing to fix and no remotePatterns needed.

## 6. What is actually good (do not churn)

- `/` with `revalidate = 600` and the static `/opengraph-image`: checked 2026-08-25, correct, left
  alone. The P2-1 batching recommendation changes how many times a regeneration crosses the
  network, not the rendering mode or its cadence.
- `getShelfBundle` (`src/lib/reading/shelf-db.ts`): verified live going from 9 to 1 round trips
  per hit mid-scrape. It is the reference implementation for P2-1/P2-2/P2-3.
- All four firewall rules: present, exact, using `re` not `inc`, and measurably working (479,696
  shelf invocations to 1 the day the deny landed; ~16k denies since with zero function cost behind
  them).
- The layered bot posture: robots.ts Disallow + per-page noindex + the firewall as the actual
  mechanism, with the honest writeup of which layer executes.
- Plain `<img>` for external covers/photos: 0 of 5,000 transforms used.
- Crons: three schedules exactly 8 hours apart, once-per-day each, CRON_SECRET required, failures
  return 500 so a dead Spotify token is loud.
- `src/proxy.ts` matcher covers every write API including `/swim/api/:path*` after the 2026-08-26
  move; pages stay public per the site's own design.
- Static where static is true: /work/*, /reading/finished, /reading/[slug] (generateStaticParams),
  and ISR with honest windows on /reading (300), /health (1800), /curio (3600), /reading/about
  (3600).

## Reproducing these numbers

Query bodies and raw responses are in the session scratchpad
(`C:\Users\sneyr\AppData\Local\Temp\claude\C--Users-sneyr-Desktop-HOODII\33473f63-48db-486e-b40d-7d5e6227db5d\scratchpad`,
`body-*.json` / `out-*.json`); the scratchpad is session-lived, so the durable recipe is: POST
`/v2/observability/query` with `{scope:{type:"owner",ownerId:"team_7KuPUvWnDMCCgHNvPsrVNnBE"},
metric:<id>, startTime, endTime, aggregation:"sum", groupBy:[...]}` for each of
`vercel.function_invocation.count` (by `project_name,route` and by `project_name,http_status`),
`vercel.function_invocation.function_cpu_time_ms` (by `project_name,route`),
`vercel.function_invocation.function_duration_gbhr`, `vercel.request.count` (by
`project_name,bot_name` and `project_name,waf_action`; the waf grouping 408s on windows much past
~2 days), `vercel.request.fdt_total_bytes`, `vercel.image_transformation.count`,
`vercel.external_api_request.count` (by `project_name,origin_route` and
`project_name,request_hostname`), and `vercel.firewall_action.count` (by
`project_name,waf_action,waf_rule_id`). Always filter rows to `project_name === "hoodii-studio-site"`,
assert the `_sum` field name, and remember the ~10-group summary cap.
