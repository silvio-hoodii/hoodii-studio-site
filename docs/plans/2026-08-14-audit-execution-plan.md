---
date: 2026-08-14
status: READY TO EXECUTE
owner: Silvio Neyra
author: audit session 2026-08-14 (Fable), written for a cheaper executor model (Opus or Sonnet)
scope: hoodii-studio-site (primary) + small doc fixes in HOODII root, KitchenOS, LanguageOS, HealthOS
report: https://claude.ai/code/artifact/e820dd0f-3652-492b-a7ba-39268fa3c436
screenshots: HOODII/.cache/site-audit-2026-08-14/ (22 files, phone 390x844 + desktop 1440x900 per route)
---

# hoodii.studio audit execution plan

This file is self-contained. Everything the executor needs is in here or in a file this plan names.
Five adversarial audit agents produced the findings; a sixth verifier tried to refute the twelve
load-bearing claims and confirmed eleven at file:line (the twelfth, the /gym void, is
browser-observed with a screenshot but its cause is not located in code). Do not re-audit; execute.

## 0. How to work this plan (read before any task)

1. **Read `hoodii-studio-site/AGENTS.md` in full first.** It carries the posture rules this plan
   assumes: monochrome tokens, one `--signal` colour meaning "true right now", rules not cards,
   first-person voice, honest states, no em dashes anywhere, no CMS, no Hoodii branding.
2. **Verification gate before any push** (from AGENTS.md, non-negotiable):
   `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm build`.
   Change dependencies only through `pnpm add` / `pnpm remove`, never by editing package.json.
3. **Deploy = push to `main`.** Vercel auto-deploys. After pushing, wait 40 seconds, then fetch the
   REAL domain (`https://hoodii.studio/...`, not the vercel.app URL) and confirm your change is
   actually serving before reporting it done. A green build is not a deploy; a deploy is not a
   working feature (workspace Law 3). The old build can serve for ~30s after Vercel says Ready.
4. **Visual changes must be screenshot-tested** at 390px and 1440px widths before being reported
   done (the operator is often on his phone). Compare against the baseline screenshots in
   `HOODII/.cache/site-audit-2026-08-14/`.
5. **After finishing each phase (P0, P1, P2), run one adversarial review pass** (workspace Law 5):
   a fresh agent told to "find where this phase's changes LIE or broke an adjacent surface", not
   "check this". Name the failure hunted. Fix what it finds before starting the next phase.
6. **One task per commit**, commit message says what changed and why. No em dashes in commit
   messages, code comments, or any copy.
7. **Task tags:** `[MECH]` = mechanical, Sonnet-grade, the spec below is complete.
   `[JUDG]` = judgment involved, prefer Opus, and anything marked "Silvio approves" blocks on him.
8. **Never write cooking steps** (kitchen tasks). Read
   `content/kitchen/schema/SOURCING.md` before touching anything under `content/kitchen/`.
9. Dev server: `pnpm dev` on port 3001, test on `localhost` not `127.0.0.1`.
10. **There is no dev database.** `KITCHEN_DATABASE_URL` and `GYM_DATABASE_URL` point at the real
    Neon store. Any test write lands in Silvio's real logs. Do not POST test data.

---

## 1. Confirmed findings (the why behind every task)

All verified by an adversarial second pass unless marked otherwise.

