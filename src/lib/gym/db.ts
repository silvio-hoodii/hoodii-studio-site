import 'server-only';
import { neon } from '@neondatabase/serverless';
import { equivalentIds } from './equivalent-ids';
import { asNoteKind, type NoteKind } from './note-kinds';

// Same underlying Neon database as Kitchen (KITCHEN_DATABASE_URL), gym_ prefixed tables, see
// content/gym/schema.sql. GYM_DATABASE_URL is the self-documenting name for this module, but the
// Vercel CLI env write silently stored an empty value on 2026-08-10 (see
// reference_vercel_env_write_broken_use_dashboard_or_token memory) so this falls back to the var
// that IS reliably set on Vercel today. Both point at the same connection string; there is no actual
// separate database. Safe to remove the fallback once GYM_DATABASE_URL is confirmed set via the
// Vercel dashboard (`vercel env pull` and grep for a non-empty value, don't trust the CLI's success
// message).
const DATABASE_URL = process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('GYM_DATABASE_URL (or KITCHEN_DATABASE_URL as fallback) is not set');
}

export const sql = neon(DATABASE_URL);

const num = (v: unknown): number | null => (v === '' || v === null || v === undefined ? null : Number(v));

/** Sets the programme asks for on a given day, right now, counting every logged exercise in every
 *  block including partners and the primer.
 *
 *  This is the SAME definition as the "0/29 sets" counter on the page (GymClient's `totals`), on
 *  purpose: the history row has to be comparable to the number he watched all session. If that
 *  definition changes, both have to change together, which is why this comment names the other one.
 *
 *  Returns null on an unknown day rather than 0, because 0 would render as "14/0 sets". */
async function prescribedSetsFor(day: string | null | undefined): Promise<number | null> {
  if (!day) return null;
  try {
    const { loadProgram } = await import('./program');
    const program = await loadProgram();
    const d = program.days[day as keyof typeof program.days];
    if (!d) return null;
    /* THIS COUNTS PRIMER SETS AND THE PAGE DOES NOT, deliberately, and the two must not be
     * reconciled by changing this function.
     *
     * On 2026-09-01 he ruled that jumps should not count toward the set total he reads: "5 set of 3
     * jumps does not wgiht the same or more than 3 sets of sauts or bench press". He is right, and
     * `totals` in GymClient.tsx now shows lifting and jumps separately.
     *
     * This column is a different thing. It is stamped once per session and NEVER recomputed, which
     * makes it the only stable completion denominator across 646 existing rows. Excluding primers
     * here would shrink the denominator for new sessions only, so every completion percentage on
     * /health would step upward on a change in definition rather than in behaviour, and nothing
     * would record that it had. A raw count of every prescribed logged set is the honest meaning of
     * the column name, so that is what it keeps.
     *
     * If a primer-excluding figure is ever wanted downstream, derive it from program.json at read
     * time. Do not redefine a stamped column. */
    let total = 0;
    for (const block of d.blocks) {
      for (const ex of block.exercises) {
        if (ex.log === false) continue;
        total += ex.sets || 1;
      }
    }
    return total || null;
  } catch {
    /* A session must never fail to record because the programme could not be read. The set write is
       the thing that matters; the denominator is a nicety. */
    return null;
  }
}

export interface SetInput {
  date: string;
  day?: string | null;
  dayTitle?: string | null;
  exerciseId: string;
  exerciseName?: string | null;
  setIdx: number;
  weight?: number | string | null;
  reps?: number | string | null;
  done?: boolean;
  swappedFrom?: string | null;
  loggedAt?: string;
  suggW?: number | string | null;
  suggR?: number | string | null;
  estimated?: boolean | null;
  /** THE LEAD LIFT WHOSE REST THIS SET WAS DONE IN, when he filled that rest himself at the rack.
   *
   *  Null on every prescribed set and on every set appended through the off-plan box. Set only by
   *  the "fill this rest" control, which answers the one complaint he has made six times in twelve
   *  days (gym_note #10, #28, #50, #52, #54, #55). It makes his improvisation DATA rather than
   *  prose: before this column the only record of the three pairings he ran on 2026-09-04 was four
   *  sentences typed into a free-text box, which an agent read three days later and turned into
   *  another redesign of the week.
   *
   *  It carries `off_plan` with it, because a partner he chose is by definition not what the day
   *  prescribed. The two are written together and cannot disagree. */
  fillFor?: string | null;
}

