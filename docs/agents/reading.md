---
moved: 2026-10-18, verbatim from AGENTS.md, which now points here. Not re-audited beyond the dead paths fixed that day.
---

# Reading

**READING IS GOODREADS AND NOTHING ELSE, since 2026-09-27.** `src/lib/reading/goodreads.ts` reads
his public shelf feeds (paged, dates read straight from the string so an evening entry keeps its
day, a failed fetch THROWS so Next keeps serving the last good page). The ReadingOS mirror that used
to feed `/reading` (`content/reading/sync*.mjs`, `apply-schema.mjs`, `schema.sql`, nine `reading_*`
tables, the scoring, the shelf and want pages, the walled paths) is deleted from this repo; the
ReadingOS folder in HOODII is untouched and its tables still exist in Neon with nothing reading them.
What remains under `content/reading/` is `validate.mjs` and `packs/`, the recall decks on
`/reading/finished`. The nine paragraphs this file carried about the mirror (the refresh sequence,
the data-loss guard, the ISR-300 queue, `.verdict.now`, `homeBranchNowStale`) described code that
no longer exists and are gone with it; the history is in git before this date.