| # | Finding | Evidence |
|---|---------|----------|
| F1 | Gym silently loses data: `autosave()` swallows all errors, `finishWorkout()` renders "Session saved." even when the POST failed (e.g. 401 on a device without the cookie) | `src/app/gym/GymClient.tsx:151` `.catch(() => {})`; `:205` catch then `setFinished(true)`; `:387` renders "Session saved." unconditionally |
| F2 | French silently loses reviews: `rate()` fires the POST with no `res.ok` check and advances the queue optimistically | `src/app/french/FrenchClient.tsx:93-106` |
| F3 | No `not-found.tsx` anywhere; bad URLs get the stock black Next.js 404, off-palette, no links | `src/app/kitchen/[id]/page.tsx:12` calls `notFound()`, no boundary in tree |
| F4 | Kitchen subpages have no link home: KitchenNav TABS = kitchen routes only | `src/app/kitchen/KitchenNav.tsx:16-21`; only `kitchen/page.tsx:145` has the home link |
| F5 | All four `/login` pages are dead ends (password box, zero links); one is linked from production | `src/app/*/login/page.tsx`; `CookClient.tsx:523` links to `/kitchen/login` |
| F6 | Three header idioms: eyebrow "← Silvio Neyra" (kitchen/gym/health/french) vs hub-masthead clone (music/curio) vs footer-only (callback) | `music/page.tsx:65-68`, `curio/page.tsx:34-37`, `callback/page.tsx:67-69` |
| F7 | Three content widths: 680px most, 600px french, 780px music | `french/french.css:19`, `music/music.css:17`, others `:13-27` |
| F8 | Kitchen's a11y fixes never propagated: `--border-strong` + `:focus-visible` rings exist only in kitchen.css; other five surfaces use bare `var(--border)` (measured 1.34:1 contrast) with no focus override | `kitchen.css:615, 597-599`; grep "border-strong\|focus-visible" hits only kitchen.css |
| F9 | `/callback` colours its ERROR box with `--signal` (the one semantic palette breach) | `callback/callback.css:33` |
| F10 | No robots.txt, no sitemap (both 404 live), no canonical, no `metadataBase`, no openGraph anywhere | zero grep hits in src; live 404s confirmed |
| F11 | Google serves the dead site's description: "Personal site for Silvio Neyra. Business analyst, product owner, builder. 12 years bridging business and technology." (recovered from the retired app) | `hoodii-platform/apps/hoodii-site/src/app/[locale]/layout.tsx` |
| F12 | Dead indexed URLs 404 with no redirects: `/en`, `/es`, `/en/about`, `/es/about`, `/en/exploring`, `/es/exploring`, `/en/contact`, `/es/contact`, `/studio`, plus unknown old case-study slugs | old `sitemap.ts` in the retired app; `next.config.ts` has no redirects() |
| F13 | `hoodii-studio-site.vercel.app` serves a duplicate indexable copy (HTTP 200, no canonical) | curl confirmed |
| F14 | `/callback` is indexable (no robots meta, not in proxy matcher) | `callback/page.tsx` metadata; `src/proxy.ts` matcher |
| F15 | Hub music row oversells: "{n} plays kept that Spotify would have dropped" while the table holds exactly 50 plays = one Spotify batch, nothing yet preserved beyond what Spotify returns | `src/app/page.tsx:164`; `src/lib/music/db.ts:138-153` |
| F16 | Hub gym row shows "Next up {day}" with no mention that the last session is days old; `computeNextUp` already computes `daysSince` | `src/app/page.tsx:82`; `src/lib/gym/cycle.ts:58` |
| F17 | /health has no staleness concept: filled by a one-shot migration script, no recurring sync, "as of 2026-08-09" will render as current forever; post-migration days render as not-trained | `content/health/migrate-from-sqlite.mjs`; no "stale" match in `src/lib/health/db.ts` or health/page.tsx |
| F18 | Kitchen protein tracking is dead: `logProtein`/`proteinToday` have ZERO callers, Neon `protein_log` has 0 rows, daily logging stopped 2026-08-08 (the migration shipped 08-09) | `src/lib/kitchen/cook.ts:91,98`; grep confirms no callers |
| F19 | Kitchen offers exactly ONE real dinner: 6 offerable, 5 are no-heat assemblies | `src/lib/kitchen/recipes.ts:209` `isOfferable()`; recipe JSONs |
| F19b | **CORRECTION 2026-08-14.** F19 also claimed "every dish he cooked and liked is unverified". False, and checked against `cook_log`, which is the only record of what happened at the stove. He has cooked: beef and mushrooms over rice, piccata, bulgogi, the onion knife drill, brown-the-beef, slice-the-roast, scrambled eggs, cottage cheese bites. **Mongolian, chaufa and gyudon appear nowhere in it.** Planned, never made. Silvio: "Haven't made those dishes so I don't know why the app says that." The claim was repeated into a second session before anyone read the log | `cook_log`, 20 rows, queried 2026-08-14 |
| F20 | French has zero cards in BOTH copies, and the documented ingest default (`LanguageOS/scripts/ingest-page.mjs`) posts to the laptop copy, not the hub | Neon `french_cards`=0; `LanguageOS/data/french.db` cards=0; `LanguageOS/CLAUDE.md` documents localhost:3333 default |
| F21 | Desktop = phone column in a void on every route (600-780px cap, no breakpoint changes); only music's 3-col range grid uses width | all `*-desktop.png` screenshots |
| F22 | /gym renders a ~650px blank vertical gap between header and first exercise at both widths. Browser-observed, DOM-measured (header ends y=344, next content y=1018), and CONFIRMED by Silvio on his own device 2026-08-14. Cause not yet located in code | `gym-desktop.png`, `gym-finish-click.png` |
| F23 | Public polish: /french ships an empty app with visible admin affordances; kitchen QA prose ("WRITTEN BY AN AGENT...expect them to be wrong") at overwhelming volume; /curio is 28,000px tall unpaginated; /kitchen/find ~12,000px; every recipe tab is titled "Kitchen"; oats page renders "AND THIS GEAR" heading with no items; want-page thumbnails rendered as grey squares in automated Chromium (srcs return 200, likely lazy-load; NEEDS confirmation on a real phone) | screenshots in .cache/site-audit-2026-08-14/ |
| F24 | No portfolio layer: "In production" rows link out to client sites that never mention Silvio; rows are the one place the first-person voice drops out | `src/app/page.tsx:218-245` |
| F25 | Curio works (62 items, daily heartbeat) but has no staleness alarm if the scheduled task dies quietly; capture side starving (4 "asked" rows ever) | `CuriosityOS/digest/run-curiosity.ps1` step 1b; `curio_items` |

