---
date: 2026-08-26
scope: hub shell of hoodii-studio-site. src/app/page.tsx, layout.tsx, hub.css, globals.css, src/components (SiteHeader, SiteFooter, NowPlaying, SaveBlocked), src/lib/fetchers.ts and the lib files the hub rows call, src/app/api/{spotify,psn,psn-image}, src/app/callback, src/app/work (all four pages + layout + work.css), robots.ts, sitemap.ts, opengraph-image.tsx, error.tsx, not-found.tsx. /swim excluded (owned by another auditor).
auditor-note: adversarial audit per law 5 of C:\Users\sneyr\Desktop\HOODII\.agents\ENGINEERING.md, hunting named failures (hub rows that lie, dishonest links, silent-failure defaults, leaks, per-request cost). Written for executor agents: every finding carries the exact fix and how to verify it. Read the "what is actually good" section before touching anything not listed as a finding.
verified-against: live Neon (read-only SELECTs on reading_source_list, reading_sync, reading_acquisition_entry), grep sweeps for em dashes (U+2014, U+2013, the mdash entity), availability claims, AI puffery, lucide imports. All clean unless stated.
---

# Hub shell audit, 2026-08-26

## P0 (security, leak, data loss)

None found. Checked specifically:

- No availability claim anywhere under `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\work\`. Grep for available/hire/freelance/open to work/get in touch/contact me/reach out/looking for hits only the guard comments in `src\app\work\layout.tsx` lines 11-15, which state the clause 7(c) constraint and are correct. The four pages describe delivered work in past tense, refuse adoption claims explicitly, and offer nothing.
- No client personal names. Business names (The Moment, Versatile, Brixel) are the sanctioned subject of the pages. The Versatile page says the hub "is not public" and links only the public marketing site.
- `.env.local` is gitignored (verified with `git check-ignore`), no secret appears in any scoped file, `/api/music/sync` requires `CRON_SECRET` and refuses to run without it, `/kitchen/api/unlock` rate-delays wrong guesses, `/api/psn-image` host-allowlists its upstream.
- robots.ts and sitemap.ts expose only intended routes. The sitemap lists exactly the nine indexable pages; noindex pages declare it themselves, which robots.ts documents correctly.

## P1 (broken or lying to the user)

### P1-1. work.css styles the hub: `.idx .body` is not scoped to `.work`

File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\work\work.css` lines 22-31.

```css
.idx .body {
  font-size: 16px;
  line-height: 1.62;
  max-width: 66ch;
  margin: 15px 0 0;
}
.idx .body + .body { margin-top: 13px; }
```

The hub's own markup uses the same pair of classes: every row on `/` renders `<div className="body">` inside `.idx` (`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\page.tsx` line 455). In the app router a stylesheet loaded for one route stays in the document for the rest of the visit, so the sequence "open /work/brixel, tap Back to the index in the footer (a client-side Link)" renders the hub with work.css still applied: every row's body drops 15 px below its label and gets clamped to 66ch. Every other selector in work.css is either scoped (`.idx.work h1`) or uses class names the hub does not have (`.facts`, `.decision`, `.finding`); this one collides.

Why it matters: the front door visibly breaks after a completely ordinary navigation path, and only after it, so a fresh load looks fine and the defect hides from any single-page check.

Fix: scope the two selectors to `.idx.work .body` and `.idx.work .body + .body`. While there, scope the rest of the file (`.facts`, `.decision`, `.finding` and children) under `.idx.work` too, so the next class the hub adds cannot collide either.

Verify: `grep -n "^\.idx \." src/app/work/work.css` returns nothing (every selector reads `.idx.work`). Then `pnpm build`, and in a browser at 390 px: load /work/brixel, tap "Back to the index", screenshot the rows, compare against a direct load of `/`. The two must be identical.

### P1-2. The reading row says "right now" while ignoring the staleness gate the /reading page itself enforces

File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\page.tsx` lines 206-232, specifically line 221:

```tsx
line: borrowNowAtHome > 0
  ? <><span className="tnum">{borrowNowAtHome}</span> of the next ten on a home-branch shelf right now, ...