/* NO `rir`. The column was dropped from gym_set on 2026-08-27, his call, after holding null in 0 of
   569 rows for its entire life: it was declared in three interfaces, sent on every POST, written by
   the insert, carried by the upsert and selected back out again, and not one of those steps ever
   moved a value. Nothing read it either, so removing it changes no behaviour.

   The RIR GUIDE IS ALSO GONE, 2026-08-27, and the argument above for keeping it lost. It taught what
   reps-in-reserve means, which was defensible while something might one day log the number. Nothing
   ever will, he asked twice where it had gone, and on the second ask he said "cut it". A folded
   panel explaining a metric the app does not record is text with no job. */
export interface SetRow {
  weight: number | null;
  reps: number | null;
}

export interface SessionSets {
  date: string;
  sets: SetRow[];
}

/** Ensures a session row exists and bumps day_title. Ported from HealthOS db.mjs upsertSession.
 *
 *  `sets_prescribed` IS STAMPED HERE AND NEVER RECOMPUTED, added 2026-08-27 with the session log.
 *
 *  The history view prints "30/42 sets": logged against asked-for. The second number cannot be
 *  derived at read time. A day's prescription changed five times in August 2026, so rendering an
 *  older session against today's program.json would report a gap that did not exist on the day.
 *  `coalesce(gym_session.sets_prescribed, excluded.sets_prescribed)` on the conflict path means the
 *  first write of a session wins: edit program.json mid-session and the row keeps what the day asked
 *  for when it started.
 *
 *  The 33 rows that predate the column stay NULL and the log prints them with no denominator. See
 *  content/gym/migrate-sets-prescribed.mjs for why they are not backfilled. */
export async function upsertSession(opts: {
  date: string;
  day?: string | null;
  dayTitle?: string | null;
  setsPrescribed?: number | null;
}) {
  await sql`
    insert into gym_session (date, day, day_title, started_at, status, sets_prescribed)
    values (${opts.date}, ${opts.day ?? null}, ${opts.dayTitle ?? null}, now(), 'active',
            ${opts.setsPrescribed ?? null})
    on conflict (date, day) do update set
      day_title = coalesce(excluded.day_title, gym_session.day_title),
      sets_prescribed = coalesce(gym_session.sets_prescribed, excluded.sets_prescribed)
  `;
}

/** Upsert one set. Re-logging the same (date, exercise, set) updates in place, never duplicates.
 *  Direct port of HealthOS db.mjs upsertSet / the ON CONFLICT shape, same reasoning: only a real
 *  value change should look "dirty" to anything downstream that watches for changes. */
export async function upsertSet(s: SetInput) {
  if (s.date && s.day !== undefined) {
    await upsertSession({
      date: s.date,
      day: s.day,
      dayTitle: s.dayTitle,
      /* Read off the programme on the SERVER, never taken from the request body. The client already
         knows the number, and accepting it would let a stale tab or a replayed queued write stamp a
         prescription that no version of the file ever had. */
      setsPrescribed: await prescribedSetsFor(s.day),
    });
  }
  await sql`
    insert into gym_set (date, day, exercise_id, exercise_name, set_idx, weight, reps, done,
      swapped_from, logged_at, suggested_weight, suggested_reps, estimated, fill_for, off_plan)
    values (${s.date}, ${s.day ?? null}, ${s.exerciseId}, ${s.exerciseName ?? null}, ${s.setIdx},
      ${num(s.weight)}, ${num(s.reps)}, ${!!s.done}, ${s.swappedFrom ?? null},
      ${s.loggedAt ?? new Date().toISOString()}, ${num(s.suggW)}, ${num(s.suggR)},
      ${s.estimated == null ? null : !!s.estimated}, ${s.fillFor ?? null}, ${s.fillFor != null})
    on conflict (date, exercise_id, set_idx) do update set
      exercise_name = excluded.exercise_name,
      day           = excluded.day,
      weight        = excluded.weight,
      reps          = excluded.reps,
      done          = excluded.done,
      swapped_from  = excluded.swapped_from,
      logged_at     = excluded.logged_at,
      suggested_weight = coalesce(excluded.suggested_weight, gym_set.suggested_weight),
      suggested_reps   = coalesce(excluded.suggested_reps, gym_set.suggested_reps),
      estimated     = coalesce(excluded.estimated, gym_set.estimated),
      /* NOT coalesce, unlike the two lines above it. Those keep an existing value because a later
         write that omits a suggestion must not erase the one recorded when the card was first read.
         This is the opposite case: he can change his mind about which partner is in a rest, so
         clearing it has to be expressible or a mistaken pick becomes permanent. Same call as done.
         (No backticks in this comment: it sits inside a template literal, and a stray one ends the
         query. That is exactly how this file failed to compile the first time.) */
      fill_for      = excluded.fill_for,
      off_plan      = excluded.off_plan
  `;
}

