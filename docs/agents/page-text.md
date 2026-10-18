---
moved: 2026-10-18, verbatim from AGENTS.md, which now points here. Not re-audited beyond the dead paths fixed that day.
---

# Page text

## Page text: what stays and what goes

His words, 2026-09-15: *"in general i feel there so much text that adds no value, everywhere, so tahts
the type of audit that i want but also whats the criteria to determine what stays and what not"*. It
extends his 2026-09-09 ruling (`HealthOS/knowledge/fanout-2026-09/00b-no-filler-ruling.md`), which was
applied to captions and missed everything else: collapsed sections, content JSON, component defaults.

**Text stays on a page only if it is one of four things:**

1. **A fact about him**, computed from his data. "Last swim 600 m, 5 days ago."
2. **Something to do**, at the moment he is doing it. A cue, a target, a self-check.
3. **A warning that changes what he does**, inside the line of the number it is about. "Weight 105.2 kg,
   last measured 9 days ago."
4. **A label** of a few words: a heading, a button, a column name, a one-line legend.

**Everything else goes, however true:** where a number came from (watch, scale, Samsung, Spotify, derived,
measured); how the page or the arithmetic works, or why it was built that way; history (what changed, when,
what it used to say); the page defending its own method ("on purpose", "honestly", "not a verdict");
anything already on the same screen; research (study names, sample sizes, citations, evidence grades);
files, commands, scripts, agents, and promises of features; describing the page itself.

**When unsure, delete it and look at the screen.** If he would do nothing differently and know nothing less
about himself, it stays deleted. What was cut is not lost: reasoning goes in the comment beside the code,
research stays in the content files and `HealthOS/knowledge/`.

**The sweep that wrote this, 2026-09-15.** Cue cards on /run, /bike and /swim render the cue and its check
only (the confidence badge, why, quote, citation and "what was thrown out" essay stay in the JSON). The
"what this page cannot say" sections on /health/deep, /health/day, /swim/deep and /swim/records are gone.
The Health Plan tab lost its research essay and rest-rule caveats, the Now tab its recovery box (permanent,
because he does not wear the watch to sleep). `/reading/about` is deleted and 307s to /reading. Dish notes
and list notes in Neon were rewritten (80 notes to 64, about 45,000 characters to 25,000); the rows before
it are in `KitchenOS/_archive-2026-09-05/dish-table-before-text-audit-2026-09-15.json`.

**Mechanism: `scripts/lint-page-text.mjs`, in `pnpm build`.** It cannot judge usefulness. It refuses the
five shapes that are decidable: a path or command, a typed ISO date or "used to", defence phrases, research
citations, and plumbing ("watch readings", "the mirror behind"), in JSX text across src/app and
src/components and in the content JSON fields that render (named by path in the script). `--selftest` runs
first. **Its first version passed a planted violation**, because a double-star `git ls-files` pathspec
skips top-level files including `src/app/page.tsx`; the filler linter (deleted 2026-09-27) had the same hole. Plant one before
trusting a change to either.

**What it cannot see:** props built outside JSX, sentences useless in a way none of the five patterns
describes, and the kitchen rows in Neon, which sessions write directly. A session writing a dish note
applies the four rules by hand: stove instructions and substitutions, no ratings counts, no "his ask", no
history of the list.

