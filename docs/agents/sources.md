---
moved: 2026-10-18, verbatim from AGENTS.md, which now points here. Not re-audited beyond the dead paths fixed that day.
---

# Reading a source, and the swim quotes

- **A source that 403s the fetcher is not a source that cannot be checked.** Use
  `node scripts/read-source.mjs <url> ["<regex>"]`, which reads the page in the real Chrome on CDP
  9222 and prints the rendered text. On 2026-08-22 swimming.org returned 403, a swim cue was
  downgraded to "convention", and the file was made to say no sentence from that page could be
  quoted "by anyone reading this". It loads fine in a browser. Silvio caught it in one line. Reading
  it then showed the file's note ABOUT that source was also wrong. Nobody had opened it, so the
  detail had been written from memory. Before writing "this cannot be verified", verify it. Before
  trusting a note about a source, read the source.

  **THIS PARAGRAPH ITSELF CARRIED THE WRONG COUNT FOR ELEVEN DAYS, corrected 2026-09-02.** It said
  the framework "claimed nine core aquatic skills and listed nine, and the page names four
  (Floatation and Balance, Rotation and Orientation, Streamlining, Aquatic Breathing)". **The page
  names NINE** and always did: Entry, Exits, Floatation and Balance, Rotation and Orientation,
  Streamlining, Aquatic Breathing, Travel and Coordination, Water Safety, Health and Fitness. The
  2026-08-22 "correction" had read the list as far as the fourth bullet, added a full stop, and
  shipped the truncation with a provenance note boasting that the source had finally been opened.
  The nine it overwrote was correct. **So the paragraph teaching future sessions to read the source
  was itself an unread-source error**, and the rule it draws applies to it: a substring check cannot
  see a quote cut short, which is why `content/swim/capture-source.mjs` prints the 120 characters
  following every quote. Re-read over CDP on 2026-09-02 and again while re-sourcing Coach them.
- **`content/swim/` quotes are checked against a captured page, not against the agent that typed
  them.** `content/swim/capture-source.mjs <id> <url>` stores the rendered text under
  `content/swim/sources/`, hashed and dated; `checkQuotesAgainstSources` in `content/swim/validate.mjs`
  asserts every `quote` appears verbatim in the capture for the source it names, and `pnpm build`
  runs it. Capture before quoting a word. `--check` re-fetches and diffs; `--list` says what is held.

  **The two coaching tabs draw on DIFFERENT source families, and that is his ruling, 2026-09-02:**
  *"I don't know if these two things come from the same source. I think they should be from different
  sources."* **Coach them (`teaching.json`) is Swim England learn-to-swim and Just Swim pages only.
  Coach me (`coaching.json`) is US Masters Swimming.** Do not quote a USMS guide on the teaching tab
  to fix a cue; it is the wrong family and the split exists because six sentences had appeared on
  both tabs. The two families also teach genuinely different models, so a cue moved across families
  has to be REWRITTEN to what the new source says rather than re-cited. A quote is evidence for the
  sentence above it or it is decoration.
