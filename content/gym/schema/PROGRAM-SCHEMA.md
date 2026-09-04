# Gym program schema

The lifting programme is data, not markup. Rewritten 2026-09-03 for the two-session week; the
history of how it got here is `HealthOS/knowledge/PROGRAMME-DECISIONS.md`.

## Files

- `program.json`: `{ $comment, goal, frozen, days: { a, b } }`. Two sessions, alternated. Each
  `scheduledOn` two weekdays.
- `movements.json`: the catalogue. One entry per job, every variant in his gym, muscles per group.
- `equipment.json`: zones and stations, what is adjacent, what is shareable.
- `warmups.json`: `{ lower: [...], upper: [...] }`. `cooldowns.json`: keyed stretches.
- `alt-cues.json`: cue text for variants the programme does not prescribe, so the swap control can
  offer them. `scripts/gym-alts.mjs --write` derives every slot's `alts` from these two files.
- `coverage-baseline.json`, `strength-baseline.json`: accepted states for the two report gates.
- `structural-hash.mjs`: the hash the freeze gate compares.

## Shape

```
Program:  { goal: Goal, frozen: Frozen, days: Record<'a'|'b', Day> }
Goal:     { his, measuredBy, inHisWords: [{on, said}], decided, assumptions? }
Frozen:   { until: 'YYYY-MM-DD', daysHash, changes: [{on, hisWords, hash}] }
Day:      { scheduledOn: [weekday, weekday], name, title, warmup: 'lower'|'upper', cooldown: [key], blocks: [Block] }
Block:    { role: 'primer'|'main'|'accessory', pairing: 'alternate'|'sequence'|'fill', label, tag?, why, exercises: [Exercise] }
Exercise: { id, name, sets, reps, rest, cue, zone, station, log?, progression?, rangeWidth?, bodyweight?, timed?, whyHere?, open?, formerIds?, alts? }
```

## The rules that bind, in one line each

Full text and the incident behind each is in `validate.mjs`.

- `goal` is required. `frozen` is required; changing the structural hash before `frozen.until`
  needs a `changes` entry quoting his words.
- Every `main` block's lead lift has exactly 3 sets. Every session is scheduled on exactly 2
  weekdays. That is the whole dose rule; there is no per-muscle floor.
- `rangeWidth` is at most 8. A cue is at most 80 words. `$comment` is at most 30 lines.
- A block's `why` is at least 40 characters and names nothing absent from the block. A partner
  carries `whyHere`, a verbatim span of the `why`, or an open `placement` question.
- Partners share no primary muscle with the lead (Zhang 2025). A superset holds one station unless
  the two are declared adjacent. The zone route never doubles back. Primer, mains, accessories, in
  that order.
- No weekday word anywhere he reads; `scheduledOn` is the one field allowed to carry one.
- Placement and name on a slot agree with the catalogue. A variant-level muscle override needs
  `confirmedBy`.

## Editing

Edit `program.json`, run `node content/gym/validate.mjs`, then `node scripts/gym-alts.mjs --write`,
then `node scripts/verify.mjs`. If the structure changed, `node content/gym/validate.mjs
--print-hash` gives the hash for `frozen.changes`.
