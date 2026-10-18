---
moved: 2026-10-18, verbatim from AGENTS.md, which now points here. Not re-audited beyond the dead paths fixed that day.
---

# Removed layers: the portfolio and the 3D world

## The portfolio layer was removed on 2026-09-15

From 2026-08-11 the front page carried a second job as a portfolio: a résumé paragraph ("twelve
years of pointing the same instinct at other people's problems"), a "This site" row about the build
gates, three client projects under "In production" (The Moment, Versatile, Brixel), four post-mortems
under "What I stopped building", and five `/work/*` case-study pages behind them with their own
screenshots and a generated facts file. **All of it is gone**, and `/work/*` 307s to `/`.

Silvio's words, 2026-09-15: *"i know partly is me asking for kind of hybrid fportfolio stuff but i
dont like the content itself i feel like it doesnt really add valu because its clearly ai lsopppy so
i rather just take it out and foucs on the actual apps"*

**Do not add a section about him, his clients or how the site is built back to the front page
without him asking.** The Google description and the share card lost the "Twelve years bridging
business and technology" line in the same change. Everything is recoverable from git history at the
commit before the one that removed it.

## The 3D world was removed on 2026-08-09

This repo used to be an immersive WebGL room ("an agent's studio"). `src/world/`, `src/overlay/` and
`src/lib/shaders/` are gone, along with three, R3F, drei, postprocessing, gsap and zustand.

**Do not rebuild it, and do not treat the old design doc as authoritative.**
`~/Desktop/HOODII/_archive/workspace-cleanup-2026-08-15/docs/plans/2026-05-21-hoodii-studio-3d-world-design.md` is now history. Silvio's
own reason, 2026-08-09: *"That website is basically dead. It's been just me messing with some design
choices that I always keep changing."* The room was a nice idea with nothing behind it, so it got
redesigned instead of finished. Now there are real apps behind the page.

It is all recoverable from git history if it is ever wanted back (last commit containing it:
`c2b8a8a`).

**One landmine it left behind, already fixed, worth knowing about:** `globals.css` carried
`overflow: hidden` on `html, body` so the WebGL room could not be scrolled, plus `cursor: none`.
That shipped `/kitchen` on 2026-08-09 completely unscrollable on a phone. The content was there and
measurable in `scrollHeight`, and no thumb could reach it. **Measuring a page's height is not testing
that it scrolls.** Drive a real wheel or CDP touch event.