**What already works and must survive every change:** the home intro paragraph; /kitchen/want (the
best engineering demo on the site); the "What I stopped building" section; live state as link
labels; /health charts; the token discipline (zero hardcoded colours found anywhere).

---

## 2. P0: stop the bleeding (one session, all [MECH] unless noted)

### P0-1. One shared site header on every surface
- Create `src/components/SiteHeader.tsx` (server component, no client JS needed):
  a thin bar, `border-bottom: 1px solid var(--border-strong)` (define the token, see P1-5),
  left: `<Link href="/">Silvio Neyra</Link>` in the existing mono eyebrow style,
  right: an optional uppercase mono label naming the current app ("KITCHEN", "GYM"...), passed as
  a prop. Consume tokens only. Match the eyebrow type treatment already in `kitchen/page.tsx:145`.
- Mount it in `src/app/kitchen/layout.tsx`, `gym/layout.tsx`, `health/layout.tsx`,
  `french/layout.tsx` so every subpage AND every `/login` page gets it for free. For `/music`,
  `/curio`, `/callback` either create thin layouts or mount at the top of each page.
- Remove the now-duplicate per-page `← Silvio Neyra` eyebrow links in kitchen/gym/health/french
  page.tsx and the masthead-clone top rows in music/curio (keep their footer back-links or remove,
  either, but be consistent: pick "header everywhere, no footer duplicates").
- The hub `/` keeps its own masthead; do not mount SiteHeader there.
- KitchenNav stays exactly as it is, below the header. Do NOT add a home tab to KitchenNav; home
  now lives in the header.
- Acceptance: every route including `/kitchen/find`, `/kitchen/want`, `/kitchen/shop`, any dish
  page, and all four login pages shows a link to `/` at the top. Screenshot at 390px: the header
  must not wrap or crowd the KitchenNav.

### P0-2. Fix the silent write paths (the most important task in this plan)
- Reference implementation: kitchen already solved this. Read the failed-save state and inline
  unlock in `src/app/kitchen/[id]/CookClient.tsx` (around line 523) and the pattern notes in git
  log around 2026-08-11 ("Send button silently 401ing all evening").
- `src/app/gym/GymClient.tsx`:
  - `autosave()` (line ~151): remove `.catch(() => {})`. On failure, set a visible error state:
    a persistent inline banner "Not saved. This device is locked." with the same inline unlock
    (password field posting to the unlock endpoint) kitchen uses. Keep unsaved sets in client
    state so unlocking and retrying saves them.
  - `finishWorkout()` (line ~205): only `setFinished(true)` when the POST returned ok. On failure
    render the error + unlock, never the "Session saved." line (line ~387).
- `src/app/french/FrenchClient.tsx` `rate()` (lines 93-106): await the fetch, check `res.ok`.
  On failure do NOT advance the queue; show the same inline error + unlock. (Design note: French
  reviews require the network anyway; blocking the advance is correct and simplest.)
- Acceptance test WITHOUT writing to the real DB: open the page in a browser profile with no
  cookie, enter a set / rate a card, and confirm the UI shows the not-saved state instead of
  success. The write itself 401s server-side, so nothing lands in Neon. Do not invent a mock DB.

