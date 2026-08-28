---
audit: UX/UI, whole site
date: 2026-08-26
auditor: adversarial UX/UI pass (read-only)
observed-live: /, /kitchen, /gym, /gym/conditioning, /health, /french, /curio, /music, /reading, /reading/about, /reading/finished, /work (404 page). All at 390x844 (deviceScaleFactor 2, mobile) plus a 1440x900 desktop shot each, in a fresh headless Chrome against https://hoodii.studio. The logged-in Chrome on CDP 9222 was NOT listening, so a separate headless instance was launched with its own profile and a fetch/XHR guard that rejects every non-GET before page scripts run. Nothing was clicked, submitted, or posted.
code-only: /kitchen/find, /reading/shelf, /reading/want (all three returned the Vercel Security Checkpoint to a cookie-less browser, per firewall rule 3, so every claim about them below is from source, and is labelled). /swim not visited (another agent owns it). Login pages, /callback: code only.
also-measured: rendered HTML of 11 live routes grepped byte-exact for U+2014/U+2013 (zero found); every visible a/button/summary/input measured at 390px via getBoundingClientRect; horizontal overflow measured (scrollWidth vs innerWidth) on all 12 rendered routes.
---

# UX/UI audit, hoodii.studio

Hunted per the brief: hardcoded colours, --signal abuse, AI-slop tells, phone failures at 390px,
dishonest states, explanation-as-copy, cross-app divergence, accessibility floor. Where a class
repeats, the gate extension leads and instances follow.

## P1

### P1-1. The music collector alarm wears --signal. A data-loss alarm renders in the site's "all good" colour.

- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\music\music.css` lines 43-53:
  `.music .alarm { ... border-left: 2px solid var(--signal); }`, under the comment "A left rule in
  the signal colour, not a filled banner."
- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\music\page.tsx` lines 90-98 mount it:
  "**The collector is not working.** ... Plays are being lost while this is true, and they cannot
  be recovered later."
