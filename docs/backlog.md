# hoodii.studio open items

Carried here on 2026-10-18 from the root `BACKLOG.md` (archived to
`_archive/root-files-2026-10-18/BACKLOG-2026-09-03.md`) and the 2026-09-27 handoff (archived to
`_archive/handoffs-2026-10-18/`). Close an item by deleting it; git is the audit trail.

## Defects

- **[M] A gym session only ends when someone presses a button.** Five sessions were left open from
  June and closed 2026-08-15; five more (2026-09-10 to 09-23) were closed 2026-10-18 with
  `node scripts/guard-live-session.mjs --close-stranded`. Twice is the class, not an instance: make the
  end condition derivable from the sets (for example, a session with no set for N hours reads as ended
  at its last set) so a forgotten button cannot leave a session open.
- **[S] No previous workout on screen.** His words: "There's no way for me to see my previous workout
  here, which is weird." The data is in `gym_set` and `gym_session`; this is rendering, not data.
- **[XS] /curio/archive, the 2026-08-07 entry** still shows an em dash and three links that were not
  re-checked. Fix or leave: his call.
- The gym-write refresh (revalidate after a set is saved) has never been observed working on
  production; the nightly ReadLater refresh of `/`, `/curio` and `/curio/archive` was observed working
  2026-10-17.

## His decisions (not agent work)

- The index blurb wording.
- Whether to cut link prefetching.
- A migration so a renamed dish keeps its cook history.
- 19 rows still carry a wrong `exercise_name` from the 2026-08-14 defect (the id is right, nothing is
  lost); rewriting history to fix a label is his call.

## Wanted, not started

- **[M] Health should use the data far harder.** His words: "health is mostly ok i just want us to
  exploit all the information as much as we can."
- **[S] Sweep every hub row against what its app actually does.** Any row written by hand rather than
  derived is suspect; Reading is the obvious one.
