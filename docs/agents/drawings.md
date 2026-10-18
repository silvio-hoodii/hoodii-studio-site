---
moved: 2026-10-18, verbatim from AGENTS.md, which now points here. Not re-audited beyond the dead paths fixed that day.
---

# Drawings and the icon

## Drawings

**THE HUB ILLUSTRATIONS DESCRIBED HERE NO LONGER EXIST.** This section said they were "drawn as
inline SVG in `src/app/page.tsx`", and that file contains zero `viewBox` and zero `<svg>`: the hub
is text rows and has been for some time. Corrected 2026-09-04, found while looking for a mark to
base a favicon on and discovering there was nothing to match. E8's class, in this file.

The principles survive the drawings, because they are what the ONE mark on the site is built to:

**No human is in the asset loop, and no image files to go stale.** `src/lib/icon-mark.tsx` is the
browser-tab and home-screen icon, drawn in JSX and rendered by `ImageResponse` at build, taking
every colour from `src/lib/tokens.generated.ts`. Every dimension in it is a fraction of the canvas,
so 32px and 512px are one drawing rather than two.

**Each has to read small, and that is checked by looking.** Two drafts of a kettlebell both read as
a handbag before one became a dumbbell. The icon cost two drafts the same way: an indicator-light
design was illegible at 32px AND put `--signal` in a logo, which breaks the rule that the colour
means a value true right now. **Render it and look at it** rather than trusting the path data.