/** Most recent prior session (strictly before `beforeDate`) with real logged work for this exercise.
 *  estimated=false is load-bearing (see HealthOS db.mjs): progression must only walk back to a
 *  session whose numbers were actually typed, not recalled/backfilled, or a real gap gets silently
 *  smoothed over instead of triggering the probe branch in progression.ts. */
/* `= any(ids)` AND NOT `= exerciseId`, since 2026-08-28. See src/lib/gym/equivalent-ids.ts: one
 * exercise can hold two ids in this table, because a swap to an ALT logs the alt's id and some alts
 * are aliases of the slot's own variant. The calf raise had twelve bodyweight sets under one id and
 * three sets at 180 to 210 lb under the other, and this query read only the first, so the card
 * offered him about 5 lb for a machine he had loaded to 210 the night before. */
/* AN OFF-PLAN SET IS APPENDED, AND THE SERVER DECIDES WHERE. Added 2026-08-28 for 10-gym P0-1.
 *
 * THE DEFECT. `logExtra` in GymClient derived the set index from `extraLog`, a piece of React state
 * that is never rehydrated: the hydrate effect reads /gym/api/session and writes only into `sets`.
 * So after a reload, or after the phone drops the tab, which is the documented reason the whole
 * queue-and-retry machinery exists, the counter restarted at 1. The write is an unconditional upsert
 * on `(date, exercise_id, set_idx)`, so the second set of the evening REPLACED the first. `write()`
 * returned true, the banner stayed clean, and the on-screen list showed one item because it had
 * restarted empty too.
 *
 * Worse without a reload at all: off-plan rows share that key space with PRESCRIBED rows, and
 * `loadExtraSuggestions` feeds the datalist every variant name in the catalogue, including exercises
 * prescribed that same day. Typing "Dead Bug" into the off-plan box on Tuesday wrote
 * `dead-bug, set_idx: 1` straight over the first prescribed dead-bug set.
 *
 * WHY IT MATTERS MORE THAN ITS SIZE. That box exists because of what he said walking out of the gym:
 * "there are no knee raises here, I'm going to do them and you're not going to see it." It is the
 * only record of substituted work, and it was the one write path on the surface that could destroy a
 * row it had already written.
 *
 * THE FIX IS THAT THE CLIENT NO LONGER NAMES AN INDEX IT CANNOT KNOW. One statement: the max for that
 * (date, exercise_id) plus one, computed inside the insert, so there is no read-then-write window and
 * no client state involved. Plain INSERT rather than upsert, because an off-plan set is a thing he
 * DID, and there is no edit affordance for one: appending is the only correct operation.
 *
 * `off_plan` is recorded so the two kinds are distinguishable in the table forever, which the audit
 * asked for and which costs one boolean. It deliberately does NOT go in a unique key: giving off-plan
 * rows a separate key space would let an off-plan set and a prescribed set share an index, and the
 * point here is that they never collide at all because the index is derived from what is already
 * there.
 *
 * NOT idempotent, and that is the deliberate trade. The retry queue can double-post, so a dropped
 * connection may append the same set twice. A duplicate set he can see and delete is recoverable; a
 * set silently overwritten by the next one is not, and that asymmetry is the whole reason this
 * function exists. Same call the note box already makes, in its own words: "a duplicate note is a
 * nuisance and a lost one is not recoverable."
 */
export async function appendOffPlanSet(s: {
  date: string; day: string | null; dayTitle: string | null;
  exerciseId: string; exerciseName: string | null;
  weight: number | null; reps: number | null;
}): Promise<number> {
  const rows = await sql`
    insert into gym_set (date, day, exercise_id, exercise_name, set_idx, weight, reps, done, logged_at, off_plan)
    select ${s.date}, ${s.day}, ${s.exerciseId}, ${s.exerciseName},
           coalesce(max(g.set_idx), 0) + 1, ${s.weight}, ${s.reps}, true, now(), true
      from gym_set g
     where g.date = ${s.date} and g.exercise_id = ${s.exerciseId}
    returning set_idx
  `;
  return (rows[0] as { set_idx: number }).set_idx;
}