### P0-3. A real 404, and doors on the login cells
- Create `src/app/not-found.tsx`: on-palette (import `hub.css` idiom or a small dedicated style),
  eyebrow "SILVIO NEYRA", one line of first-person voice (e.g. "Nothing lives at this address."),
  a link to `/`. No em dashes.
- Login pages get the SiteHeader from P0-1 automatically once layouts mount it; verify all four.
- Acceptance: `https://hoodii.studio/kitchen/definitely-not-a-dish` renders the new page with a
  working home link, in both themes of the OS setting if applicable (site is light-only today;
  just match the site).

### P0-4. The SEO batch
All in one commit is fine. `https://hoodii.studio` is the canonical origin everywhere.
- `src/app/robots.ts`: allow all; disallow `/kitchen/login`, `/gym/login`, `/health/login`,
  `/french/login`, `/callback`; `sitemap: https://hoodii.studio/sitemap.xml`.
- `src/app/sitemap.ts`: list `/`, `/curio`, `/music` only (kitchen/gym/health/french are
  deliberately noindexed; leave them out). Add `/work/*` and `/writing` here later when P1 ships.
- `src/app/layout.tsx` metadata: add `metadataBase: new URL('https://hoodii.studio')`,
  `alternates: { canonical: '/' }`, and a title template
  `title: { default: 'Silvio Neyra', template: '%s · Silvio Neyra' }` (this fixes every app tab
  title for free; check the hub still shows plain "Silvio Neyra").
- Rewrite the root meta description. PROPOSED, Silvio approves the final wording before deploy:
  "I build small software I use every day: a kitchen that knows my fridge, a lifting log, and
  French flashcards from book pages I worked. Twelve years bridging business and technology, now
  shipping the tools myself." (First person, no puffery, no em dashes. This becomes the Google
  snippet; it must say something a recruiter can use.)
- `src/app/callback/page.tsx`: add `robots: { index: false, follow: false }` to its metadata.
- Per-route descriptions on the four app layouts (they are noindex but descriptions still serve
  link shares): one plain sentence each, first person.
- `next.config.ts` `redirects()`: permanent redirects to `/` for `/en`, `/es`, `/en/:path*`,
  `/es/:path*`, `/studio`.
- Canonicals per indexable route (`/curio`, `/music` pages: `alternates: { canonical: '/curio' }` etc.).
- Acceptance: after deploy, `curl -s https://hoodii.studio/robots.txt` and `/sitemap.xml` return
  200 with the right content; `curl -sI https://hoodii.studio/en` returns 308 to `/`; view-source
  of `/` shows the canonical tag and new description. The vercel.app duplicate is then handled by
  the canonical tag plus the operator step in section 7.

### P0-5. Honest hub rows and a health stale flag
- `src/app/page.tsx:82` gym row: when `nextUp.daysSince != null && daysSince > 1`, render
  "Last trained {daysSince} d ago · next up {nextDay}". Keep "Next up {nextDay}" only for
  daysSince 0 or 1. `daysSince` is already returned by `computeNextUp` (`src/lib/gym/cycle.ts:58`).
- `src/app/page.tsx:164` music row: replace "plays kept that Spotify would have dropped" with a
  claim that is true from day one, e.g. "{n} plays collected since {date of first row}" (min
  played_at from `music_play`; `src/lib/music/db.ts` getSummary can return it). The original
  sentence becomes true only after months of history; do not keep it until then.
- Health staleness (F17): in `src/lib/health/db.ts` compute days since the latest measurement.
  Past 14 days (the same threshold `HealthOS/CURRENT.md` applies to itself), the hub health row
  and the top of `/health` must say "STALE: last measurement {n} days ago" in `--destructive`
  styling, and the attendance strip must stop claiming authority for days after the last synced
  watch session (render them as "no data", not as not-trained). The full fix is the P2-3 sync;
  this makes the gap honest meanwhile.