- Why: every other surface trains the reader that green means a value that is true and healthy
  right now, and the site's own record says so for the error case: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\callback\callback.css`
  lines 35-38, "--destructive, not --signal ... It also read as green, which is the wrong thing
  for an error to be." This is the identical mistake one file over, on the one state /music exists
  to make loud (AGENTS.md: "the hub row both shout when the last successful run is over 36 hours
  old"). At a glance the shout reads as good news.
- Fix: in music.css change `.music .alarm` border-left to `var(--destructive)`, matching
  `.reading .stale` and `.training .stale`. Optionally add the mono `.k` kicker those two carry so
  the three staleness banners are one idiom.
- Verify: set `summary.liveness.stale` true locally (or temporarily flip the 36h threshold),
  screenshot /music at 390px, confirm the banner reads as the same red-left-rule family as
  /reading's stale block. Code-only observation: the alarm was not firing during this audit, which
  is exactly why it will not be caught by looking at the healthy page.

## P2

### P2-1. Tap targets under the 44px floor, one family, seven instances. Lead with the gate.

The repo has fixed this class at least nine separate times, each fix a comment plus a min-height
in one selector (globals.css site-footer, .chip, curio .src, music .more summary, reading .acts,
.rtab, .tier-src, kitchen .prov summary, .plainlist a). The class keeps reappearing because
nothing measures. Every instance below was found in one automated sweep: open the page in
headless Chrome at 390px, getBoundingClientRect on every visible a/button/summary/input, flag
height under 43px.

**Gate (law 1): add that sweep as a script, e.g. `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\probe-taps.mjs`,**
reusing the zero-dependency raw-CDP pattern of `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\probe-kitchen.mjs`
(findChrome, /json/new, Runtime.evaluate), read-only so it needs no write stubs, with a declared
allowlist for the two documented exceptions (`.kos .rowaction`, inline links inside a sentence
per work.css lines 62-71). Run it in the same breath as the other probes. A floor that is only
prose will be under-run again; this one is measurable in 30 lines.

Instances, all measured live at 390px except the last (labelled):

1. `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\training.css` lines 247-256:
   `.training details.fold summary` has no min-height. Measured on /gym: "Warmup (4 min)" 350x17,
   "Cooldown" 350x17, "RIR guide" 350x17. These are opened mid-session with one hand; the same
   file gives `details.src.wk > summary` 44px (line 653) and `details.cue > summary` 48px
   (line 491), so the floor was applied to the neighbours and missed here.
   Fix: `min-height: 44px; display: flex; align-items: center;` on that summary.
2. `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\kitchen\kitchen.css` lines 779-792:
   `.kos details.fold > summary` has `padding: 2px 0` and no floor. Measured on /kitchen: "No
   recipe really needed (5)" 350x22, "Everything else in here (27)" 350x22, on the surface whose
   own design doc sets a 56px floor. `.kos .prov > summary` five rules up got 44px with a comment.
   Same fix.
3. `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\kitchen\MealRow.tsx` line 144: the
   "check it against the kitchen" link measured 159x17 on /kitchen. It is not an inline link in a
   sentence (the work.css exception); it stands alone in its own `.mealmeta` line as the row's
   action, fourteen times down the page he uses with wet hands. Fix: style it like
   `.kos .plainlist a` (inline-flex, min-height 44px), in kitchen.css scoped to `.mealmeta a`.
4. `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\music\music.css` lines 158-160 and
   188-190: `.cname a` and `.ptrack a` have no height treatment. Measured on /music: forty
   track/artist links per screenful at 18px tall ("Negro" 48x18, "Someone You Loved" 134x18 ...).
   Every one is an off-site control. Fix: same inline-flex/min-height recipe; the 6px row padding
   already spaces the list so the growth is absorbed.
5. `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\curio\page.tsx` line 66 renders the
   ledger's "source" link bare inside `.la`, measured 55x16, while line 45 renders the digest's
   "source" with `className="src"` which curio.css lines 96-101 deliberately padded to 44px with a
   comment saying why. Same word, same job, two heights, one file. Fix: give the ledger link the
   `src` class (or extend the curio.css rule to `.curio .la a`).
6. `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\reading\about\page.tsx` line 104:
   the 33 source-list links measured 17px tall (one-line names) in rows. Fix: inline-flex,
   min-height 44px on those `<a>` via a reading.css rule for the list.
7. Code-only (page behind the edge challenge):
   `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\reading\reading.css` line 824:
   `.wantbtn` sets `min-height: 32px` on the one write control of the shelf page, used standing
   in a shop with a book in the other hand. The A-rail beside it keeps 44px with a comment about
   that exact posture (lines 553-563). Fix: 44px, no reason recorded for 32.
- Verify each: re-run the sweep (or the new probe) and confirm zero heights under 43 outside the
  allowlist.

### P2-2. Two "Borrow now" chips that mean different things, distinguished by colour alone.

- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\reading\page.tsx` line 109:
  `<span className={`verdict${actionableNow ? ' now' : ''}`}>{verdictLabel[acquisition.verdict]}</span>`,
  with `.verdict.now { color: var(--signal); border-color: var(--signal); }` at
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\reading\reading.css` line 418.
- Screenshot observation, /reading at 390px: The Underground Railroad carries a green "BORROW NOW"
  chip (home-branch copy on the shelf today) and Life After Life a grey "BORROW NOW" chip
  (borrowable somewhere, not at the home branch), on the same screen, same text, same shape.
- Why: colour is the ONLY carrier of the one fact the queue-types comment calls "the one fact
  that changes what to do today" (`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\reading\queue-types.ts`
  lines 126-128). For a colourblind reader, or greyscale/e-ink, the two chips are identical, and
  the detail is only inside the collapsed row.
- Fix: let the words change with the state: when `actionableNow`, render "On the shelf" (or
  "Borrow now · on the shelf") instead of the shared verdict label. The green stays; the text now
  carries the same fact. One line in page.tsx.
- Verify: screenshot /reading with both states present; the two chips must differ in words, not
  only in colour.

### P2-3. A fire emoji in rendered copy, and it is a copy pair.

- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\reading\queue-types.ts` line 86:
  `current: '🔥 current'`, and the identical string again at
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\reading\catalog-types.ts` line 29.
  Confirmed rendering in the live /reading screenshot next to "CURRENT" on two queue rows.