/* A SET WITH REPS TYPED INTO IT HAPPENED, WHETHER OR NOT HE TAPPED THE CIRCLE. Added 2026-08-30.
 *
 * `done` is set by a SEPARATE tap on the circle at the end of the row, which also starts the rest
 * timer. Typing a weight and a rep count autosaves the row with whatever `done` currently is, so a
 * set he performed and typed but did not tick is written `done = false`. Every history read then
 * required `done = true`, so that work was invisible to the suggestion engine, the trend line, the
 * stall detector and "your last session".
 *
 * THIS IS NOT AN EDGE CASE. 66 of 646 rows in his log carry real reps with `done = false`, on
 * twelve separate dates, and 30 August alone has seven. His own words that sent me looking: "chekc
 * how i actually marked the events". On the lateral bound that day he did five sets of three and
 * ticked sets 2, 4 and 5; nobody performs set 2 and skips 1 and 3, so this is the gesture not
 * landing rather than a decision. A further 42 rows are `done = false` with NO reps, and those are
 * correctly false: they are empty boxes.
 *
 * WHY WIDEN THE READ INSTEAD OF FIXING THE WRITE OR BACKFILLING. Auto-ticking on keystroke would
 * fire the rest timer while he is still typing, and rewriting 66 rows of his training log to make a
 * query simpler is editing the record to fit the reader. The record is right. The question the
 * reads were asking was too narrow: they asked "did he tick it" when they meant "did he do it".
 *
 * One definition, in one place, used by all four reads, because the last time this table had two
 * definitions of "this exercise's history" the calf raise card offered 5 lb for a machine he works
 * at 210. `done` keeps its own meaning for the progress counter and the timer on the page.
 *
 * `sql.unsafe` because the neon HTTP tag treats every `${}` as a BOUND PARAMETER, so a plain string
 * spliced in would arrive as the literal text `'(done = true or ...)'` compared against nothing. The
 * name is alarming and the content is a compile-time constant with no input in it; the alternative
 * is writing this condition out four times, which is how one table came to have two definitions of
 * "this exercise's history" in the first place. */
const PERFORMED = sql.unsafe('(done = true or (reps is not null and reps > 0))');

export async function getLastSession(exerciseId: string, beforeDate: string): Promise<SessionSets | null> {
  const ids = await equivalentIds(exerciseId);
  const rows = await sql`
    select date from gym_set
    where exercise_id = any(${ids}) and date < ${beforeDate} and ${PERFORMED}
      and reps is not null and reps > 0 and coalesce(estimated, false) = false
    order by date desc limit 1
  `;
  const row = rows[0] as { date: string } | undefined;
  if (!row) return null;
  const sets = await setsForExDate(ids, row.date);
  return { date: row.date, sets };
}

/* Takes the resolved id LIST rather than a single id, so a caller cannot accidentally reintroduce
 * the split by passing the raw slot id to the second half of a two-step read. */
async function setsForExDate(ids: string[], date: string): Promise<SetRow[]> {
  const rows = await sql`
    select weight, reps from gym_set
    where exercise_id = any(${ids}) and date = ${date} and ${PERFORMED} and reps is not null and reps > 0
    order by set_idx asc
  `;
  return rows as unknown as SetRow[];
}

/** Last N training dates for an exercise (newest first) with sets, powers the stall-detection window. */
export async function getRecentSessions(exerciseId: string, beforeDate: string, n = 3): Promise<SessionSets[]> {
  const ids = await equivalentIds(exerciseId);
  const rows = await sql`
    select distinct date from gym_set
    where exercise_id = any(${ids}) and date < ${beforeDate} and ${PERFORMED} and reps is not null and reps > 0
    order by date desc limit ${n}
  `;
  const dates = rows as unknown as { date: string }[];
  const out: SessionSets[] = [];
  for (const { date } of dates) out.push({ date, sets: await setsForExDate(ids, date) });
  return out;
}

