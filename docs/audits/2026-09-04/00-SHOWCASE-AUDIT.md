# hoodii.studio as a showcase: every app, every device

Date: 2026-09-04. Audited at HEAD `1ff59b7`, which is also the build served by hoodii.studio today.

**The brief, in his words:** *"a showcase of my capabilities to build too so it need to have no holes,
but also be a nice and smooth experience in every device, so whats missing what can be better what
is maybe not worth it."*

That is a different lens from the two earlier audits in this folder's siblings (`../2026-08-26/`,
correctness and honesty of the pages; `../2026-08-28/`, the five training routes). Both were read
first so nothing here repeats what they closed. This one asks three questions of every surface:
does it work on a phone, a tablet and a desktop; would an engineer reading the repo or a stranger
opening the site find a hole; and which parts are not earning their keep.

## How this was measured, so it can be re-run

Every claim below traces to one of these. Nothing is from memory or from a previous audit.

- **Every route, three viewports.** 43 paths (the `DEFAULT_PATHS` list from `scripts/probe-taps.mjs`
  plus the four login pages, `/callback` and a 404) rendered by a headless Chrome over CDP against
  a local `pnpm start` of this exact build, at 390x844, 768x1024 and 1440x900. Per render: document
  height, horizontal overflow, time to painted content, every control under 44px in either
  dimension, smallest body font, landmarks, page title. The 60-line driver is a widened copy of
  `scripts/shoot.mjs` and lives in this session's scratchpad, not in the repo (the repo rule on
  one-shot scripts). Folding a `VIEWPORTS` array into `probe-taps.mjs` is item E9 below.
- **Screens read, not just measured.** 26 of the 129 screenshots were opened and looked at. Three
  findings (A1, A5, B8) came only from that.
- **Lighthouse 12** on four LIVE pages (`/`, `/kitchen`, `/swim`, `/reading/shelf`), mobile
  emulation, from Calgary. The shelf run returned zeros because the firewall challenged it (D4).
- **Live time-to-first-byte** from Calgary, one `curl` per route, one second apart, well under the
  firewall's burst rule.
- **Code read** of every page, layout, client component and API route under `src/app`, the shared
  components, `globals.css`, the build manifests, `package.json`, `.gitignore`, `next.config.ts`,
  `vercel.json`, and `scripts/verify.mjs`.
- **No writes.** Nothing was POSTed, no database was touched, no tab of his Chrome was used (a
  separate headless Chrome on port 9333).

## The verdict in one paragraph

**The engineering under this site is unusually good and almost none of it is visible to the person
it is meant to impress.** The gates, the derived-not-typed discipline, the honest-states rule and the
verbatim recipe pipeline are the strongest things in the repo, and a stranger arriving at
hoodii.studio sees a list of grey rows, taps one, and waits 3.6 seconds on a white screen for
`/kitchen`. On a phone, the surface he uses most, three things are missing that every other daily
tool on his home screen has: a loading state, a dark mode, and a home-screen icon. The `.dark`
palette already exists in `globals.css` and nothing switches it on. Beyond those, the audit found
**nine outright defects** on live pages (the sharpest: the one warning on a cook screen that says an
ingredient is missing renders at roughly 1.1:1 contrast, which is to say invisible), a repo whose
`README.md` still describes a WebGL room deleted a month ago, no CI, and four dependencies with zero
imports. The count of things that would embarrass the site in front of an engineer is short and
every one is cheap. The count of things that would make it feel like a finished product on a phone
is three, and two of them are an afternoon.

## What held up, so nobody churns it

Zero horizontal overflow on any of 129 renders. Every page has exactly one `h1`. No `alt`-less
image. Zero `--signal` misuse found on the screens read. Lighthouse best-practices 100 on `/` and
`/swim`, SEO 100 on both, accessibility 98 on `/` and `/kitchen`. Cumulative layout shift 0 on all
three measured pages. Total blocking time 10 to 40 ms. The auth net (proxy prefix, matcher, linter,
fail-closed comparison) is intact. The four case-study pages carry no availability claim. The 404 and
the error boundary are on-palette and have a way home. The kitchen cook screen at 1440 is the best
desktop rendering on the site: the 680 column is right for one step at a time. `/health` and
`/music` use the wider data column well. The music page's three-column chart layout is the model for
what the other data surfaces could do above 1024.

---

## A. Defects on live pages today

Each is wrong now, on hoodii.studio, and none was in either previous audit.

### A1. The missing-ingredient warning on a cook screen is invisible. P1

**Where.** `src/app/kitchen/[id]/CookClient.tsx` line 342:

```tsx
{p.missing ? <b style={{ color: 'var(--accent)' }}> · you do not have this</b> : null}
```