```

`borrowNowAtHome` is counted from `reading_acquisition_entry.home_branch_now`, a snapshot written by a hand-run script (`acquire.mjs` over CDP, per AGENTS.md). The library data ages: `getLiveness()` in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\reading\queue-db.ts` lines 77-101 flags it stale past 7 days, and `/reading` (`src\app\reading\page.tsx` lines 64-71) renders a "Acquisition status is stale" banner off that flag, with a comment saying "a week-old BORROW NOW claim is the opposite of" a fact that is true right now. The hub row never calls `getLiveness()`. Verified live: `acquire_generated` is 2026-08-20, six days old today, so tomorrow the page one tap away banners STALE while the front door goes on saying "on a home-branch shelf right now". This is exactly the row-drifts-from-the-app class the hub's own comments document, except the drift is conditional so it reads correct on the day anyone checks it.

Why it matters: the hub's whole design contract is that a row never claims something the app behind it would contradict, and this row will.

Fix: add `getLiveness()` (already exported from `@/lib/reading/queue-db`) to the `Promise.all` in `readingRow()` and take the `borrowNowAtHome` branch only when `!liveness.stale`. When stale, fall through to the existing queue-length line, which makes no freshness claim. Do not invent a new stale sentence for the hub; the absence of the claim is the honest state, same as the swim row's reasoning about `--signal`.

Verify: typecheck plus one read: `node -e` selecting `acquire_generated` from `reading_sync` and confirming the rendered hub line switches branch when the age crosses 7 days (temporarily set `STALE_AFTER_DAYS = 0` locally, run `pnpm dev`, load `/`, confirm the queue-length branch renders, revert). Both surfaces now read the same flag from the same function, so they cannot disagree again.

## P2 (cost, drift, debt)

### P2-1. "55 published lists" is hand-typed in a row whose own comment bans hand-typed facts

File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\page.tsx` line 225:

```tsx
: `${shelf.total.toLocaleString()} books scored from 55 published lists, ${packs.length} finished with recall cards`,
```

Verified live: `select count(*) from reading_source_list` returns 55 today, so the sentence is currently true. But it is a literal, and the comment eight lines above it (lines 213-217) says "Writing a fact down here that a script did not just compute is the exact mistake that comment is about." The 56th source list makes this line silently wrong, the same way the Versatile step count and The Moment order count went wrong (both documented in this same file's comments). `/reading/about` computes its list of sources from the same table via `getSourceLists()`, so the two surfaces will diverge.

Fix: extend `getShelfStats()` in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\reading\shelf-db.ts` (lines 246-253) to return a third field in the same query round trip: `(select count(*) from reading_source_list)::int as lists`, and render `${shelf.lists} published lists`. One query, no new round trip.

Verify: `node -e` comparing `select count(*) from reading_source_list` against the number in the rendered hub HTML (curl the deployed page). They must be the same expression of the same row count.

### P2-2. The PSN surface is dead code with two live public endpoints

Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\api\psn\route.ts`, `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\api\psn-image\route.ts`, and `fetchPsn` plus the psn-api import in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\fetchers.ts` lines 7-11 and 106-131.

Evidence it is dead: grep across `src/` finds no consumer of `/api/psn`, no reference to `psn-image` anywhere, and no import of `fetchPsn` outside the route. The psn-image route's own header comment explains it exists so "a browser TextureLoader can read pixels cross-origin", which is the three.js texture loader from the WebGL room deleted on 2026-08-09. `PSN_NPSSO` is expired (AGENTS.md, "Live data"), so every hit on `/api/psn` performs a doomed NPSSO exchange against Sony's auth endpoint from a Vercel IP, logs a caught error, and returns `{ games: [] }` with `no-store`, meaning nothing is cached and every hit is a billed invocation plus an outbound call. This is also the silent-failure shape this audit was told to hunt: an expired NPSSO, a missing env var and a genuinely empty library all return the identical `{ games: [] }`. Since nothing reads it, the honest fix is deletion rather than a liveness flag.

Fix, in order: delete `src/app/api/psn/route.ts` and `src/app/api/psn-image/route.ts`; delete `fetchPsn`, `PsnGame`, `PsnPayload` and the `psn-api` import from `src/lib/fetchers.ts` (also fix the header comment, see P3-1); run `pnpm remove psn-api` (never edit package.json by hand, per the lockfile lesson in AGENTS.md); remove `PSN_NPSSO` from `.env.local` and the Vercel env when convenient.