/* TWO WAYS TO END A SESSION, added 2026-08-16.
 *
 * There was one, and the note box got this the same evening: "Didn't have that much time so can we
 * just restart from here next session whats the best approach". He had done two sets of back squat
 * out of a Lower A day holding eight exercises, pressed Finish because that is the only button, and
 * the rotation in cycle.ts duly advanced him to Upper A. The programme is a rotation rather than a
 * calendar, so the day he barely started was simply gone.
 *
 * `cutshort` records what actually happened, and `computeNextUp` re-offers the same day rather than
 * moving on. Nothing is lost and nothing has to be remembered: he does not have to work out that
 * pressing Finish costs him the day, and he does not have to hunt for a way to repeat it. */
export async function finishSession(opts: { date: string; day?: string | null; status?: 'finished' | 'cutshort' }) {
  const status = opts.status === 'cutshort' ? 'cutshort' : 'finished';
  await sql`
    update gym_session set status = ${status}, finished_at = now()
    where date = ${opts.date} and day = ${opts.day ?? null}
  `;
}

/** A date's logged sets (with done + suggestion) to rehydrate an in-progress session on another device.
 *
 *  `exercise_name` and `off_plan` were added 2026-08-28 so the OFF-PLAN LIST can be rehydrated too.
 *  It could not be before: the client's `extraLog` state started empty on every load and nothing
 *  refilled it, so after a reload the box showed nothing while the rows sat in this table. That
 *  emptiness was also half of P0-1, because the same state was being counted to pick a set index. The
 *  index moved to the server; this is what stops the LIST lying about what he logged. */
export async function getSessionForHydrate(date: string) {
  return sql`
    select exercise_id, exercise_name, set_idx, weight, reps, done, suggested_weight, suggested_reps,
           swapped_from, coalesce(off_plan, false) as off_plan, fill_for
    from gym_set where date = ${date} order by exercise_id, set_idx
  `;
}

/** WHAT HE HAS ACTUALLY LOADED, EVER, per exercise id: how many sets, and the weight he used most.
 *
 *  Orders the fill-a-rest list. A partner he has history on is one the card can put a number
 *  against; anything else he has to judge cold, standing up, mid-rest. `gym-catalogue.mjs --fill`
 *  ordered by muscle coverage instead, which is a fact about the programme rather than about him,
 *  and it buried his own repeated pairing at rank 40 of 43.
 *
 *  ONE ROUND TRIP for every id at once, and `mode()` rather than `max`: the working weight is the
 *  one he used MOST across the set, so a heavy top single does not become "what you were doing".
 *  Same definition as `workingWeight` in progression.ts, computed in Postgres because this asks it
 *  of the whole table. Counting round trips rather than work is the billing rule in AGENTS.md. */
export async function getLoggedHistory(): Promise<Map<string, { sets: number; weight: number | null }>> {
  const rows = await sql`
    select exercise_id,
           count(*)::int as sets,
           mode() within group (order by weight) filter (where weight is not null) as weight
      from gym_set
     where ${PERFORMED} and reps is not null and reps > 0
     group by exercise_id
  `;
  const out = new Map<string, { sets: number; weight: number | null }>();
  for (const r of rows as unknown as { exercise_id: string; sets: number; weight: number | null }[]) {
    out.set(r.exercise_id, { sets: r.sets, weight: r.weight == null ? null : Number(r.weight) });
  }
  return out;
}

export async function getSessionDay(date: string): Promise<string | null> {
  const rows = await sql`select day from gym_session where date = ${date} order by day limit 1`;
  const row = rows[0] as { day: string | null } | undefined;
  return row?.day ?? null;
}

/** The most recent logged session whose day is one of `keys`, since 2026-09-04. The rotation is A
 *  and B; Session C (Saturday) is logged in the same table and must not count as a rotation step,
 *  so cycle.ts asks for the last A-or-B row rather than the last row. */
export async function getLastRotationRow(keys: string[]): Promise<{ date: string; day: string | null; status: string | null } | null> {
  const rows = await sql`
    select s.date, s.day, s.status from gym_session s
    where s.day = any(${keys})
      and exists (select 1 from gym_set g where g.date = s.date and ${PERFORMED} and g.reps is not null and g.reps > 0)
    order by s.date desc
    limit 1
  `;
  return (rows[0] as { date: string; day: string | null; status: string | null } | undefined) ?? null;
}

/** Rolling schedule: the most recent date with real logged work, and its program day. */
export async function getLastTrainingRow(): Promise<{ date: string; day: string | null; status: string | null } | null> {
  const rows = await sql`
    select date, day, status from gym_session
    where date = (select max(date) from gym_set where ${PERFORMED} and reps is not null and reps > 0)
  `;
  return (rows[0] as { date: string; day: string | null; status: string | null } | undefined) ?? null;
}