### P0-6. Hunt and fix the /gym void (promoted from P1 after operator confirmation)
- Silvio confirmed on 2026-08-14 that he sees the ~650px blank gap on his own device, so this is
  a live rendering defect every visitor sees, not a test-browser quirk. Use the hunt procedure in
  P1-6 (rect-sweep the main wrap's children to find the element owning the gap). Fix, deploy,
  confirm gone on the live domain at 390 and 1440.

---

## 3. P1: make it hireable

### P1-1. Three work pages [JUDG, Silvio approves copy before deploy]
- New routes `/work/themoment`, `/work/versatile`, `/work/brixel` (plus an index at `/work` or
  hub-row links directly; prefer direct links, no index page needed yet).
- Each page, first person, under ~600 words: what it is, what I actually did (discovery,
  requirements, build direction, validation; the BA-to-builder story), the stack, ONE decision
  that mattered with its why, and outcome numbers that are live-verifiable (the hub already pulls
  "154 real orders" for The Moment; reuse those queries, never hardcode a number that will stale).
- Content sources: `HOODII/PROFILE.md` (the portfolio table and "How He Works With Claude Code"),
  `HOODII/IDENTITY.md`. Versatile is nameable (decision D-067). The Moment = themomentyyc.com
  (Sanity + Supabase + Square). Brixel = brixelcorp.com.
- Hub "In production" rows (`src/app/page.tsx:218-245`) now link to these pages first; each work
  page links out to the live client site. Rewrite the row lines in first person ("I built...").
- HARD CONSTRAINT (section 8): no availability claims, no "hire me", no rates, anywhere.
- Add the three routes to `sitemap.ts`.

### P1-2. The kitchen build story [JUDG, Silvio approves before deploy]
- One page, suggested `/work/kitchen` (or the first `/writing` entry, executor's call), telling
  the true story: the first dish cooked from the app burnt after passing a six-source check on
  every number; all four failures were gaps BETWEEN the numbers, every one from a sentence an
  agent wrote; the sourcing law that followed (one published recipe verbatim, agents add only
  stock/definitions/equipment/timers/protein); the adversarial review that found 91 false "ready"
  claims in one pass. Sources: `content/kitchen/schema/SOURCING.md`,
  `HOODII/.agents/ENGINEERING.md` (the five laws), the 2026-08-13 archived handoffs.
- This is the strongest single portfolio artifact the site can carry: it demonstrates process
  design, verification discipline, and honest reporting, which is what Silvio actually sells.

### P1-3. Share cards and identity data [MECH]
- `src/app/opengraph-image.tsx` using next/og ImageResponse: monochrome, name + one line, match
  the site (IBM Plex feel, no gradients). Root layout metadata gets `openGraph` (title,
  description, url, siteName, images auto-picked from the file) and `twitter: { card:
  'summary_large_image' }`. Per-route og titles come free via the title template.
- Person JSON-LD on `/`: name "Silvio Neyra", url "https://hoodii.studio", sameAs
  [https://github.com/silvio-hoodii]. Ask Silvio if LinkedIn should be included before adding it.
- A visible plain-text email on the hub footer (the research: nobody clicks bare mailto). Ask
  Silvio which address he wants public (likely silvio@hoodii.studio).
- Acceptance: paste the URL into a LinkedIn/Slack composer preview or use an OG debugger; a card
  with image renders.

### P1-4. Desktop pass, not a redesign [JUDG]
- Unify the measure: one token (e.g. `--measure: 680px`) in `globals.css`; french.css:19 and
  music.css:17 adopt it (music keeps its 3-col ranges grid).
- At `min-width: 1024px`, widen data surfaces where content is already tabular: `/kitchen/find`
  results to a 2-column grid, `/curio` to a wider measure or 2-column entry flow, `/music`
  history to the wider measure, `/health` charts side-by-side pairs. Reading surfaces (hub, dish
  pages, gym) keep the single column; a wider void with intent beats a stretched form.
- Music's existing `.ranges` grid (music.css:159) is the in-house proof of the pattern.
- Acceptance: before/after screenshots at 1440 and 390 for every touched route, compared against
  `.cache/site-audit-2026-08-14/` baselines. Nothing may regress at 390px.

### P1-5. Propagate the a11y fixes, fix the palette breach, name the dish tabs [MECH]
- Move `--border-strong` from `kitchen.css:615` into `globals.css`
  (`color-mix(in srgb, var(--foreground) 32%, var(--background))`), keep kitchen consuming it,
  and apply it to the same control classes (buttons, chips, inputs, tab pills) in gym.css,
  health.css, french.css, music.css, curio.css, callback.css.
- Copy kitchen's `:focus-visible` ring rules (kitchen.css:597-599) into each surface, scoped
  under their root classes.
- `callback/callback.css:33`: the error box uses `var(--signal)`; change to `var(--destructive)`.
- Dish pages: add `generateMetadata` in `src/app/kitchen/[id]/page.tsx` returning the dish name
  as title (template renders "Chicken Gyudon · Silvio Neyra").
- Replace `window.prompt()` in `FrenchClient.tsx:145-147` (exam date) with an inline date input
  in the token system; it is the only native OS dialog on the site.

### P1-6. Public-stranger polish [JUDG]
- **/gym void (F22, operator-confirmed on his device 2026-08-14):** open live /gym at 390 and
  1440, screenshot, then sweep `getBoundingClientRect()` over the children of the main wrap to
  find which element owns the ~650px gap (suspects: the warmup `<details>` block margins, a
  fixed-nav spacer, an empty state container). Fix it, deploy, and confirm on the live domain
  that the gap is gone at both widths.
- **/french empty state:** anonymous visitors currently see zeros plus admin affordances. Server
  component: read the cookie (`cookies()`), hide "edit" and "Log a section I finished" unless
  unlocked. Reframe the public empty state in one honest line: "Build three. Cards enter only
  from book pages I worked; none yet." Do NOT add sample cards (landmine, section 9).
- **Kitchen provenance prose:** compress the public QA voice into small mono chips ("agent-written",
  "changed from the original", "not checked yet") each expandable (native `<details>`) to the full
  current sentence. The honesty stays; the volume stops drowning the food. Do not change any
  provenance DATA or gate logic, presentation only.
- **Mega-pages:** `/curio` (28,000px): server-side pagination or year anchors + "show more"
  chunks. `/kitchen/find` (12,000px): cap initial render at ~100 rows with a "show more". `/music`
  history: cap at 50 with expand.
- **Want-page thumbnails:** blocked on the operator check (section 8, Q3). If real, likely the
  lazy-load never fires; prefer native `loading="lazy"` on plain `<img>` over any observer code.
- **Oats page "AND THIS GEAR" empty heading:** render the gear section only when the list is
  non-empty (find it in the dish render path, likely CookClient.tsx or the dish page component).

---

## 4. P2: make the apps daily

### P2-1. Kitchen: refill the offered list, revive protein [JUDG + operator]
- **Re-source three repeat dinners.** Blocked on Silvio confirming the three (proposed: eggs,
  gyudon OR mongolian, chaufa; see section 8, Q4). Process is the sourcing law, no shortcuts:
  find ONE published recipe this kitchen already satisfies, quote its steps verbatim with
  `sourceText` on every step, cite every number, `node content/kitchen/render.mjs <id>` to read
  it AS RENDERED, stamp `readAt`, pass `validate.mjs --strict`. Agents add only stock matching,
  definitions, equipment, timers, protein arithmetic (protein shown as grams with derivation).
  This takes the real-dinner count from 1 to 4 and reopens the 6pm loop.
- **Protein Today surface.** `logProtein`/`proteinToday` exist in `src/lib/kitchen/cook.ts:91,98`
  with zero callers, and Neon `protein_log` is empty. Add a "today" tab to KitchenNav and a small
  page: protein logged today vs target, one-tap log from a finished dish (the finish flow already
  knows the dish's protein). The TARGET is read from `HealthOS/current.json` at build or via the
  health lib, NEVER hardcoded (body-metrics rule: every copy goes stale silently). Show the
  arithmetic on every number.

### P2-2. French: one copy, then the first rep [operator decision first]
- BLOCKED on Silvio (section 8, Q5): LanguageOS/DESIGN.md rule 4 reserves the retire-the-laptop-
  copy decision for him. Once decided: repoint the default target in
  `LanguageOS/scripts/ingest-page.mjs` at the hub (or delete the laptop route), update
  `LanguageOS/CLAUDE.md` so the documented default flow lands cards where he looks, and set the
  exam date via the (now inline, P1-5) date control.
- Then run the loop's first rep WITH him in a session: he photographs one worked book section,
  the session extracts cards, shows them to him, POSTs to `/french/api/cards`. Ten due cards is
  the only thing that has ever made him open a flashcard app.

### P2-3. Health: scheduled sync + honest attendance [MECH]
- `content/health/migrate-from-sqlite.mjs` ran once; make an idempotent upsert variant
  (`content/health/sync.mjs`) and hook it into the existing daily scheduled machinery the same
  way curio does it (`CuriosityOS/digest/run-curiosity.ps1` step 1b calls `content/curio/sync.mjs`;
  copy that pattern, laptop is the source of truth, Neon is the mirror).
- Keep the P0-5 stale flag; after this ships it should almost never fire.

### P2-4. Gym: history and trends [MECH]
- After P0-2 only. Add a per-exercise trend view (last 8 sessions, best set per session) to
  /gym; the old app had sparklines (see `HealthOS/` gym.html V6 for what he had and liked).
  Tables `gym_set`/`gym_session` in Neon carry everything needed. Read-only, no new writes.
- RIR exists in the data model (`SetEntry.rir`) with no input; either add the input or remove the
  field from the POST payload, not the current always-empty limbo.

---

## 5. P3: writing (only after P1 is live)

- `/writing`: markdown files in `content/writing/*.md` with tiny frontmatter (title, date), a
  simple index page listing dated entries, newest first. No CMS, no tags, no RSS in v1.
- Call it "Notes" or "Build log" in the UI, never "Blog". Low-stakes tier by design: dated
  ten-minute entries about what a build taught him. Dated entries age as an archive; a "Blog"
  with two old essays ages as abandonment (research: Julia Evans' blogging-myths post, Simon
  Willison's TIL practice, the Ask a Manager employer take).
- First three entries already exist in substance and need Silvio's voice pass before publishing:
  (1) the five laws and the incidents behind them (`HOODII/.agents/ENGINEERING.md`),
  (2) the burnt dish that produced the sourcing law, (3) the adversarial review that found 91
  false claims. If P1-2 shipped as /work/kitchen, entry 2 links to it rather than repeating it.
- Add `/writing` to sitemap.ts when it ships.

---

## 6. Doc-drift cleanup (outside this repo, [MECH], one commit in HOODII root)

1. `HOODII/CLAUDE.md` kitchen section: still points at the retired Tailscale kitchen.html, "edit
   the DISHES array", and jsonl debriefs. Rewrite those bullets to point at
   `KitchenOS/WHERE-THINGS-LIVE.md`, `hoodii-studio-site/content/kitchen/recipes/*.json`, and the
   Neon cook_log (read `cook-log.jsonl` for history only, it ends 2026-08-09). Keep every rule
   that is not about file locations unchanged.
2. `KitchenOS/README.md` + `KitchenOS/DESIGN.md`: mark the retired-app sections (Today tab,
   USEFIRST panel, 28-dish list, warm-paper palette) as historical with a pointer to
   WHERE-THINGS-LIVE.md; do not delete history.
3. `HOODII/CONTEXT.md`: expired 2026-06-10 with expires-in 7d; its active-state section predates
   the entire hub consolidation. Refresh per the two-headline rule.
4. `HOODII/INDEX.md` hoodii-studio-site row: still describes the 3D rebuild and the parity gate;
   update to the hub reality (AGENTS.md 2026-08-09+).

---

## 7. Operator-only checklist (Silvio, nothing here is executable by an agent)

1. **Google Search Console** (this is the only lever that actually clears the stale snippet;
   P0-4 alone will not): verify the hoodii.studio property, submit the new sitemap, request
   indexing of `/`, and use URL Removals on `/en`, `/es`, `/en/about`, `/es/about`,
   `/en/exploring`, `/es/exploring`, `/en/contact`, `/es/contact`. Done = a logged-out Google
   search for "hoodii.studio" shows the new description. Until then it is not fixed.
2. **Vercel dashboard**: set `hoodii-studio-site.vercel.app` to redirect to the domain (project
   settings, domains), and upgrade the `www` redirect from 307 to permanent (308).
3. **Rotate the Spoonacular key** (third handoff carrying this; it was pasted into a chat
   transcript and the repo is public). New key into `.env.local` + Vercel env.
4. Approve the copy items marked "Silvio approves": root meta description (P0-4), the three work
   pages (P1-1), the kitchen story (P1-2), the public email address and LinkedIn question (P1-3),
   the first writing entries (P3).

## 8. Open questions for Silvio (in plain words, with why they matter)

- **Q1, the gym gap: ANSWERED 2026-08-14.** He has not trained this week, so no workout data was
  lost. The silent-loss bug (F1/P0-2) remains top priority as prevention: the first session he
  logs from a locked device would vanish behind a "Session saved." message.
- **Q2, the /gym blank space: ANSWERED 2026-08-14.** He sees the gap on his own device. F22 is
  a confirmed live bug; see P1-6 for the hunt procedure.
- **Q3, the want-page pictures.** On your phone, do the recipe pictures on
  hoodii.studio/kitchen/want actually load? In our test browser all twelve were grey squares even
  though the image files exist. If they load fine for you, we drop the item.
- **Q4, which three dinners: ANSWERED 2026-08-14.** Eggs, mongolian, chaufa. Note that he has never
  actually cooked any of mongolian, chaufa or gyudon: the premise of the question, that these were
  dishes he repeats, was wrong. See F19b. **Mongolian is DONE**, sourced verbatim from Salt &
  Lavender, and sits off the list until there is brown sugar. Chaufa is not: every published
  version checked on 2026-08-14 needs hot dogs, red bell pepper, pre-cooked cold rice or cooked
  chicken, and he has none of those. It needs a shop or his decision on a substitution.
- **Q5, French copies.** There are two live French databases: the hub (hoodii.studio/french) and
  the old laptop one. Your design doc says only you can decide to retire the laptop copy. Say
  "hub only" and P2-2 unblocks; until then the ingest tooling defaults to the copy you never look at.
- **Q6, music sanity check.** The site has collected exactly 50 plays, the newest from August 11.
  Does that roughly match your memory of when you last listened on Spotify? If you have been
  listening more recently than that on some device, the collector is missing plays and we need to
  look at which account/app the token covers.

## 9. Landmines: things a past failure banned. Do not reintroduce, whatever a redesign suggests.

- **Kitchen:** agents NEVER write cooking steps, including "improving" a source sentence (five
  defects in one evening, 2026-08-11). No hand-typed stock state (13 lies in one day). No
  done-flags on plans or tonight-cards. Dim blocked dishes, never hide them. No interleaved
  multi-dish timelines. No scaling dishes whose serve.p is per unit. No macro-generated dishes.
  `heatFree` is a claim the build verifies, not a convenience flag.
- **French:** never seed cards or starter decks (1,359 seeded, 1 review, project died twice). No
  second page until 10 logged review days (`SELECT count(*) FROM days WHERE reviewed > 0`, not
  intentions). No readiness percentages or projected CLB, ever. Counts only. Never guess or
  invent French; illegible words are skipped.
- **Health:** never hand-edit CURRENT.md (generated). Never type derived targets (computed from
  lean mass). The page stays read-only.
- **Music:** `src/lib/music/spotify.ts` must throw; never add a catch returning a default. Never
  frame the history as lifetime data.
- **Curio:** no streaks, no backlog counts, no guilt mechanics.
- **Gym:** the training cycle is rolling and computed from the log, never weekday-locked tabs.
  Never collapse warmup/cooldown by default. Never gate saving on finishing all sets.
- **Sitewide:** the monochrome one-signal palette is a decision (2026-08-09), validated by the
  anti-slop research; cards, gradients, rounded-lg, cream+terracotta+serif, and puffery words are
  the named AI tells. No em dashes anywhere. No CMS. No Hoodii branding; his name and the domain.

## 10. Governance (hard constraints on copy)

- The work permit application is recorded as submitted 2026-08-11 (closed permit via Versatile);
  the signed agreement's clause 7(c) bars outside employment, business, or consulting without
  written consent. The site presents identity and proof of work freely. It must NOT carry
  "available for hire", rates, "open to work", or any availability claim without Silvio's
  explicit, per-instance approval. If a task seems to want such copy, stop and ask him.
- Before any external-facing availability claim of any kind, the standing rule in
  `HOODII/CLAUDE.md` applies: read `work-permit/` first, raise conflicts in session.
- Nothing from `work-permit/` or `plan-Z/` ever appears on the site.

## 11. Suggested execution order and session boundaries

1. Session A: P0-1 through P0-5, one commit each, deploy-verify each on the live domain, then the
   Law 5 adversarial pass on the whole phase. (Also section 6 doc cleanup, it needs no deploys.)
2. Session B: P1-3, P1-5 (mechanical), then P1-6 investigation items.
3. Session C: P1-1 + P1-2 drafts for Silvio's approval; publish after sign-off. P1-4 desktop pass
   on a feature branch with before/after screenshots.
4. Session D+: P2 per app, each gated as marked. P3 last.
- Report format per session (Law 3): first two lines = state + next action; claims of "live" only
  after fetching the real domain; anything skipped is named as skipped.
