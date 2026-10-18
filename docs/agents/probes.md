---
moved: 2026-10-18, verbatim from AGENTS.md, which now points here. Not re-audited beyond the dead paths fixed that day.
---

# The tap probe

- **THE 44px TAP FLOOR IS MEASURED NOW: `node scripts/probe-taps.mjs <base-url>`.** 36 surfaces at
  390px, every sub-tab of every route, checking three geometric things in one visit: every control
  against the floor, horizontal overflow, and whether the nav chip row still fits. Its first full run
  found **79 findings**, all real once narrowed, including six `Why this is here` summaries at 32px on
  /gym, which is the one control that answers the question he asks most; the warmup and cooldown at
  16.5px, opened mid-session with one hand; and three kitchen section summaries at 22px. All 36 are
  clean as of 2026-08-28 and it has been watched refusing (restoring the old `.kos .dots` CSS and
  rebuilding makes it report the sideways scroll; pointing it at a path with no route makes it report the 404).

  **RUN IT AGAINST A LOCAL `pnpm start`, NOT THE LIVE DOMAIN.** A 33-path run loads enough assets to
  trip **the site's own firewall rule 4** (150 non-`/_next/` requests a minute per IP), and the
  challenge page it then measures is a real page that is not this site. Confirmed 2026-08-28: against
  hoodii.studio the same paths that pass individually fail in a full run, and against localhost all 36
  pass. It is not in `verify.mjs`, for the reason the other probes are not: it needs a server.
  Exceptions live in `ALLOW` inside the script with the reason written beside each, and
  `PROBE_TAPS_SHOW_ALLOWED=1` prints what the list is hiding, because a broad allow-regex silently
  swallowing dozens of findings is the failure the script exists to prevent.

  **SIX OF ITS OWN BUGS ARE WORTH KNOWING, because five of them were false PASSES.** A Git-Bash
  mangled path (`/health` became `C:/Program Files/Git/health`) measured the wrong URL and reported
  ok; it refuses now. Measuring before the webfont settled gave `/reading` a 324px chip row and
  `/reading/about` a clipped one on identical markup, so the wait is now for the geometry to stop
  changing rather than for any event. And the label-formatting regex got its escape wrong three times
  running, because an expression built as a string in one language and executed in another has two
  escape layers: **nothing escapable goes inside the injected expression any more**, prose included.

  **The two found on 2026-08-28 are the worst of the six, and they are one mistake.** The readiness
  test was `document.body.scrollHeight > 300` and the emulated viewport is **844px tall**, so any page
  that had not painted reported exactly 844, cleared the floor, held that value across two reads, was
  declared stable, and passed every check: a blank page has no overflow, no clipped nav and no small
  controls. A full live run printed **"31 of 31, 0 findings" with twelve paths at exactly 844px**,
  while `/curio` measured on its own moments later is 9458px. And one of those twelve was **`/work`,
  which is not a route at all**: the path list had said `/work` since the script was written, the 404
  page cleared the old gate, and the four published case studies were never measured while the run
  reported covering them. The floor is not raised past 844, which would be the instance and not the
  class: readiness is now **three or more controls and 200 characters of text**, which an unpainted
  document cannot produce, and a non-arrival prints the page title, the URL and the first 120
  characters so a 404, a firewall challenge and a slow render are told apart without a screenshot.