/* `getTrainingDates` was here and is GONE, 2026-08-26. It existed to power a consecutive-day streak
 * counted off this table alone, which was one of two streaks in the app. The survivor is
 * `getTrainingStreak` in ./week.ts, which runs the same distinct-date query against `gym_set` AND
 * the watch's own sessions in one pass, so a helper that sees only half the evidence has no callers
 * and should not get new ones. */

/** A note written at the end of a session. Added 2026-08-16, at his request: "maybe a note place in
 *  the end for when I find something that I wanna write it down or tell you."
 *
 *  Deliberately append-only and with no upsert key. A set is a measurement and re-typing it should
 *  correct it in place; a note is a thing he said at a moment, and two notes on one evening are two
 *  notes, not a correction. Same reasoning as the kitchen's cook_log.
 *
 *  `handled` is the half that makes this worth building. The kitchen learned on 2026-08-02 that a
 *  captured question nobody answers is WORSE than no capture at all, because it teaches him the box
 *  does nothing. Unhandled notes are what an agent reads at the start of a session.
 *
 *  `exerciseId` AND `kind` ARE BOTH OPTIONAL AND BOTH DEFAULT TO NULL, added 2026-08-31. Null means
 *  he did not say, never a guess. The end-of-session box sends neither and is unchanged; the
 *  per-exercise control on the card sends both, and the exercise costs no tap because the card
 *  already knows which one it is. Full reasoning in content/gym/schema.sql and
 *  src/lib/gym/note-kinds.ts.
 *
 *  `asNoteKind` rather than a cast: an unrecognised kind from a stale tab writes null and the note
 *  still lands. A note refused because this build did not know a word is a note gone from the
 *  world, which is the same call the "text is not cleared unless the write landed" rule makes on the
 *  client. */
export async function addNote(opts: {
  date: string;
  day?: string | null;
  dayTitle?: string | null;
  body: string;
  exerciseId?: string | null;
  kind?: unknown;
}) {
  await sql`
    insert into gym_note (date, day, day_title, body, exercise_id, kind)
    values (${opts.date}, ${opts.day ?? null}, ${opts.dayTitle ?? null}, ${opts.body},
            ${opts.exerciseId ?? null}, ${asNoteKind(opts.kind)})
  `;
}

export interface NoteRow {
  id: number;
  date: string;
  day: string | null;
  day_title: string | null;
  body: string;
  handled: boolean;
  created_at: string;
  /** The exercise the note was written from, or null for one written at the end of the session. */
  exercise_id: string | null;
  /** See src/lib/gym/note-kinds.ts. Null means he did not say, never a guessed category. */
  kind: NoteKind | null;
}

/** Newest first. `onlyUnhandled` is the agent's view: what has he told me that I have not acted on. */
/** How many notes exist in total, and how many are unhandled, independent of any display cap.
 *
 *  `getNotes` caps at 20 rows and the page printed `notes.length` as if it were the total. At 18
 *  notes that was correct by luck. At 21 the count would have silently understated it, and worse,
 *  an old UNHANDLED note would have scrolled out of the window and out of the "not acted on" count
 *  with nothing on screen to say so, in the one feature whose whole promise is that a captured
 *  question does not get lost. Finding 37 of the 2026-08-27 audit. */
export async function countNotes(): Promise<{ total: number; unhandled: number }> {
  const rows = await sql`
    select count(*)::int as total,
           count(*) filter (where handled = false)::int as unhandled
    from gym_note
  `;
  const r = rows[0] as { total: number; unhandled: number };
  return { total: Number(r.total), unhandled: Number(r.unhandled) };
}

export async function getNotes(opts: { limit?: number; onlyUnhandled?: boolean } = {}): Promise<NoteRow[]> {
  const limit = opts.limit ?? 20;
  const rows = opts.onlyUnhandled
    ? await sql`select * from gym_note where handled = false order by created_at desc limit ${limit}`
    : await sql`select * from gym_note order by created_at desc limit ${limit}`;
  return rows as unknown as NoteRow[];
}

/* THE SWIM BASELINE moved to src/lib/swim/db.ts on 2026-08-26 with the rest of swim. The TABLE is
 * still gym_swim_baseline: renaming a live table to tidy a prefix would need a migration on the
 * store holding the only copy of his calibration number. See content/swim/baseline.sql. */