Verify: `grep -rn "psn" src/` returns nothing, `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm build` all green, and after deploy `curl -s -o /dev/null -w "%{http_code}" https://hoodii.studio/api/psn` returns 404.

### P2-3. The swim row cannot tell "he stopped swimming" from "the export stopped arriving"

File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\page.tsx` lines 234-267.

`health_swim_session` is filled by the 07:15 laptop sync. If that chain stalls (it stalled for five days in August, per the half-extracted-export incident in AGENTS.md), the row goes on saying "Last swim 700 m, 9 days ago", which reads as a training gap rather than a data gap. The music row solved exactly this with `liveness.stale` and a "collector has stopped" line; the health row solved it with a measurement-age guard; `/swim` itself hedges with "Last swim the watch export has reached" (`src\app\swim\page.tsx` line 460). The hub swim row has no guard and the plain wording.

Fix: `getSyncLiveness()` already exists in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\health\db.ts` (lines 106 on) over the same `health_sync` table that feeds this mirror. Call it inside `swimRow()`; when `stale`, keep the numbers but change the sub to name the real state, for example `sub: 'the watch export has not arrived since <date>'`. Do not suppress the row: the last swim is still true, only the implied recency is not.

Verify: with `health_sync`'s newest ok row older than 36 hours (or the threshold temporarily set to 0 locally), the rendered sub must name the export, not the streak.

### P2-4. AGENTS.md's surfaces table omits the four /work routes