**Evidence.** `--accent` in `src/app/globals.css` is `oklch(0.955 0.002 100)`, a near-white SURFACE
token (the cream palette's accent was orange; the token kept the name and lost the meaning on
2026-08-09). Measured live in the headless Chrome on `/kitchen/piccata`: text colour
`lab(94.79)` on background `lab(99.20)`, a contrast ratio of about 1.1:1. Three of the ten recipes
probed carry the warning today (piccata twice, honeygarlicchicken once, bulgogi twice). Screenshot:
the prep list shows "boneless skinless chicken breasts, thawed (about 250 g each)" followed by a
ghost of grey where the warning is.

**Why the gates missed it.** `scripts/lint-tokens.mjs` refuses a colour LITERAL. A token that
exists and means the wrong thing passes.

**Fix.** `color: 'var(--destructive)'` (a missing ingredient is the same class as "this did not
save"), and drop the inline style for a class in `kitchen.css` so the next reader sees it. Then the
class fix: extend `lint-tokens.mjs` to refuse `--accent`, `--secondary`, `--muted`, `--card` and
`--popover` as a `color:` value anywhere outside `globals.css`, since all five are surface tokens
and none is legible as text on this background.

**Verify.** Re-run the colour probe (method above) and expect the computed colour to change; read the
screenshot.

### A2. `--ink-faint` does not exist. P2

**Where.** `src/app/kitchen/[id]/CookClient.tsx`, three inline `style={{ color: 'var(--ink-faint)' }}`
on the prep screen (the prep note after an ingredient, the "stands in for" clause, the meta line).

**Evidence.** `grep -rn "ink-faint" src` finds three uses in that file and zero definitions in any
stylesheet. Measured live: the elements inherit `lab(6.2)`, full ink. So the prep notes that were
designed to recede render at the same weight as the ingredient name. 7 to 13 elements per dish page.

**Fix.** `var(--muted-foreground)`. Same lint extension as A1, second half: refuse a `var(--x)` whose
name is not declared in `globals.css`. That is a five-line check and it would have caught both.

### A3. Signing in from the reading shelf lands you in the kitchen. P1

**Where.** `src/app/reading/shelf/WantButton.tsx` sends a locked device to
`/kitchen/login?to=/reading/shelf`. `src/app/kitchen/login/page.tsx` then does:

```tsx
if (outcome === 'ok') redirect(to.startsWith('/kitchen') ? to : '/kitchen');
```

**Evidence.** `/reading/shelf` does not start with `/kitchen`, so after a correct password he is
redirected to `/kitchen`, two apps away from the book he was about to save. The open-redirect guard
is right in intent and wrong in scope: it was written when the kitchen was the only gated app.

**Fix.** One allowlist of same-origin paths in `src/lib/login-server.ts` (`to` must start with `/`
and not with `//`), used by all four login pages, which today each carry their own prefix check.
Better still: one login route. Four login pages exist for one cookie (`/kitchen/login`, `/gym/login`,
`/health/login`, `/french/login`); `/swim`, `/bike`, `/run` and `/reading` have none and borrow the
kitchen's. One `/login?to=` that renders the eyebrow from `to` removes the class.

**Verify.** Log out, tap "want" on a shelf row, sign in, land on the shelf.

### A4. Shopping page opening line reads "15 to buy. , 15 with no price yet." P2

**Where.** `src/app/kitchen/shop/ListClient.tsx`, the lede: the priced clause is conditional, the
unpriced clause is written as `, {n} with no price yet` and the sentence ends with a typed period
after "to buy". With zero priced items the comma follows a full stop. Screenshot at 390 shows it.

**Fix.** Build the sentence from an array of clauses and join with ", "; end once.

### A5. The site header on the four `/work` pages sits inside the page padding. P2

**Where.** `src/app/work/layout.tsx` renders `<SiteHeader>` INSIDE `<div className="idx work">`, and
`.idx` in `hub.css` carries `padding: clamp(32px, 8vw, 64px) 20px 64px`.

**Evidence.** At 1440 the header bar starts 85px down the page and its rule spans only the 680
column. On every other surface the header is full-width at the top of the viewport. It is the only
inconsistent header on the site and it is on the four pages a recruiter is most likely to open.

**Fix.** Move `<SiteHeader>` above the `.idx` wrapper, as `curio/layout.tsx` and `music/layout.tsx`
do.

### A6. Deep pages lose the site name in the tab title. P3

**Evidence.** `/health/deep` titles as "The year so far", `/swim/deep` as "Swim, the whole record",
`/gym/log` as "Lifting, the whole record", `/swim/records` as "Swim records". Every other page reads
"X · Silvio Neyra". The cause: `health/layout.tsx`, `swim/layout.tsx`, `gym/layout.tsx` set
`title: 'Health'` as a plain string, which terminates the root template chain for their children.
`kitchen/layout.tsx` already does it right with `{ default, template }`.

**Fix.** Same object form in the other three layouts. Three lines.

### A7. Every load of `/kitchen` fires four 429s from prefetching challenge-walled routes. P1

**Evidence.** Lighthouse on live `/kitchen` logs four console errors, each "Failed to load resource:
429". `/kitchen/find`, `/reading/shelf` and `/reading/want` sit behind the Vercel firewall challenge
for any request without the `kos` cookie (verified: a plain phone user-agent gets 429 on all three).
Eighteen `<Link>` elements across the site point at those three paths, and zero carry
`prefetch={false}`, so Next prefetches them on viewport entry and the edge refuses.

**Why it matters beyond the console.** Each prefetch is a counted non-`/_next/` request against the
same 150-per-minute per-IP rule that guards the site, spent on requests that can never succeed. On
a 14-screen `/kitchen` page with rescue rows linking to the finder, one visit can burn a dozen.

**Fix.** `prefetch={false}` on every `Link` whose `href` starts with a walled path. Class fix: a
`WalledLink` component (or a lint in `scripts/lint-probe-routes.mjs`, which already knows the API
roots) so a future link to a walled route cannot forget.

### A8. The `.tag` label fails contrast at 2.72:1. P2

**Where.** `src/app/training.css` line 248: `.training .exgroup-label .tag { opacity: 0.7 }` on a
`--muted-foreground` label at 12px. Lighthouse on `/swim` flags five instances (foreground `#9c9b99`
on `#fdfdfc`, expected 4.5:1). It is the `(Aug 25)`, `(all 10)`, `(475 swims...)` style qualifier on
every section heading across all five training routes.

**Fix.** Drop the opacity. `--muted-foreground` alone is about 4.6:1 and already reads as
secondary. Class fix: `lint-tokens.mjs` refuses `opacity` on an element that carries text, or the
probe runs axe's contrast rule. This is the only contrast failure Lighthouse found on three pages.

### A9. A comment asserts a security control that does not exist. P3, and see D1

`src/lib/kitchen/timers.ts`: *"the strict CSP on this site blocks anything off-host anyway."* There
is no Content-Security-Policy header on hoodii.studio, in `next.config.ts`, in `vercel.json` or in
`src/proxy.ts` (verified by `curl -I` and grep). Either the header shipped and was removed, or it
never did. Fix the sentence when D1 is decided.

---

## B. The device experience, which is the ask

### B1. Nothing on the site has a loading state, and the two heaviest pages take seconds. P1

**Evidence, live, from Calgary, one request each:**

| Route | Time to first byte | HTML |
|---|---|---|
| `/` (ISR, cached) | 0.73 s | 30 KB |
| `/kitchen` | **3.56 s** | 178 KB |
| `/music` | 1.66 s | 118 KB |
| `/gym` | 1.31 s | 115 KB |
| `/swim` | 1.19 s | 96 KB |
| `/health` | 1.09 s | 35 KB |

Every one of those is `force-dynamic`, every one is rendered whole on the server before a byte is
sent, and there is no `loading.tsx` anywhere under `src/app` (`find src -name loading.tsx` returns
nothing). The hub rows are plain `<a>` tags rather than `next/link`, so a tap is a full document
navigation. Net: tap Kitchen on the front door, look at a white screen for three and a half seconds.
On a cellular connection at the shop, longer. Lighthouse's speed index for `/kitchen` is 7.6 s
(score 0.25) and for `/` 6.0 s, against paint times of 1.4 to 1.8 s, which is exactly the shape of
"everything arrives at once, late".

**Why 3.5 s.** `/kitchen` scores 2,835 corpus dishes against the stock on every request
(`findCandidates()`), on top of the 52 to 76 Neon round trips `../2026-08-28/00-INDEX.md` T7
counted for `/gym`. Nothing is cached between requests: `grep` finds no `unstable_cache`, no
`'use cache'`, no `cacheLife` in `src`.

**Fix, in three layers, each independent:**

1. **`loading.tsx` in every app segment** (`kitchen`, `gym`, `health`, `swim`, `run`, `bike`,
   `french`, `music`, `reading`), each rendering the layout's header, nav and `h1` with the
   site's own rule-and-label idiom, so the frame appears in under half a second and only the data
   waits. This alone changes the felt experience more than anything else in this document.
2. **Stream the expensive block.** On `/kitchen`, wrap the corpus sections in `<Suspense>` so the
   headline, search box and stock receipt paint before the 2,835-dish scoring finishes. Same for
   `GymClient` behind the warmup list, and the charts on `/health`.
3. **Cache the pure computation.** The corpus score depends on the stock and the corpus, both of
   which change a few times a day. Next 16's `'use cache'` with a `cacheLife` of minutes, or
   `unstable_cache` keyed on the newest `stock_event` id, turns a 3-second render into a
   200-millisecond one for everyone after the first. The hub already proves the pattern at
   `revalidate = 600`.

Also make the hub rows `next/link`. For a dynamic route, prefetch fetches only the loading boundary,
which is precisely what layer 1 creates, so the frame is on the device before the tap.

**Verify.** The same `curl -w` line before and after; a screenshot at 300 ms after navigation
showing the frame; Lighthouse speed index under 3 s on `/kitchen`.

### B2. There is a complete dark palette and no way to reach it. P1 for a showcase, cheapest fix here

**Evidence.** `src/app/globals.css` lines 109 to 131 define every token under `.dark`, including a
re-derived `--border-strong` and a brighter `--signal`. `grep -rn "'dark'" src` finds nothing that
adds the class; there is no `prefers-color-scheme` block. Every `themeColor` is `#ffffff`. The
kitchen at the stove at 9 pm, the gym at 6 am, the pool deck: a white 390px slab in a dim room, on
a site whose whole palette argument is restraint.

**Fix.** Either `@media (prefers-color-scheme: dark) { :root { ...the .dark block } }` and delete the
class, or keep the class and set it from a `useSyncExternalStore` on the media query with a
three-state toggle in `SiteFooter` (system, light, dark) stored in `localStorage`. Add
`themeColor: [{ media: '(prefers-color-scheme: dark)', color: '<dark bg hex>' }, { media: '(prefers-color-scheme: light)', color: '#ffffff' }]`
to each layout's viewport export (the `lint-tokens-allow` marker already exists for this line).
Then screenshot every route in both themes: `shoot.mjs` already has the `THEME=` switch and it has
never been used because there was nothing to switch.

**What to watch.** The SVG illustrations and the `.strip` heatmap colours, the `--destructive` red
on the dark ground, and the two hardcoded-by-necessity colours (`opengraph-image.tsx`,
`themeColor`).

### B3. No web manifest, no icons, no home-screen install. P1 for a phone-first tool

**Evidence.** `src/app` holds `favicon.ico` and nothing else: no `manifest.ts`, no `icon.png`, no
`apple-icon.png`. `public/` holds five untouched create-next-app SVGs (see E3). Added to an iPhone
home screen today, `/kitchen` gets a scaled screenshot as its icon, a white splash, and opens in
Safari with the address bar, which is the one thing the kitchen timer rail fights for room against.

**Fix.** `src/app/manifest.ts` (`display: 'standalone'`, `start_url: '/'`, `theme_color` and
`background_color` from the tokens, `shortcuts` to `/kitchen`, `/gym`, `/swim`, `/health`, which
is the one place the four daily apps deserve to be listed by hand), plus `icon.png` and
`apple-icon.png` drawn in the same single-stroke style as the hub illustrations. Not a service
worker: nothing here works offline by design, and a stale cached `/kitchen` would be the Law 2
incident in a new shape.

### B4. The gym has no screen wake lock; the kitchen does. P2

`src/lib/kitchen/timers.ts` requests `navigator.wakeLock` while a timer runs. `src/app/gym/GymClient.tsx`
does not, so during a 3-minute rest the phone sleeps in 30 seconds and every set begins by unlocking
it. The rest timer also only vibrates; the kitchen alarm has audio. Lift the wake-lock pair out of
`timers.ts` into `src/lib/wake.ts`, request it when the first set is ticked, release it on finish.

### B5. No `<main>`, no skip link, and the reading nav is a paragraph. P2

**Evidence.** Lighthouse fails `landmark-one-main` on all three pages measured, and the geometry run
found no `<main>` on any of the 43 routes. The reading app's tab row is `<p className="surf-nav">`
on five pages. Curio, music, the hub, the four work pages and the login pages have no `<nav>` at
all (their only navigation is the header link, which is fine, but the reading one is a real nav).
The sub-tab rows on the training routes are `<div className="subtabs">` with `aria-current` on the
links, which is good, and no `<nav>` around them.

**Fix.** `<main>` in the root layout around `{children}` would be wrong (it would wrap the per-app
header). Put it in each app layout around `{children}` and around the hub's `.idx`. `<nav>` on the
reading tab row and the sub-tab rows. A visually hidden "Skip to content" link in `SiteHeader`.

### B6. Real tap targets under the 24px WCAG minimum, hidden from the probe. P2

The probe measures height only and allowlists `.rowaction`. Measured at 390 on this build:

| Control | Where | Size |
|---|---|---|
| "source" links, one per answer | `/curio`, 95 of them | 55 x 16 |
| track and artist links in the charts | `/music`, 120 of them | 18 tall |
| "open the source" under every cue | `/swim?s=how`, `/run?s=how`, `/bike?s=how`, `/swim?s=teach` | 104 x 17 |
| "check it against the kitchen" | `/kitchen`, `/kitchen/find`, every external row | 159 x 17 |
| "not this" | every dish row, `.rowaction`, allowlisted | 62 x 33 |
| "Back to the workout" / "Back to the plan" / "Back to Swim" | `/gym/log`, `/run/log`, `/bike/log`, `/swim/records` | 19 tall |
| "How this works and where the numbers come from" | `/reading`, `/reading/shelf` | 285 x 16 |
| "Now", "How" sub-tabs | all five training routes | 24 wide x 44 tall |

The site's own rule distinguishes an inline link inside a sentence (exempt) from a control someone
aims at. The curio "source", the music chart links, the "open the source" and "check it against the
kitchen" lines are standalone controls on their own line, not inline prose. WCAG 2.5.8 sets 24 x 24
as the AA floor; several of these are under it.

**Fix.** `display: inline-flex; min-height: 44px` on `.curio .src`, `.music .cname a`, the
`.src-body a` and the `.mealmeta a`, the same treatment `.plainlist a` already got. Then widen the
probe: check width as well as height for controls whose text is under 12 characters, and print the
allowlisted findings once per run rather than only under `PROBE_TAPS_SHOW_ALLOWED=1`, so the 33px
"not this" is seen every time rather than never.

### B7. Collapsed sections with no disclosure affordance. P2

On `/gym` every exercise carries "HOW TO DO IT" and every block "WHY THIS IS HERE" as a
`<details>` summary styled as a plain mono label: no triangle, no underline, no chevron. In the
screenshot they read as headings over nothing. The kitchen's "NARROW IT DOWN" and the French app's
folds show the marker; the training stylesheet suppresses it. He asked for the cue to be hidden
(note #12); he did not ask for it to be undiscoverable. A right-aligned chevron in
`--muted-foreground` that rotates on `[open]` costs three lines in `training.css` and applies to
`.cuefold`, `.src` and `.ladder-all` at once.

### B8. The volume table at 390 cuts the exercise column mid-word with no scroll affordance. P2

`/health?s=volume` puts the day columns in `.table-scroll` (`overflow-x: auto`). Correct in
principle, and the caption says "The columns scroll sideways inside the table". On the screen the
third column shows "BB / Bul" and "BB / hal / 1.5" clipped at the right edge with no shadow, fade or
handle, and a horizontal scroll inside a vertical page is the gesture phones fight hardest. This is
the exact shape the 2026-08-28 audit flagged on `/swim/records` and it is still the pattern here.

**Fix, offered as an axis rather than a pick.** (a) Keep the scroll and add a right-edge fade
(`mask-image` on `.table-scroll`) plus a one-line "swipe for the days" hint on first render.
(b) Stack it: at under 560px each muscle becomes a row with the four day totals as a 4-cell strip
underneath, and the per-lift detail stays behind the tap it already has. (c) Show only the "Wk"
column on the phone and the day matrix on the tablet and desktop, since the question he asked
("what are the numbers") is answered by the total. (b) is what the rest of the site does with
tables; (c) is the smallest change.

### B9. The sub-tab row can neither wrap nor scroll, and it has already shaped the site. P3

`.training .subtabs` is `display: flex` with no wrap and no overflow. This is documented as the
reason `/swim/deep`, `/swim/records` and `/health/deep` are routes rather than tabs, and the five
swim chips measure 337px of 390. `overflow-x: auto` with `scroll-snap-type: x proximity` and a
right fade would remove the constraint for the cost of five CSS lines. Not urgent, since the routes
work, but it is a design decision made by a stylesheet limitation, and a reviewer reading the
comments will notice that.

### B10. Above 1024 most of the site is a phone column standing in a void. P3, a decision

Zero `@media` rules in `training.css`, `reading.css`, `french.css` and `charts.css`. `/kitchen` is
11.5 screens tall at 1440 in a 680px column; `/reading/shelf` is 13; `/gym` is 7.2. The `.measure-data`
opt-in (960 above 1024) is used by `/curio`, `/music` and `/health` and it works well there. The
globals comment argues that reading surfaces should keep the narrow measure, and for a dish step it
is right. For a 2,835-dish list, a 778-book shelf and a 21-set workout it is a phone layout on a
laptop.

**The axis.** (a) Leave it: the phone is the product and the desktop is incidental. Honest, and it
is where the site is today. (b) Opt `/kitchen`, `/kitchen/find`, `/reading/shelf` and `/gym` into
`.measure-data` and let the meal rows and shelf rows go two-up above 1024 with one `grid` rule each.
(c) A real desktop layout for the two apps a stranger will actually open (`/kitchen/find` and
`/reading/shelf`): filters in a left rail, results on the right, which is what both reference
catalogues the shelf was copied from do on a wide screen. (b) is a morning; (c) is a redesign and
not worth it until someone other than him opens those pages on a laptop.

### B11. Logging a set means typing the weight the app just told you. P2

On `/gym` every exercise shows a suggestion ("135 lb x 8") and three empty `lb` / `reps` inputs.
There is no way to accept the suggestion with a tap; every set is typed on a phone keyboard with
chalk on the fingers. `type="number"` inputs also have no visible stepper on iOS.

**Fix.** Pre-fill the row with the suggestion the first time the card renders (the value is already
in `plan[eff.id].suggestion`) and mark the row `estimated` until he edits or ticks it, which is the
column that already exists to say "this number was not typed". Add a `+5` / `-5` (or the exercise's
`increment`) tap pair beside the weight. Both keep the ladder honest and cut a session's taps by
roughly two thirds.

### B12. Ticking a shopping item reloads the whole shopping analysis. P3

`ListClient.tsx` calls `router.refresh()` after every `got` / `add` / `drop`, which re-runs
`shoppingView()` and `shoppingList()` on the server (the whole unlock analysis) before the row
moves. In an aisle on one bar of signal the tick lands a second or two later. Move the row locally
first (optimistic), then refresh; the queued-write pattern `GymClient.tsx` already has is the model.

### B13. `prefers-reduced-motion` is honoured only in `hub.css`. P3, and it is fine

The equaliser is the only animation on the site, so this is technically complete. Noted so nobody
adds a transition elsewhere without the guard.

---

## C. Performance and cost

### C1. `/kitchen` ships 1.39 MB, 838 KB of it fifteen thumbnails. P2

Lighthouse network breakdown, live `/kitchen`: images 838 KB across 15 requests (about 56 KB each
for a 56 x 56 tile), scripts 257 KB, fonts 70 KB, RSC fetch payloads 168 KB, document 18 KB. The
thumbnails are TheMealDB's `/preview` derivative, which the code comment calls "grid-sized"; it is
not. Main-thread work 4.3 s and script bootup 2.9 s, both scored 0, against 30 ms of total blocking
time, which means the work is happening off the critical path but is happening.

**Fix.** Check what `/preview` actually returns (a 300px or 700px JPEG, by the byte count) and
whether the provider offers a `/small` variant. If not, `loading="lazy"` is already set; add
`fetchpriority="low"` and `decoding="async"`, and cap the front page at the first 20 thumbnails
rendered as images with the rest as the empty tile until scrolled into view. Not `next/image`: the
comment's reason (transform allowance on a one-user page) still stands.

### C2. Neon round trips, unchanged since the last count. P2, already filed

`../2026-08-28/00-INDEX.md` T7 stands: `/gym` 52 to 76 round trips per open, `/gym/api/plan` two
queries per exercise. `sql.transaction` is used in four places (`shelf-db.ts`, `queue-db.ts`,
`health/year.ts` twice) and nowhere in `gym`, `swim`, `french`, `music` or `kitchen`. Nothing new
to add except that B1's caching layer would make it matter less.

### C3. Fonts are loaded from Google at request time. P3

Two families, six weights, 70 KB, `display: swap`. `next/font/google` self-hosts them at build so
this is already the right way; the one improvement is trimming `600` from the mono if nothing uses
it (`grep` for `font-weight: 600` inside mono selectors before deciding).

---

## D. Security posture, as an engineer would read it

The 2026-08-26 security report found no exploitable hole and this audit agrees. What follows is
what a reviewer scanning the headers and the auth code would flag.

### D1. No security headers beyond HSTS. P2

`curl -I https://hoodii.studio` returns `Strict-Transport-Security` and nothing else: no
`Content-Security-Policy`, no `X-Content-Type-Options: nosniff`, no `Referrer-Policy`, no
`Permissions-Policy`, no `X-Frame-Options`. A `headers()` block in `next.config.ts` with the four
cheap ones is ten lines. A CSP is more work because of the inline `ld+json` script on the hub, the
external recipe photos and cover images, and Spotify links; start with `Report-Only` and read the
reports before enforcing. This is also what makes A9's comment true.

### D2. The session cookie IS the secret. P3, a design note

`login-server.ts` and `kitchen/api/unlock` set the cookie value to `KITCHEN_SESSION_SECRET` itself,
and `auth.ts` compares by equality. Consequences: a cookie read off one device is the secret for
every device, there is no per-device revocation short of rotating the env var everywhere, and the
password comparison (`pw !== expected`) is not constant-time (the 600 ms delay masks it in
practice). For one user with a strong password behind a per-IP rate limit this is acceptable, and
AGENTS.md's argument against an auth product is sound. A reviewer will still raise it. The
minimal upgrade that keeps the "no auth product" stance: sign a random per-login token with the
secret (HMAC, `crypto.subtle` is edge-safe), store nothing, and compare with `timingSafeEqual`.
Rotating the secret then logs every device out, which is the property he does not have today.

### D3. Most write routes accept an unbounded JSON body. P3

`kitchen/api/note`, `gym/api/note`, `french/api/cards` cap their fields. `kitchen/api/finish`,
`kitchen/api/shop`, `kitchen/api/veto`, `gym/api/set`, `gym/api/finish`, `reading/api/want`,
`french/api/chapter` do not. Vercel's 4.5 MB request cap is the only bound. All are cookie-gated,
so the exposure is one user's own device. A shared `readJson(req, maxBytes)` helper closes the class
in one file.

### D4. The firewall challenge is a real visitor's first impression of two apps. Note, not a defect

`/kitchen/find`, `/reading/shelf` and `/reading/want` answer 429 plus a JavaScript challenge to
any request without the `kos` cookie, including a real phone browser. The challenge resolves in a
second or two and the page loads, so for a person it is a "verifying your browser" flash rather than
a wall, and it exists because those three routes cost 178,000 invocations in twelve hours on
2026-08-24. It is the right trade and it is worth knowing that a recruiter tapping "Dishes" or
"Browse" sees Vercel's interstitial before the site's own page. If either of those pages is meant
to be part of the showcase, B1's caching layer is what would let the challenge come off.

---

## E. The repo as a portfolio artifact

An engineer who follows the GitHub link in the footer sees this before any page.

### E1. `README.md` describes a WebGL room that was deleted on 2026-08-09. P1

It opens with "The 3D rebuild of hoodii.studio, an agent's studio in WebGL", lists Three.js, React
Three Fiber, drei, postprocessing, GSAP and zustand as the stack (all removed), and points at a
design doc `AGENTS.md` explicitly calls history. `AGENTS.md` is 700 lines and accurate;
`README.md` is 30 lines and false. The README is the file GitHub renders on the landing page.

**Fix.** Rewrite it as the thirty-line front door to `AGENTS.md`: what the site is, the stack, how
to run it, the one-line verify gate, and a pointer to the surfaces table. Derive nothing typed;
link to the things that are.

### E2. No CI. The tests run when someone remembers. P1

`.github/workflows` does not exist. `package.json` has no `test` script. The four test suites
(`format.test.ts`, `progression.test.ts`, `split.test.ts`, `coverage.test.ts`) and the two
validator regression suites run only inside `scripts/verify.mjs`, which is run by hand before a
push. `pnpm build` (which Vercel runs) covers the content validators and the lint scripts, but
neither ESLint nor the six test suites. In a workspace whose founding law is "a rule that does not
execute is decoration", the tests are decoration on every push where nobody typed `verify`.

**Fix.** One workflow: on push and pull request, `pnpm install --frozen-lockfile`, `typecheck`,
`lint`, the six suites, then `build`. Add `"test"` to `package.json` so `pnpm test` means something.
Twenty lines of YAML and it is the single most visible signal of engineering discipline a repo can
carry.

### E3. Tracked files that should not be. P2

`git ls-files` shows: `mv.tmp.mjs` at the repo root (a one-shot edit script from a past session,
which the workspace's own convention says goes to a temp directory), `docs/gym-answers.html`, and
`public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` (the create-next-app starter
set, untouched since May). `git rm` all seven.

### E4. Dependencies with zero imports. P2

| Package | Imports in `src` | Verdict |
|---|---|---|
| `lucide-react` | 0 | remove |
| `radix-ui` | 0 | remove |
| `class-variance-authority` | 0 | remove |
| `tw-animate-css` | 1 CSS import, 0 `animate-` classes anywhere | remove |
| `psn-api` | 1, in `fetchers.ts` for a feature with an expired token and no consumer | remove with E5 |

`pnpm remove`, never by editing `package.json` (the 2026-08-09 lockfile lesson). `shadcn`,
`tailwind-merge` and `clsx` are used and stay.

### E5. Dead endpoints. P2

`/api/psn` and `/api/psn-image` (expired `PSN_NPSSO`, zero consumers, the second is an open image
proxy with a host allowlist), and `/gym/api/next` (zero callers in `src`). Each is a public route
that costs a cold start when a crawler finds it. Delete all three and `fetchPsn` with them. The
2026-08-26 audit listed these under T11 and they are still here.

### E6. The unlock form exists four times. P2

`src/components/SaveBlocked.tsx` is the shared one. `CookClient.tsx` (`SaveFailed`),
`HideDish.tsx` (`Failed`) and `ListClient.tsx` (`Failed`) each carry a near-identical private copy
with the same password field, the same "Unlock and save" button and the same copy text, differing
in a few words. Four places to fix the next unlock bug. Replace the three with `SaveBlocked`, which
already takes `noun`, `queued`, `onRetry` and `loginHref`.

### E7. A `<button>` inside every dish row has an accessible name that does not include its label. P3

Lighthouse `label-content-name-mismatch` on 53 rows of `/kitchen`: `aria-label="Stop showing X"`
on a button whose visible text is "not this". Voice-control users say what they see. Make the
visible text part of the name: `aria-label={\`Not this: stop showing ${name}\`}`, or drop the
aria-label and put the dish name in a visually hidden span.

### E8. Comments that describe code that is not there

A9's CSP sentence. `kitchen/[id]/CookClient.tsx` line 342's colour intent. `README.md` entire. The
repo's own rule ("a doc that describes the code as it used to be is instructions for a regression")
applies; these three are the instances found.

### E9. The measuring tools are phone-only

`probe-taps.mjs` and `shoot.mjs` hardcode 390. Every layout decision on this site has been checked
at one width, which is how B10 happened without anyone deciding it. Add a `VIEWPORTS` array to
`probe-taps.mjs` (390, 768, 1440), run the overflow and chip-row checks at all three, and keep the
44px floor phone-only since it is a touch rule. The scratchpad driver used for this audit is that
change, already written.

---

## F. What is not worth it

Said plainly, because the brief asked.

- **PSN.** Dead for months, nothing reads it. Delete the two routes, the fetcher and the package.
- **`/gym/api/next`.** Zero callers. Delete.
- **`tw-animate-css`, `lucide-react`, `radix-ui`, `class-variance-authority`.** Installed by the
  shadcn scaffold, used by nothing. Remove.
- **Four login pages.** One cookie, one form, four routes with four redirect guards and one bug
  (A3). One `/login?to=` route.
- **Three private copies of the unlock form.** See E6.
- **A desktop redesign of the data surfaces (B10 option c).** Not until someone other than him
  opens them on a laptop. Option (b) is enough.
- **A service worker or offline mode.** Every page is a mirror of a live store, and a stale cached
  cook screen is the Law 2 incident again. The manifest without a worker (B3) gets the icon and the
  standalone window, which is all he needs.
- **`counted` in `kitchen/page.tsx`.** Computed on every request, rendered nowhere since
  2026-08-13, kept "for whoever wants it back". Delete it; git has it.
- **The 56-cell French heatmap on an empty app.** Fifty-six grey squares under "No cards yet" is a
  chart of nothing. Render it only when there is at least one reviewed day. Small, but it is on the
  page a stranger sees when the hub says "No cards yet".

## G. What is missing, for the showcase specifically

Everything above is about the apps working well. This is about a stranger understanding what they
are looking at.

**G1. The front door shows state and never shows the software.** The hub is, by design, eight rows
of live sentences. That design is right and it is also the reason a visitor has no idea the cook
screen exists, or that there is a step-by-step timer rail, or what the gym card looks like mid-set.
The four case studies are text. Nowhere on the site is there a picture of the site. The axis:
(a) one screenshot per app on its `/work` page (only `/work/kitchen` exists as a case study today),
taken by `shoot.mjs` at build time so it cannot go stale; (b) a single `/work/site` page, "how this
site is built", that shows the shots and derives its facts from the repo: the number of routes from
the manifest, the number of build gates from `package.json`, the number of tests from a glob, none
typed; (c) leave the hub as it is and let the code speak. (b) is the one that turns the strongest
thing in this repo, the gates, into something a reader can see in ninety seconds.

**G2. The stopped-projects section is the most human thing on the page and it is at the bottom.**
"What I stopped building" is the section a generated portfolio cannot have, and it sits below the
fold on every device. Not a bug; a placement worth reconsidering once G1 exists.

**G3. Nothing says the site is open source.** The footer links to GitHub the person, not to this
repo. One link, "this site's code", next to it.

---

## Execution order

**Batch 1, the afternoon that changes how it feels (B1 layer 1, B2, B3).** `loading.tsx` in nine
segments, `prefers-color-scheme` on the existing `.dark` block plus `themeColor` media pairs, a
manifest and two icons. Screenshot every route in both themes at 390 before pushing.

**Batch 2, the defects (A1 to A8, E7).** Nine small diffs, each with a screenshot or a Lighthouse
re-run as its verification. A1 and A3 first: one is an invisible warning on the surface DESIGN.md
says matters most, the other dumps him in the wrong app after a correct password.

**Batch 3, the repo (E1 to E6).** README, CI workflow with `pnpm test`, seven `git rm`, five
`pnpm remove`, three dead routes, one shared unlock component. Half a day, and it is the half-day an
engineer reading the repo would notice most.

**Batch 4, the phone details (B4 to B8, B11).** Wake lock, landmarks, the sub-24px controls, the
disclosure chevrons, the volume table (his call between the three shapes), suggestion pre-fill on
the gym card.

**Batch 5, the second layer of speed (B1 layers 2 and 3, C1).** Suspense around the corpus scoring,
`'use cache'` on the pure computation, thumbnails at the right size. Measure `curl -w` and speed
index before and after.

**Batch 6, posture and polish (D1, D3, B9, B10 option b, E9, G1).**

Two things need him before anything is built: which shape the volume table takes at 390 (B8), and
whether the site should show pictures of itself (G1). Both are judgment, not mechanism.

## Constraints that bind every executor

Read the finding here first, then the file. `node scripts/gym-notes.mjs` and
`node scripts/kitchen-notes.mjs` before touching those surfaces. `node scripts/verify.mjs` before
any push, `git pull --rebase origin main` first. No em dashes, no emoji, no colour literal outside
`globals.css`: four build gates enforce those. Never edit `package.json` dependencies by hand. New
write routes go in `WRITE_ROUTES`. Screenshot at 390 and LOOK at it; after B2, in both themes.
