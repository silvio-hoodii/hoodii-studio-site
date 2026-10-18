---
moved: 2026-10-18, verbatim from AGENTS.md, which now points here. Not re-audited beyond the dead paths fixed that day.
---

# The gym data pipeline (Samsung Health export to Neon)

## THE GYM DATA PIPELINE, and what each activity actually holds

Everything under `/gym` that is not a plan comes from the Samsung Health export on the laptop, via
`healthos.db`, via `content/health/sync.mjs`, into Neon. No scheduled task runs this (the 07:15 task was removed 2026-09-04). An agent runs
`HealthOS/sync/run-health-sync.ps1` when Silvio says he uploaded a new export, and it runs the whole chain: pull the newest export from Drive, unzip
it **and verify the unzip**, `parse-body-metrics.js` + `server/migrate-body-comp.mjs`,
`import-watch-sessions.mjs`, `import-session-detail.mjs`, then the mirror.

**That chain lives in its own repo: `silvio-hoodii/HealthOS`, PRIVATE, on `master`.** Worth knowing
because three handoffs in a row recorded it as "not tracked by git", which sent nobody looking for a
remote that already existed. What was actually true, until 2026-08-27, is that `guard-regen.mjs` was
untracked and the extraction gate plus both parser rewrites had sat uncommitted for three weeks.
Both gates below are committed and pushed now. If you change something in `HealthOS/`, commit it
there: nothing in this repo will carry it.

**A HALF-EXTRACTED EXPORT LOOKS EXACTLY LIKE AN EXPORT WITH LESS DATA IN IT, and that cost a day on
2026-08-26.** The 2026-08-21 export extracted 244 of its 88,838 entries. All 80 CSVs landed and 164
of 88,757 JSON blobs did, so nothing crashed and nothing looked wrong: attendance, body composition
and the swim PBs were all correct, because those come from CSVs. Only the per-session detail was
starved. Two research agents then read that directory carefully and both concluded, in writing and
with evidence, that Samsung had stopped shipping HRV, GPS and per-length swim data. All of it was in
the .zip.

Two faults, and the second is why it lasted five days rather than one. `Expand-Archive` failed
partway and the catch logged a WARN, because every step in that task is non-fatal on purpose, which
is right for a Drive pull and wrong for an extraction. Then `if (Test-Path $dest) { "already
unpacked" }` meant the half-empty directory satisfied every later run. **The partial state was
self-perpetuating.**

Both are now gates rather than intentions:

- **Extraction gate**, in that task. Extract to staging, count the archive's file entries against the
  files on disk, refuse to promote below 98%, and re-count an existing directory rather than
  trusting that it exists. Verified against both real cases: the broken export refuses at 244
  against a floor of 87,061, the good one promotes at 89,186 of 89,186.
- **Regeneration gate**, `HealthOS/guard-regen.mjs`, wired into `parse-swim-laps.js` and
  `parse-swimming.js`. **Any script that regenerates an accumulated artifact from one export must go
  through it.** It refuses to write fewer records than the file already holds, keeps a `.prev`, and
  `--force` overrides while saying so. This is the more general of the two: a truncated download, a
  schema change, a filter typo and an interrupted unzip all present identically to the script doing
  the writing, so the check belongs where the loss happens. `parse-swim-laps.js` was one documented
  command (`npm run laps`) from replacing 18,804 lengths going back to 2018 with about 1,300, and
  its own header called rerunning it cheap.

**`gym_set.rir` IS GONE, dropped 2026-08-27 on his call, and `gym_set.estimated` MUST NOT FOLLOW
IT.** The plan listed both as dead columns that could not be filled. Only one was. `rir` held a
value in 0 of 569 rows across its whole life while being declared in three interfaces, sent on every
POST, written, upserted and selected back out. `estimated` is load-bearing: 54 rows are `true`, and
`getLastSession` filters `coalesce(estimated, false) = false` so progression only ever walks back to
a set whose numbers were actually typed rather than recalled. Dropping it would feed 54 backfilled
sets into the weight suggestions. The 178 nulls since 2026-08-14 are correct, because null means
measured live.

**The order was code first, column second**, and it matters for any future column drop here: the
deployed app was still running `select weight, reps, rir`, so dropping first would have 500'd every
read of /gym. Ship the code, confirm production is READY on that commit
(`vercel api /v13/deployments/<url>` returns `readyState` and `meta.githubCommitSha`), then drop. The
drop script re-counted the column's non-null rows and would have refused if any had appeared.

**And the RIR guide stayed.** `content/gym/rir-guide.json` (since removed from the tree) taught what reps-in-reserve means, which
is worth having whether the number is logged or not. Deleting the teaching along with the dead
plumbing is the mistake available whenever a name is shared by a feature and its explainer.

**`pace_per_100m_ms` and `moving_pace_per_100m_ms` are two columns because one column was two
metrics.** Wall clock always, rest-excluded only where the per-length detail was read, null
otherwise and never a fallback. A single mixed column mattered because the only operation anything
performs on it is a minimum, and a minimum over a mixed column always selects the flattering
definition: `/health` showed a best of 1:31 per 100 m, off a 300 m session that ran 25 minutes with
4 minutes of swimming in it, **faster than the official 100 m PB of 1:38.71**. Two numbers answering
"how fast can he swim", on two pages, neither linking to the other.

