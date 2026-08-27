# Swim becomes the staple: kill the schedule, promote the tracker

**Written** 2026-08-26. **Status** PLAN, not executed. **Decided by Silvio in session:**

1. The pool schedule dies outright. Scrapers, scheduled task, Neon tables, page, all of it.
2. Swim leaves `/gym/conditioning` entirely. `/gym` keeps run, bike and lifting.
3. `/health` stops showing swim numbers and links to `/swim` instead.

He was told, and accepted, that killing the scrapers permanently removes the only answer to
"which Calgary pool has lane swim open right now". Nothing else produces it.

---

## What is being deleted, and what is being promoted

### Deleted: the schedule half

| Thing | Where |
|---|---|
| 6 scrapers, pools registry, `schedule.json`, `refresh.mjs`, HTML generator | `SwimOS/wedge/app/` |
| Reddit listener + hits log | `SwimOS/listening/` |
| 7-step consumer discovery docs | `SwimOS/discovery/`, `SwimOS/README.md` |
| Daily tick | `SwimOS/daily.mjs`, `run-daily.cmd`, `daily.log` |
| Scheduled task `HOODII-SwimOS-Daily` (05:30, next run 2026-08-27) | Windows Task Scheduler |
| Neon tables `swim_session`, `swim_coverage`, `swim_pool`, `swim_sync` | Neon |
| Mirror push | `content/swim/{schema.sql,sync.mjs,apply-schema.mjs}` |
| Read layer | `src/lib/swim/db.ts` |
| Schedule UI | `src/app/swim/page.tsx`, `PaceClock.tsx`, `swim.css` |
| Dangling DNS CNAME `swim.hoodii.studio` | Silvio's registrar. **His step, see below** |

**Vercel needs nothing.** Verified against the account on 2026-08-26: six projects exist
(`hoodii-studio-site`, `brixel-site`, `versatile-cpa`, `hoodii-platform-studio`,
`hoodii-platform-themoment-site`, `hoodii-platform-themoment-admin`). There is no `swimos`
project. It was deleted on 2026-08-16 and stayed deleted.

**DNS is the only thing still publicly reachable.** `swim.hoodii.studio` CNAMEs to
`c5d3cb28d8e670e2.vercel-dns-016.com` and serves a live `404 DEPLOYMENT_NOT_FOUND`. Removing that
one record needs the registrar login, so it is his. Record to delete: host `swim`, type CNAME,
zone `hoodii.studio`.

### Promoted: the tracker half

Already built, currently at `/gym/conditioning?p=swim` with five sub-tabs.

| Piece | Now | After |
|---|---|---|
| Tier ladder + PB standing | `src/lib/gym/swim-level.ts` | `src/lib/swim/level.ts` |
| Tier data | `content/gym/swim-standards.json` | `content/swim/standards.json` |
| Coach me | `content/gym/swim-coaching.json` | `content/swim/coaching.json` |
| Coach them | `content/gym/swim-teaching.json` | `content/swim/teaching.json` |
| The 10-week plan | `swim` block of `content/gym/conditioning.json` | `content/swim/plan.json` |
| Baseline input | `src/app/gym/SwimBaselineForm.tsx` | `src/app/swim/BaselineForm.tsx` |
| Baseline write | `/gym/api/swim-baseline` | `/swim/api/baseline` |
| Session charts | `src/app/gym/SessionCharts.tsx` | shared, see decision D2 |
| Swim history stats | `getSwimSummary` in `src/lib/health/db.ts` | `src/lib/swim/db.ts` |

Neon table names do not change. `health_swim_pb`, `health_swim_session`, `health_watch_session`,
`health_session_detail` and `gym_swim_baseline` keep their names. Renaming a table to tidy a
prefix is churn that buys nothing and breaks the HealthOS importer.

---

## Three mechanisms that must move with the code

These are the reason this is a plan and not a fifteen-minute edit.

### M1. The probe-route linter does not cover `/swim/api`

`scripts/lint-probe-routes.mjs` hardcodes `API_DIR = src/app/gym/api` and fails the build if any
POST route there is missing from `WRITE_ROUTES` in `scripts/probe-gym.js`. It exists because on
2026-08-16 `/gym/api/note` was added to the app and not the list, and the first probe posted to
the real route.

Moving the baseline write to `/swim/api/baseline` moves it **out of the linter's scope**. The
route would then be a live POST into the real Neon store with nothing checking that the probe
harness stubs it. That is a silent regression of the exact mechanism the file was written to be.