- Why: the design brief is a monochrome instrument with one chromatic colour; music.css refuses
  album covers for exactly this reason ("a grid of full-colour covers is the one thing that would
  visibly break a monochrome system built on purpose"). A full-colour emoji glyph is the same
  break at 14px, it is a decorative-emoji tell, and the string existing twice is the drift the
  stylesheet consolidation pass spent itself undoing.
- Fix: drop the emoji from both files ("current" already says it; the track label idiom elsewhere
  is plain mono text), and while there, make one of the two files import the label map from the
  other so the pair cannot drift.
- Gate: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\lint-prose.mjs` already walks
  every rendered-string file; add an emoji-range check (`/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u`)
  beside the dash check, same allow-marker. Note when doing this: `grep -P` for these ranges fails
  on this machine with "supports only unibyte and UTF-8 locales", the exact failure mode
  ENGINEERING.md documents, so the check must be node, not grep. It reproduced during this audit.
- Verify: lint-prose exits 1 on a planted emoji in a .ts string, 0 after removal.

### P2-4. --signal drift: the one colour now marks navigation and categories, not only live values.

No gate can judge semantics, so this is a review list (grep `--signal` stays cheap). Judged
against the written rule, "a value that is true right now":

1. `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\kitchen\kitchen.css` line 651:
   `.kos .kosnav-here { ... box-shadow: inset 0 -2px 0 var(--signal); }`. The current-page marker
   in the kitchen nav is a green underline that is on for some item on every kitchen page forever.
   Where you are is navigation state, not a live value, and the rest of the site agrees: gym/swim
   subtabs mark current with ink (`.training .subtab.on`, border-bottom `var(--foreground)`,
   training.css line 769) and top tabs with an inverted fill. Screenshot observation: COOK
   underlined in green on /kitchen. Axis of divergence: current-marker = inverted fill (tabs) /
   ink underline (subtabs) / signal underline (kitchen only). Fix: `var(--foreground)` in that
   box-shadow; the bold weight already separates it from siblings.
2. `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\curio\curio.css` line 142:
   `.curio .flav-myth { color: var(--signal); border-color: var(--signal); }`. A flavour CATEGORY
   tag, green on every archived myth row permanently. The tag's own text already says "myth", so
   the colour carries nothing the word does not. Fix: monochrome like the other flavours, or
   `--foreground` if myth should read louder.
3. Deliberate stretches, recorded as such, no change urged, but they are why the rule needs the
   review list: reading's grab tier (`.t-grab`, reading.css line 626, argued in the file as "the
   same affirmative"), the sort menu's green checkmark (line 790, selection state, where every
   other selected control on the site inverts instead), french's activity heatmap ramp
   (french.css lines 127-130, PAST days shaded in signal mixes, where /health's equivalent strip
   is deliberately monochrome: axis = same day-strip, two colour scales), and
   `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\health.css` line 67
   (`.stat-d.down`, a delta against a measurement 34 days old). Each is one green away from the
   colour meaning "good" instead of "now".

### P2-5. Gate gap: nothing checks for hardcoded colour, the audit's first target class.

Today the codebase is CLEAN: a byte-level sweep of all 12 per-surface CSS files, inline styles,
and Tailwind arbitrary values found zero hex/rgb/hsl/oklch/named-colour literals outside
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\globals.css` (tokens), the five layout
`themeColor: '#ffffff'` viewport exports, and the four documented token mirrors in
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\opengraph-image.tsx` lines 22-25 (an
ImageResponse cannot read CSS variables). That state is maintained only by vigilance: french.css's
header records that this surface arrived carrying its own blue/green palette and had to be
collapsed by hand, and `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\lint-classnames.mjs`
deliberately scopes itself to layout-affecting class collisions, so no gate would catch the next
`#faf6f0`.

- Fix (law 1): a `lint-tokens.mjs` in the same style as lint-classnames (selftest first, both
  directions): fail on a colour literal in `src/app/**/*.css` outside globals.css, and on colour
  literals inside `style={{...}}` or `-[#`-style arbitrary values in `src/**/*.tsx`, with the
  `lint-prose-allow`-style marker for the two legitimate sites (opengraph-image.tsx, themeColor).
  Wire it into `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\verify.mjs` so the
  pre-push hook runs it.
- Verify: plant `color: #d86a2f` in kitchen.css, lint exits 1; remove, exits 0; the two allowed
  files pass with markers.

### P2-6. Coverage gap in lint-prose: agent-authored prose that reaches pages through Neon.

`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\lint-prose.mjs` walks src, content and
scripts. The curio answers and digest openers (/curio) and the reading queue's why-lines
(/reading `.qwhy`) are agent-written prose that arrive via mirrors from CuriosityOS and ReadingOS
and never pass through this repo's lint. Live check during this audit: the rendered HTML of all
11 reachable routes carries zero U+2014/U+2013 today, so nothing is broken, but the gate's
coverage claim stops at the repo boundary while the pages do not.
- Fix: the check belongs where the rows are written, per the regeneration-gate precedent: the
  CuriosityOS log-to-Neon mirror and `ReadingOS`'s queue sync (invoked via
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\reading\sync.mjs`) should refuse a row
  containing the three dash forms, same characters, same message as lint-prose. Open Library
  descriptions and publisher text stay exempt (third-party provenance, same argument the lint
  already makes for corpus/ and imported/).
- Verify: plant an em dash in a test row, sync refuses; the live-HTML grep above stays at zero.

## P3

1. **Focus outline removed on the most-used inputs.**
   `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\training.css` line 184
   (`.training .set-row input:focus { outline: none; ... }`) outranks the file's own
   `input:focus-visible` signal ring (lines 294-301) on specificity, and line 370 does the same to
   `.note-box`; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\french\french.css`
   line 118 likewise. A 1px border-colour darkening remains as the only keyboard-focus carrier.
   Fix: delete the `outline: none` and let `:focus-visible` paint (pointer focus stays quiet, that
   is what focus-visible is for). Verify: tab to a set input, the ring shows; tap it, no ring.
2. **No `<main>` landmark anywhere.** Grep of src finds zero `<main`. ARIA detail work elsewhere
   is far above the floor (chart `role="img"` labels, `aria-current`, `aria-pressed`, the
   adherence strip's four spoken states), which makes the missing top-level landmark the odd gap.
   Fix: each layout wraps `children` in `<main>`; on the hub, the `.idx` wrapper can simply be
   `<main className="idx">`. Verify: one landmark per page in devtools accessibility tree.
3. **Adherence strip cells are 16x16 buttons whose information is hover-only.**
   `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\HealthCharts.tsx` lines
   296-303: each day is a `<button>` with `title` and `aria-label`, but `title` never shows on
   touch, taps do nothing, and thirty 16px tab stops precede the legend. Screen readers are
   served; the phone user, the primary user, cannot reach the per-day fact at all. Fix option on
   the axis cheap-to-thorough: (a) make them spans (drop the dead control semantics, keep
   aria-label off non-interactive art, legend carries meaning), or (b) a real tap behaviour
   showing the label line under the strip. Verify: tap a cell on a phone, either nothing is
   promised or something happens.
4. **Four hand-copied login pages.**
   `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\kitchen\login\page.tsx`,
   `...\gym\login\page.tsx`, `...\health\login\page.tsx`, `...\french\login\page.tsx` are the same
   component four times with an app name and a redirect prefix. The CSS side of exactly this was
   consolidated (globals.css password-field comment names French's 174px stub as the cost). Same
   move: one `<LoginPage app to>` component; the next gated surface then starts correct.
5. **The `.dark` token block is unreachable.**
   `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\globals.css` lines 109-132 define a
   full dark palette, `@custom-variant dark (&:is(.dark *))` is class-driven, and nothing in src
   ever sets the class (grep: zero). Dead paint that reads as a feature and will silently rot
   (new tokens will be added to :root and forgotten here). Fix: delete the block, or wire it to
   `prefers-color-scheme` on purpose; either is a decision, the current state is neither.
6. **`themeColor: '#ffffff'` is declared six times** (kitchen, gym, health, french, swim, work
   layouts) and is slightly whiter than `--background` (oklch 0.993). Next viewport config
   cascades from the root layout; one declaration there ends the copies. If the P2-5 lint lands,
   this is one of its two allow-marker sites, better made single first.
7. **Pill radii crept into /reading.**
   `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\reading\reading.css` lines 646 and
   726 use `border-radius: 99px` on the shelf chips and the filter-count badge, on a site whose
   radius is a 0.25rem token and whose own curio.css line 126 records "Pills are the card of
   typography." Fix: `var(--radius-sm)` both places.
8. **9.5px text on the technique-confidence badge.**
   `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\training.css` line 440 (`.conf`),
   the smallest type on the site (next smallest is 10px `.prov`, 10.5px labels). It carries the
   page's honesty claim ("evidence" vs "convention" vs "contested") and should not be the hardest
   thing to read. Fix: 10.5px to match `.sstat-k`.
9. **Page length at 390px, for the record** (measured): /kitchen 13.3 screens, /curio 11.6,
   /gym 10.2, /music 7.8. The 7.9-screen conditioning tab is what earned sub-tabs and the "infinite
   scroll" complaint on 2026-08-22. /curio and /music already hold theirs down with folds; /kitchen's
   13.3 is the offer list itself and /gym's 10.2 is one workout. No change urged; the numbers are
   here so the next "this page is infinite" conversation starts from a baseline. Axis if it comes:
   fold (curio), sub-tab split (conditioning), pagination (shelf).
10. **OG-image colours mirror tokens by comment only.**
    `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\opengraph-image.tsx` lines 22-25 pin
    four hexes to token names in comments; a token change silently un-matches the card. Cheap
    hedge: none worth building now; the P2-5 lint's allow-marker at least names the site so a
    token repaint greps into it.

## What is actually good

Measured, not impressions:

- **Zero horizontal scroll on all 12 rendered routes at 390px** (scrollWidth == 390 everywhere),
  and the two wide tables (run/swim ladders) scroll inside `.table-scroll` as designed.
- **Zero hardcoded colours in 12 per-surface CSS files.** The token discipline actually held, and
  where a surface arrived with its own palette (french, reading) the files record the collapse.
- **Zero em/en dashes in the live HTML of all 11 reachable routes**, byte-checked.
- **Honest states are the house style, everywhere observed live**: /kitchen prints "Stock last
  read 3 days ago ... Everything below assumes nothing has changed since"; /music prints "NOTHING
  PLAYING RIGHT NOW" instead of a stale track; /french renders zeros with the reason ("empty until
  I do"); /health's strip distinguishes rest, trained, logged-only, and no-data, with the legend
  only showing rows that exist on screen; /gym/conditioning caps its own streak number with "THIS
  IS LOAD, NOT RECOVERY" in destructive red; the 404 says "Either I moved it or it was never
  here." The four-states-one-pixel failure this audit hunted was already found and fixed here on
  2026-08-14, and the fix survived.
- **ARIA quality is unusual for a personal site**: charts are `role="img"` with data-bearing
  labels ("103.7 kg as of 2026-08-24"), tabs carry `aria-current`, the want button
  `aria-pressed`, decorative duplicate links are properly hidden, the external-link marker has
  spoken alt text, and the adherence cells speak the honest fourth state.
- **prefers-reduced-motion is honoured** on both real animations (hub equaliser, hub arrow).
- **--signal at the chart level is right**: history in ink, the latest point green, and
  training.css repeatedly REFUSES the colour with written reasons (lines 102, 148, 690, 843),
  which is the rule working.
- **The tap floor, where it was applied, was applied with reasons**, including a documented
  exception (`.kos .rowaction` at ~30px with its rationale written into kitchen.css lines 794-808).
  The P2-1 instances are the selectors the reasoning never reached, not a culture problem.

## Severity counts

| Severity | Count | Of which gate extensions |
|---|---|---|
| P1 | 1 | 0 |
| P2 | 6 | 3 (tap-floor probe, emoji in lint-prose, lint-tokens) |
| P3 | 10 | 0 |

Screenshots and per-route metrics from the live run are session artifacts (scratchpad, not
persisted); every claim above marked "measured" or "screenshot observation" came from that run,
and everything from an unrendered page is marked code-only.