**`health_swim_session.date` AND `health_swim_length.date` ARE UTC. `health_session_detail.date` AND
`health_watch_session.date` ARE LOCAL.** Four date columns describing the same swims, two of them a
day out for any swim starting after 18:00 in Calgary: 94 of 475 rows. Found 2026-08-27, and it had
been rendering the whole time: /swim showed a card headed "Your last session (Aug 25)" and, one
screen below it, "Last swim the watch export has reached: Aug 26", about the same swim. The comment
above `getSwimHistory` asserted that "every row in these tables was stamped in local time", which
was true of the tables it was written for and is why nobody looked.

**Do not add a swim figure keyed on `date`.** Recover the instant instead: neither
`health_swim_session` nor the mirror filling it carries a start time, so join
`health_swim_length.session_start_time` or `health_session_detail.start_time` and convert through
`America/Edmonton`. The evidence that this is the right direction rather than a preference: the
conversion reproduces the date `health_watch_session` independently recorded on 359 of 361 sessions
where both exist, against 271 for the raw column. `SWIM_LOCAL_DATE` in `src/lib/swim/db.ts` is the
expression; `src/lib/swim/deep.ts` derives every date it prints and never selects `date`. The 108
sessions with no start time anywhere keep the raw value rather than being dropped. **The real repair
is in the importer on the laptop, which git still does not track.**

**A SENTENCE CAN SIT THREE LINES ABOVE THE TABLE THAT DISPROVES IT.** /swim/deep shipped its weight
section reading "the heaviest band is also the period he swam most", which is the obvious confound
and is false: 2023 is his biggest year by distance, 186 swims at 104 kg, and 2025 is his fastest at
118 kg on 102. Weight and volume did not move together. Typecheck, lint, build and a full text dump
of the rendered page all passed with it in place, because none of them compares prose against the
numbers beside it. The screenshot caught it, along with a tile labelled "Best this year" above a date
from the previous September and a "100 m" breaking into "100" over "M". **The rule this repo keeps
relearning: read the rendered screen.** The corollary that is cheaper than a screenshot: derive the
claim. Every figure on that page is returned from `deep.ts` and none is typed into a sentence, which
is what made three recovered "facts" falsifiable in the first place.

**Every discipline's `now` tab draws the last TEN sessions, not one, since 2026-08-27**, via
`getRecentSessions`, which had existed since 2026-08-22 with zero importers. The trend each one gets
was chosen by counting populated rows in Neon first: percent-under-110 for lifting (80 sessions),
SWOLF for swimming (8 of the last 10 carry it, and the caption says so), cadence for running (5
sessions, all with it), and nothing at all for cycling, which has exactly one session ever.

**The four activities are NOT equal and no page should pretend otherwise.** Audited 2026-08-22:

| Activity | What the watch records | What a page can honestly say |
|---|---|---|
| Swimming | HR per second, and per LENGTH: duration, stroke cycles, stroke type, rest | Everything. SWOLF, pace, stroke rate, the shape of the swim |
| Treadmill | HR, **cadence**, speed, distance per second | Cadence IS measured indoors. Real form feedback |
| Lifting | HR only | The shape of the hour. 54% of his sessions sit under 110 bpm. It cannot judge a lift |
| Bike | HR only | Nothing. No rpm, no power, no resistance, and the page says so |

**`stroke_count` is CYCLES, not arm strokes.** His median is 9 per 25 m; as single arm strokes that
would be 2.78 m per stroke, which is not physically possible. Every stroke-rate number depends on
this.

**Samsung exercise type 0 is not a sport, and it is two things at once.** It is the generic "other
workout" bucket, 301 sessions, and until 2026-08-22 the pipeline gave both halves one name. 213 of
them he started himself and picked "Other workout" from the watch's list; 87 the watch's automatic
detection invented, roughly ten minutes after the fact. They import as `other` and `other-auto`, and
the evidence for the split is written out in `HealthOS/server/import-watch-sessions.mjs`: source
type 4 appears only on activities Samsung's detection supports and never once on strength, treadmill
or stationary bike, and its heart-rate trace starts ten minutes in where a manual one starts at
five seconds. Both still count as a training day. **What the 36 minutes at 151 bpm on 2026-07-25
actually was is not recoverable** and no further digging will change that: nobody chose it, and the
watch stored heart rate and nothing else.

**A kind rename duplicates every session it touches**, in both stores, because each keys on
(start_time, kind) and an upsert under a new name inserts beside the old row. Both importers and
`content/health/sync.mjs` now delete the stale row, and the mirror asserts its Postgres count
against sqlite's rather than printing both and moving on. That split left 87 sessions in the week
strip twice while every log line read healthy.

**Samsung does not label the swim PB distances.** `best_records` stores a numeric type and a
duration. The mapping 13/14/15/16 = 100/200/400/1500 is DERIVED and re-tested on every import by
requiring pace per 100 m to rise with distance. A firmware renumbering exits non-zero rather than
silently relabelling his personal bests.

**Two things that failed silently and were found by counting, not by reading the success line.** An
unrounded 117.5 into an integer column killed the Neon mirror mid-run after 108 of 151 rows, so the
table looked populated and stopped three weeks short, and it aborted before `swim_session` and
`health_target` too. And before 2026-08-21 the mirror carried only `strength` and `swimming`, so no
run or bike had ever reached the site. Compare row counts across the two stores, not the log line.

