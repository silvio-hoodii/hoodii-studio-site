---
moved: 2026-10-18, verbatim from AGENTS.md, which now points here. Not re-audited beyond the dead paths fixed that day.
---

# Layout: desktop grid, pictures, relative days, two columns

**DESKTOP IS A GRID, THE PHONE IS A COLUMN, since 2026-09-27.** His words: *"the website looks like
its on for mobile, so when on desktop is only at the center"*. Below 720 nothing changed: every page
is the one reading column (`--measure: 680px`), and the 390px screenshots must not move. Above 1024,
a surface that opts into `.measure-data` gets 1120px, and the surfaces that are pictures use it:
the index runs its six app rows as a board (two across from 720, three from 1024, `hub.css`),
/music pairs its pictures (`.board` in `music.css`), /swim pairs its two swim charts (`.two` in
`training.css`), /health pairs its body charts (`.pair`), /reading fills the row with covers, the
Curio games and the kitchen list run two columns. /gym stays one column on purpose: it is a form he
fills at the rack. **A chart with text inside its viewBox keeps its `max-width`** (520 or 560):
scaled to 1120 its 9px labels were 30px. The index sparks are drawn TWICE at two intrinsic sizes
(`Spark.tsx`, `.spark-s` / `.spark-l`) and CSS shows one, because scaling the phone drawing made a
1.5px stroke 4px wide. Screenshot at 390 AND 1440 (`WIDTH=1440 node scripts/shoot.mjs ...`) before
calling a layout change done, **against a local `pnpm start`, never the live domain**: a run of a
dozen pages trips firewall rule 4 after about seven loads and every shot after that is the Vercel
checkpoint page (it happened on 2026-09-27, 33 of 38 shots), and a signed-in shot on the live domain
counts as one of his opens in `app_open`.

**THE PICTURES ARE DYNAMIC THROUGH ONE CLIENT COMPONENT, `src/components/Readout.tsx`.** Every chart
stays server-rendered SVG. Wrapped in `<Readout>`, any mark carrying `data-r="..."` shows that text
on tap or hover (a phone never shows an SVG `<title>`), and on first sight the wrapper adds `.in`,
under which `.vbar` grows from its base and `.vline` (a path with `pathLength="1"`) draws itself in.
No JavaScript, no class, no animation: the static picture is the fallback, and
`prefers-reduced-motion` switches it off. Inside a link (the index rows) a tap on a mark does not
navigate; a tap beside it does. The label is clamped inside its wrapper after it paints, because the
first bar of a chart sits at the left edge and half the label hung off the phone.

**RELATIVE DAYS ON THE INDEX ARE CORRECTED ON THE DEVICE**, `src/components/Ago.tsx`: the cached
page bakes in "4 days ago" at regeneration, and after a quiet night that is a day old. The server
text renders first; once hydrated the component recomputes the count from the device's calendar
day. It uses `useSyncExternalStore` for the hydration flag, not an effect that sets state, because
the React compiler lint refuses that shape.

**TWO COLUMNS ABOVE 1024 IS ONE IDIOM, `.two`**, declared per surface (`training.css`,
`kitchen.css`, `reading.css`): a grid of two `minmax(0, 1fr)` columns, `align-items: start`, every
child `min-width: 0`. The dish page and the recall pages put the part he acts on (the list, the
deck) in a sticky `.side`. The training prose keeps `max-width: 62ch` on `.ex-cue` and `.cue-body`
so a cue on the wide column is not 150 characters a line.

