---
moved: 2026-10-18, verbatim from AGENTS.md, which now points here. Not re-audited beyond the dead paths fixed that day.
---

# Kitchen

**THE KITCHEN WAS REBUILT AS A COOKBOOK ON 2026-09-05, and every paragraph this file used to carry
about recipe cards, `validate.mjs`, `SOURCING.md`, `import.mjs`, `render.mjs`, `probe-kitchen.mjs`,
`kitchen-notes.mjs` and the stock fold describes code that no longer exists.** Read
`KitchenOS/README.md` for what it is now: `dish`, `inbox` and `cook_log` in Neon, two pages and two
API routes under `src/app/kitchen/`, and `src/lib/kitchen/cookbook.ts`. The page never renders a
publisher's text; it links to it. The reasoning for the rebuild is in
`KitchenOS/WHERE-THINGS-LIVE.md`; the retired code is in git history and the retired data in
`KitchenOS/_archive-2026-09-05/`.

Two lessons from the first build survive it and apply to every app here. **An agent-written
instruction is where the defects live**: on 2026-08-09 the first dish cooked from the app burnt
having passed a six-source check on its numbers, a full read of every rendered step, and a clean
validator, and all four failures were sentences an agent wrote between figures a source gave. And
**a model nobody feeds keeps answering**: stock writes stopped on 2026-08-23 and the home page scored
"what can I cook now" against that fridge for two weeks with every gate green. A number a page
prints must either be derived from something that is still moving, or declare its own staleness.

- **Touching `/kitchen`? Run `node ../.claude/hooks/kitchen-inbox.mjs` FIRST.** It prints the asks waiting
  from his phone and the cook notes nobody has read, and `--handled inbox:<id> | cook:<id>` closes one.
  It replaced `kitchen-notes.mjs` on 2026-09-05 and it is a SessionStart hook in HOODII, so a session
  opened there sees it without asking. A captured note nobody reads teaches him the box does nothing.