File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\AGENTS.md`, surfaces table at lines 73-94.

`/work/themoment`, `/work/versatile`, `/work/brixel` and `/work/kitchen` are public, indexed, in the sitemap at priority 0.8, and absent from the table. The paragraph directly above the table (lines 68-71) describes this exact failure mode in the past tense. Also stale in the same file: line 90 says `/reading/about` lists "the 33 real source lists" and the table now holds 55 (verified live).

Fix: add one row for `/work/*` (four static pages about delivered work, published 2026-08-16, no writes, the clause 7(c) no-availability constraint noted in `src/app/work/layout.tsx`), and change 33 to "the source lists" without a number, so it cannot go stale again.

Verify: read the table against `ls src/app`; every directory with a page.tsx is either in the table or named by a row that covers it.

## P3 (polish)

### P3-1. Stale comments that will misdirect the next session

- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\fetchers.ts` lines 1-5: claims the RSC root page calls these fetchers and hands off to "60s client-side polling in useDataSources". `useDataSources` was deleted with the 3D world; the hub has not called `fetchSpotify` directly since NowPlaying went client-side on 2026-08-22. Rewrite the header to: consumed by /api/spotify only (after P2-2 lands).
- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\page.tsx` lines 459-460: "these three open somebody else's website" describes the pre-2026-08-16 WORK rows. All rows are internal now and no row sets `external`, so the `↗` branch runs for nobody. Keep the branch (it is the mechanism that keeps glyph and behaviour in agreement if an external row returns), fix the comment.
- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\page.tsx` lines 166-167: "filled by a one-shot migration with no recurring sync behind it" predates the 07:15 daily sync and `health_sync`. The stale-guard conclusion is still right; the stated reason is not.
- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\api\music\sync\route.ts` lines 9-10: says the proxy matcher "only spans /kitchen, /gym, /health and /french"; it also spans /reading/api and /swim/api since 2026-08-21 and 2026-08-26. The conclusion (this route is uncovered) is still true.

Verify: read the diff; no behaviour change, comments only.

### P3-2. /work layout duplicates the root viewport and hardcodes a mismatched themeColor

File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\work\layout.tsx` lines 24-29. The viewport export is byte-identical to the root layout's except `themeColor: '#ffffff'`, while `--background` is `#fdfcfa` (the value opengraph-image.tsx documents). Either delete the whole viewport export (it is inherited) or, if the themeColor is wanted, set it to `#fdfcfa` and put it in the root layout so every route agrees.

Verify: `pnpm build`; view-source of a /work page shows either no theme-color meta or `#fdfcfa`.

### P3-3. Small accessibility gaps

- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\page.tsx` line 461: the `.arrow` div renders `→`, `↗` or `·`, which screen readers announce ("black rightwards arrow") on every row. Add `aria-hidden="true"` to the div; the row's own text already carries the meaning.
- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\components\SaveBlocked.tsx` lines 118-127: the password input has a placeholder and no label. Add `aria-label="Password"`.

Verify: axe or a VoiceOver pass over `/` and a blocked save; no unnamed control, no glyph announced.

### P3-4. /work itself has no page

`src/app/work/` has four children and no index, so hand-trimming a /work/* URL to /work serves the 404. Nothing links to /work (grep verified), so the honest-states rule ("never a link that 404s") is not violated. Lowest-cost option if it bothers anyone: a permanent redirect from /work to / in next.config. Otherwise leave it; the 404 page is designed and carries a way home.

### P3-5. SaveBlocked posts to a kitchen-named unlock route from gym and french

`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\components\SaveBlocked.tsx` line 72 hardcodes `/kitchen/api/unlock`, and the component is mounted from `src/app/gym/GymClient.tsx` and `src/app/french/FrenchClient.tsx`. This WORKS: there is one cookie (`kos`) and one secret for the whole site, and proxy.ts exempts exactly that path. It is a naming debt, not a bug. If touched at all, the right move is a comment on line 72 saying the cookie is site-wide by design, not a second unlock route (a copy is a future disagreement, per globals.css's own doctrine).

## What is actually good (do not "fix" these)

- **Every hub row is computed, catches its own failure, and the fallback is an honest capability description with a working link**, not invented state. The kitchen row shares `isOfferable()` with /kitchen (verified both call sites), the gym row shares `computeNextUp` and `getTrainingStreak` with /gym, the swim row is derived from the mirror. The drift class the audit hunted is structurally closed everywhere except the two conditional cases in P1-2 and P2-3.
- **The music row's liveness alarm is the model answer to the silent-failure trap**: a dead collector outranks any count, "nothing new for N days" catches the successful-but-empty case, and `src/lib/music/spotify.ts` throws instead of defaulting. Do not add a catch that returns a default there; AGENTS.md forbids it and the comments explain why.
- **`fetchSpotify` returning `{ isPlaying: false }` for a dead token is documented and deliberately handled downstream**: NowPlaying guards on `title`, not `isPlaying`, so a dead token renders nothing rather than something stale. The comment block at page.tsx lines 528-540 is load-bearing; leave it.
- **`STATIC_ROWS` being an empty array is a tombstone, not dead code.** Its comments record why Swim and Theories left it, which is the memory that stops them being re-added wrong. Same for the `off`/`plain` distinction in the Row interface, currently exercised only by `plain`.
- **`revalidate = 600` on the hub is a measured decision** (42.3 s of CPU across 178 regenerations, rate unchanged by the crawler block), and AGENTS.md records that `/` and `/opengraph-image` were checked for cost and left alone. Do not re-litigate it, and do not "optimise" the hub's ten calls into a transaction without a measurement showing they matter at 6 regenerations per hour.
- **The hardcoded colours in opengraph-image.tsx are a satori constraint, documented, with each value commented with its source token.** Not a palette violation.
- **robots.ts's thin Disallow list plus per-page noindex is correct and its comments carry the whole 2026-08-24 lesson** (robots is a request; the firewall is the mechanism). Do not add Disallows for the noindex app routes; the file explains the orphaned-URL trap that creates.
- **The `.dark` token block in globals.css is currently unreachable** (nothing sets the class and prefers-color-scheme is not wired). That reads as a committed single light look, consistent with the static light share card. Absence is a decision; do not wire a dark toggle as a drive-by.
- **Copy discipline holds**: zero em dashes and zero en dashes in every scoped file, zero AI puffery, first-person voice throughout, no Hoodii branding (HOODII.STUDIO on the share card is the domain, which the posture rule allows), and the /work pages' header comments record the false claims reviewers already removed so nobody writes them back.
- **390 px behaviour is sound in the CSS**: the row grid collapses under 460 px, no fixed widths, `flex-wrap` on the now-playing strip with an explicit comment about never scrolling the body sideways, 44 px tap floors on header, footer, chips and the facts links, 16 px inputs to stop iOS zoom, and reduced-motion opt-outs on both animations.

## Counts

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 2 |
| P2 | 4 |
| P3 | 5 |
