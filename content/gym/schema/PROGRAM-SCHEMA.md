# Gym program schema

The lifting program is data, not markup. It came out of `HealthOS/gym.html` via
`content/gym/migrate-from-html.mjs` on 2026-08-10, after that file's own rest-timer and cross-zone
superset bugs were fixed (see memory `project_healthos_v4_2026_05_23`, V7.4): this migration carries
those fixes forward, it does not reintroduce the bugs by copying stale content.

## Files

- `program.json`: `{ days: { monday, tuesday, thursday, friday } }`. The 4-day Upper/Lower split.
- `warmups.json`: `{ lower: [...], upper: [...] }`, shown before every lifting day.
- `cooldowns.json`: keyed stretches (`pigeon`, `couch`, `thoracic`, ...), referenced by day.
- `rir-guide.json`: the RIR (reps in reserve) reference table.
- `handstand-ladder.json`: `{ steps: [...] }`, the 5-step handstand progression. The Handstand Skill
  slot on Tuesday/Friday starts at step 1 with the rest as alts.

## Shape

```
Day: { name, title, desc, time, warmup: 'lower'|'upper', cooldown: [cooldownKey], blocks: [Block] }
Block: { type: 'main'|'superset'|'pair', label, tag, exercises: [Exercise] }
Exercise: {
  id, name, sets, reps, rest, cue,
  log?: true,            // tracked/suggested: omit for warmup/cooldown-only items
  bodyweight?: true,      // no external load; still may need a fixed anchor point (see below)
  timed?: true,           // reps field is seconds, not rep count
  increment?: number,     // lb added on progression (default 5)
  alts?: [{ id, name, cue, ...same optional fields as Exercise }],
}
```

`superset` and `pair` blocks carry exactly 2 exercises: they share one rest window, so both sides
have to be reachable from the same spot in the gym without walking to different equipment. `main`
blocks with 2 exercises follow the same rule even though the type name doesn't say so (the second
exercise is done between sets of the first).

## The zone rule (why some alts are missing)

Four equipment zones exist in this gym (see `reference_gym_layout` memory: machine / cable /
dumbbell+rack / stretch). A superset/pair's two sides have to stay in the same zone, or one side has
to be genuinely portable (floor bodyweight work, no anchor needed). **A band exercise anchored on a
rack post is NOT portable** even though it has no external load: that mislabeling caused the actual
bugs. 7 alt options were pruned from the source `gym.html` on 2026-08-10 for exactly this reason
(Cable Glute Kickback, Machine Shoulder Press, 2x Cable/Band Face Pull, Dips, Cable Curl, Hanging
Knee Raise). There is no formal `zone` field on exercises yet: the fix so far is "these alts don't
exist in the data," not a mechanical check. If a new alt is added later, check it against the zone
map by hand before adding it; don't assume `bodyweight: true` means zone-free.

## Editing

Content lives here now, not in `HealthOS/gym.html`: that file stays running on the laptop until the
Postgres-backed `/gym` route on this site is verified working, per the migration handoff. Edit
`program.json` etc. directly (or re-run `migrate-from-html.mjs` if `gym.html` changes before cutover),
then `node content/gym/validate.mjs`.