**Fix, and it ships in the same commit as the route move:** make `API_DIR` a list and add
`src/app/swim/api`. Add `/swim/api/baseline` to `WRITE_ROUTES`. Neither is optional.

### M2. The swim content validator lives inside the gym validator

`content/gym/validate.mjs` reads all three swim JSON files and enforces the rules that keep swim
instruction honest: every `sourced` cue carries a verbatim quote, every quote's source id resolves
to a real URL, every `inference` names the quote it reasons from, tiers get slower going down (the
check that caught the 5 km parse bug), and `swim-teaching.json` cannot ship without its
`beforeYouStart` safety block.

Moving the content out of `content/gym/` without moving these checks silently drops all of them.

**Fix:** split the swim checks into `content/swim/validate.mjs`, add
`node content/swim/validate.mjs` to the `build` script in `package.json`, and delete the swim
blocks from the gym validator. Verify by breaking a source id on purpose and confirming the build
fails before trusting it.

### M3. `src/proxy.ts` gates writes by path prefix

The prefix list is `/kitchen/api`, `/gym/api`, `/french/api`, `/reading/api`. `/swim/api` is not
in it, so a new POST there would be open to anyone. Add it.

Note: pages stay public. Every page on this site is public by his 2026-08-11 decision ("I don't
mind the world seeing my weight body fat, etc"), and `GATED_PAGES` is empty. The tracker does not
change that. Only the write needs the cookie.

---

## Execution order

Order matters in two places and is otherwise free.

### Phase 0. The net

1. `pg_dump` the four `swim_*` tables to `_archive/SwimOS-2026-08-26/neon-swim-tables.sql`.
   Dropping a table is the one genuinely irreversible step here.
2. Copy `SwimOS/` to `_archive/SwimOS-2026-08-26/`. This copy IS the backup for everything else,
   which is why no other rollback is written into this plan.

### Phase 1. Kill the schedule

**Delete the scheduled task FIRST.** `schtasks /Delete /TN HOODII-SwimOS-Daily /F`. This is the
same reasoning `daily.mjs` already carries in its own comment about the Vercel deploy: a task that
fires at 05:30 does not care that the files it calls are gone. Delete files first and tomorrow
morning it writes a failure into a log nobody reads, forever.

3. Delete the task. Confirm with `schtasks /Query /TN HOODII-SwimOS-Daily` returning not-found.
4. `git rm -r SwimOS/` (the archive copy from Phase 0 is what survives).
5. Drop `swim_session`, `swim_coverage`, `swim_pool`, `swim_sync`.
6. Delete `content/swim/schema.sql`, `content/swim/sync.mjs`, `content/swim/apply-schema.mjs`,
   `src/lib/swim/db.ts`, `src/app/swim/PaceClock.tsx`.
7. `swim.css` is rewritten rather than deleted, see D2.

`PaceClock` goes. It shows the real current Calgary time, and `wedge/DESIGN.md` argues that is why
it earns the accent colour: it is functional, not decorative. That argument was about a schedule.
With no schedule there is no "what time is it against the pool wall" question, so the clock is
decoration and it goes.

### Phase 2. Build the new `/swim`

8. Move the four content files (three JSON plus the extracted `plan.json`).
9. Move `swim-level.ts` to `src/lib/swim/level.ts`. New `src/lib/swim/content.ts` for the loaders.
   New `src/lib/swim/db.ts` owning baseline reads/writes, PBs, and the session summary lifted from
   `lib/health/db.ts`. Move `SwimCoaching` / `SwimTeaching` types out of `lib/gym/types.ts`.
10. Apply M2 (validator split) and confirm it fails on a deliberate break.
11. `src/app/swim/page.tsx` rebuilt as the tracker: sub-tabs Now / Plan / How / Coach me / Coach
    them, same `?s=` query-param idiom as `/gym/conditioning`, for the same reasons stated there
    (works before hydration, survives a reload at the poolside, every view is a bookmark).
12. `src/app/swim/api/baseline/route.ts`. Apply M1 and M3 in this commit.
13. `src/app/swim/BaselineForm.tsx`, pointed at the new route.

### Phase 3. Strip swim out of `/gym` and `/health`

14. `src/app/gym/conditioning/page.tsx`: drop `swim` from `TABS` and `SUB_TABS`, delete the
    `SwimLevel`, `SwimCoachMe`, `SwimTeach` components and their imports, and change the swim card
    in the Overview tab (currently linking `?p=swim`) to link `/swim`.
15. Delete `src/app/gym/SwimBaselineForm.tsx`, `src/app/gym/api/swim-baseline/`,
    `src/lib/gym/swim-level.ts`, and the two swim loaders from `src/lib/gym/program.ts`.
16. Redirect `?p=swim` to `/swim` so existing bookmarks land somewhere. Cheapest correct place is
    a check at the top of the conditioning page component.
17. **`src/lib/gym/week.ts` is not touched.** It maps `swimming -> 'swim'` and the slot
    `swim -> 'evening swim'`, and it reads the watch mirror rather than any tab. The week Overview
    keeps counting swims toward the training streak, which is correct: swim is still training even
    though it is no longer a gym tab.
18. `src/app/health/page.tsx`: remove the three swim stat tiles and the distance chart, replace
    with one line linking `/swim`. Change the row description on the home page from "Weight, swim
    history, and lifting attendance" to drop swim.

### Phase 4. Surfaces and docs

19. `src/app/page.tsx`: rewrite `swimRow()`. It currently derives from the pool mirror
    ("N Calgary pools with lane swim open right now"). It becomes derived from the tracker: last
    swim, distance, pace, or the gap to the next tier. Same principle as before, the row shows
    real state rather than a hand-written line.
20. `src/app/sitemap.ts`: `/swim` stays (pages are public) but `changeFrequency: 'daily'` was true
    of a scraped timetable and is not true of a training log. Set it to `weekly`. Update the
    comment, which currently explains the 2026-08-16 subdomain move.
21. `metadata` on the swim page: title and description both describe the schedule today.
22. Docs, all five: `CONTEXT.md`, `INDEX.md` (delete the SwimOS row, rewrite the
    hoodii-studio-site row), `BACKLOG.md` (the "Migrate Reading and Swim to native routes" item and
    the hub-row sweep item both reference the old shape), `TOOLS.md` (live scheduled tasks drops
    from 4 to 3), `hoodii-studio-site/AGENTS.md` (route table rows for `/swim`,
    `/gym/conditioning`, `/gym/api/swim-baseline`).
23. New root handoff, predecessors archived in the same edit per the workspace handoff rule.

### Phase 5. Verify, and report only what was observed

24. `pnpm build`. That runs prose lint, classname lint, kitchen alias lint, kitchen validator
    strict, gym validator, reading validator, the new swim validator, and the probe-route linter.
25. `node scripts/run-probe-gym.mjs`. The swim tab is gone, so any probe assertion touching it
    must be updated, not deleted-and-forgotten.
26. Push. Poll `https://hoodii.studio/swim` for 200 and grep the body for a tier name to prove the
    tracker rendered rather than the route merely existing.
27. Confirm `https://hoodii.studio/gym/conditioning?p=swim` redirects.
28. Screenshot `/swim` at 390 px wide and measure the page height in screens. The swim tab hit
    7.9 phone screens once and the sub-tab split brought it to 2.2. A rebuild is exactly where
    that regresses.

---

## Open decisions

**D1. "Coach them" is not tracking.** The teaching handbook is him on a pool deck explaining
freestyle to a stranger. It is not a metric and it is not his training. It moves to `/swim`
anyway, because `/swim` is now the home for everything swim and a second home is the drift class
this whole migration is removing. Flagged rather than assumed.

**D2. `gym.css` is 34 KB and the new `/swim` needs most of it.** Three options, none obviously
right, and this one wants his eye:
  - `/swim/layout.tsx` imports `gym.css` plus a small `swim.css` for deltas. Cheapest, but leaves
    a file named for one route styling two.
  - Rename to `training.css` and import from both layouts. Honest, but `scripts/lint-classnames.mjs`
    reads it and every class name in it is asserted somewhere.
  - Extract the shared block into a third file. Most correct, most churn.

Default if he does not weigh in: option one, with the rename raised again the next time `gym.css`
is edited for another reason.

**D3. The Reddit listener and the discovery docs are being archived, not published anywhere.**
They contain the 2026-06-25 fabrication incident and the provenance rule that came out of it,
which is the most reusable thing SwimOS produced. It is worth a line in `.agents/ENGINEERING.md`
rather than only living in an archive folder nobody opens. Not in scope for this migration.
