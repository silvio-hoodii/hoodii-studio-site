# Audit, 2026-09-15: every app and the front hub

Asked for by Silvio after the portfolio sections came off the front page: *"i want an audit on each
app and text on the front hub, looks like some stuff is broken"*.

**How it was done.** Rendered text of 30 live pages read through CDP. Every hub number checked
against Neon. Vercel function invocations by route and status for 2026-09-06 to 09-15. Local
`pnpm start` for the gym interaction probe (33 of 33 passed, writes stubbed) and the tap probe
(35 of 35 paths, 0 findings). Screenshots at 390px of the hub, /gym, /health, /health?s=now, /swim,
/kitchen/shop and a dish page.

## Fixed in this pass

| Where | What was wrong | Fix |
|---|---|---|
| Hub | "This is the front door to it." filler | Cut |
| Hub, Health row and /health banner | "The sync from the watch has stopped" every Tuesday to Sunday: the 36-hour threshold was set for a daily task retired 2026-09-04 | 8 days, so a missed Sunday trips it |
| Hub, French | "No cards yet" on the front page. `french_cards`, `french_reviews`, `french_chapters`, `french_days` are all empty | Row hidden while the app holds no cards, returns by itself |
| Hub, Reading | "library check last run 26 days ago". Last `reading_sync` 2026-08-22 | Row hidden past the 7-day window, returns by itself |
| Hub, Health | 9-day-old weight in `--signal` green beside a raw ISO date | Green only for today or yesterday, "last measured N days ago" |
| Hub, Music and Swim | "since 2026-08-09", "longest 5000 m" | "since Aug 9", "5,000 m" |
| /health banner | Printed "database is not open", a failure from Sep 9 sitting under two good runs on Sep 11 | Only a failure newer than the last success is shown |
| /health banner | Told him to "Run node content/health/sync.mjs" | Tells him to upload an export and tell a session |
| /health Weight tab | "Both readings are watch readings. Both figures come from that same reading, so they add up by construction rather than by agreement." These are the words he quoted in the 2026-09-09 filler ruling. Commit e92496f claimed "the sentence he actually quoted is gone" and removed a different one | Cut |
| /health Now tab | "Sessions are still arriving daily". The last session in the export is Sep 10 | Clause cut |
| /health Volume tab | Abdominals read "0 / 15 with jumps and carries": the 15 also counts bodyweight work (knee raises, dead bugs) | "with bodyweight, jumps and carries" |
| /health/deep | DB Lateral Raise 20 to 17.5 lb printed as "-3 lb" | Half-pound changes print one decimal |
| /swim last session | "Pace swimming 1:48", "Pace with rest 1:45". With rest cannot be faster. `health_session_detail.minutes` is an integer (7 for a 7:03.84 swim) and the lengths summed to 7:14, longer than the whole session | Wall clock is `health_swim_session.duration_ms`; swimming time capped at it. Now 1:46 and 1:46 |
| /bike Plan | "Not scheduled since 2026-09-04: the easy row after Session C took the non-impact aerobic slot." Session C was folded into A and B on 2026-09-06 and there is no row | Rule removed |
| /reading/want, /reading/about | Called the page "Shelf check"; the tab says Browse | "Browse" |

## Open: needs Silvio

1. **Gym logging stops a few minutes into each session.** Sep 10: sets saved 19:58 to 20:05, then
   nothing, while the watch recorded lifting until 20:42. Sep 11: two sets in five seconds. Sep 14:
   three squat sets in one second, then nothing. None of the three was finished (`status = active`).
   Sep 6 and Sep 8 logged normally across the hour. Server side, every POST returned 200 and the
   probe passes, so the page works when a script taps it. Question for him: did he stop logging, or
   did the page stop responding?
2. **Two "Seated DB Overhead Press" alternatives on the overhead press.** `db-overhead-press` is named
   Seated with `station: bench`, and its cue says "STANDING, not seated". `db-seated-ohp` is the
   real seated one. Which does he actually do? Programme frozen until 2026-10-05, so ask, do not edit.
3. **Kitchen dish notes** still open with the old prose states ("ESSENTIAL AND BLOCKING", "NICE TO
   HAVE, NOT BLOCKING") that `need` replaced, and talk about him in the third person ("both of which
   he has"). Data in `dish.list`, not code. Rewrite on his say-so.
4. **Kitchen: 8 of 15 dishes have an empty list** (arroz con pollo, burger buns, cottage cheese
   pancakes, creamy tomato chicken, flank tagliata, honey garlic chicken, potato farls, smash
   burgers). Most predate the list feature. Potato Farls also has no protein figure.
5. **Run plan contradicts itself.** Header "Treadmill, 2x/week"; week 8 says "5.7 km a week across
   three sessions". Also "the hip abduction work on lower days": there are no lower days since A/B.
   Last run on record Aug 30.
6. **Bike "Somewhere to type them is the next thing to land here."** `/bike/api/ride` shipped
   2026-08-27 with no form. A promise three weeks old on the page.
7. **Two heart-rate tiles disagree on the same session.** /health Now: "108 avg, 132 max" above a
   chart labelled "77 to 127 bpm". /swim: "160 max" above "102 to 159". One is Samsung's summary, the
   other the per-second series. Pick one or label both.
8. **Swim level table** says "Levels are race times, one swim with no stops" and puts his Samsung
   bests beside them. The 1,500 m best on May 22 cannot be unbroken: the longest unbroken piece this
   year is 600 m, and on that same day.
9. **Volume tab footnote** says "The gate that judges the programme counts only sets where the muscle
   is a prime mover." AGENTS.md says the per-muscle gate is gone. Check before believing either.
10. **Provenance captions left under the 2026-09-09 ruling**, not cut in this pass because each needs
    a read of what it protects: /health/deep "Both endpoints are watch readings, on purpose...";
    Weight tab "Skeletal muscle and total body water are recorded on watch readings..."; the
    "standing-around ... only thing a wrist heart rate can honestly say" sentence, printed twice on
    one screen; /music's opening paragraph; the Volume footnote that names a source file.
11. **Date formats are mixed** on /health: "13/02 to 06/09", "vs 2026-08-06 (31 d)", "Aug 23" on one
    screen.
12. **Hub wording** he may want to change: "122 things I looked up properly", "778 worth pulling in a
    shop" (hidden for now with Reading).
13. **The /health "THIS IS LOAD, NOT RECOVERY" box is alarm red** for something that is not a fault:
    he does not wear the watch to sleep, per the Plan tab.
14. **French is empty in Postgres** and **Reading's queue is from Aug 22.** Both hidden from the hub
    now. Whether either app stays is his call (see the "built it, never opened it" note in memory).

## Checked and fine

Kitchen index and shop list render and add up; Curio's digest ran this morning (Sep 15); the music
collector ran at 15:00 UTC today and added 17 plays at 07:00; swim, run and bike tabs all pass the
tap probe; no non-200 responses on any app route in ten days.
