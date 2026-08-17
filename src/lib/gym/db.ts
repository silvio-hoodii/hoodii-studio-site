import 'server-only';
import { neon } from '@neondatabase/serverless';

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

export interface SetInput {
  date: string;
  day?: string | null;
  dayTitle?: string | null;
  exerciseId: string;
  exerciseName?: string | null;
  setIdx: number;
  weight?: number | string | null;
  reps?: number | string | null;
  rir?: number | string | null;
  done?: boolean;
  swappedFrom?: string | null;
  loggedAt?: string;
  suggW?: number | string | null;
  suggR?: number | string | null;
  estimated?: boolean | null;
}

export interface SetRow {
  weight: number | null;
  reps: number | null;
  rir: number | null;
}

export interface SessionSets {
  date: string;
  sets: SetRow[];
}

/** Ensures a session row exists and bumps day_title. Ported from HealthOS db.mjs upsertSession. */
export async function upsertSession(opts: { date: string; day?: string | null; dayTitle?: string | null }) {
  await sql`
    insert into gym_session (date, day, day_title, started_at, status)
    values (${opts.date}, ${opts.day ?? null}, ${opts.dayTitle ?? null}, now(), 'active')
    on conflict (date, day) do update set
      day_title = coalesce(excluded.day_title, gym_session.day_title)
  `;
}

/** Upsert one set. Re-logging the same (date, exercise, set) updates in place, never duplicates.
 *  Direct port of HealthOS db.mjs upsertSet / the ON CONFLICT shape, same reasoning: only a real
 *  value change should look "dirty" to anything downstream that watches for changes. */
export async function upsertSet(s: SetInput) {
  if (s.date && s.day !== undefined) {
    await upsertSession({ date: s.date, day: s.day, dayTitle: s.dayTitle });
  }
  await sql`
    insert into gym_set (date, day, exercise_id, exercise_name, set_idx, weight, reps, rir, done,
      swapped_from, logged_at, suggested_weight, suggested_reps, estimated)
    values (${s.date}, ${s.day ?? null}, ${s.exerciseId}, ${s.exerciseName ?? null}, ${s.setIdx},
      ${num(s.weight)}, ${num(s.reps)}, ${num(s.rir)}, ${!!s.done}, ${s.swappedFrom ?? null},
      ${s.loggedAt ?? new Date().toISOString()}, ${num(s.suggW)}, ${num(s.suggR)},
      ${s.estimated == null ? null : !!s.estimated})
    on conflict (date, exercise_id, set_idx) do update set
      exercise_name = excluded.exercise_name,
      day           = excluded.day,
      weight        = excluded.weight,
      reps          = excluded.reps,
      rir           = excluded.rir,
      done          = excluded.done,
      swapped_from  = excluded.swapped_from,
      logged_at     = excluded.logged_at,
      suggested_weight = coalesce(excluded.suggested_weight, gym_set.suggested_weight),
      suggested_reps   = coalesce(excluded.suggested_reps, gym_set.suggested_reps),
      estimated     = coalesce(excluded.estimated, gym_set.estimated)
  `;
}

/** Most recent prior session (strictly before `beforeDate`) with real logged work for this exercise.
 *  estimated=false is load-bearing (see HealthOS db.mjs): progression must only walk back to a
 *  session whose numbers were actually typed, not recalled/backfilled, or a real gap gets silently
 *  smoothed over instead of triggering the probe branch in progression.ts. */
export async function getLastSession(exerciseId: string, beforeDate: string): Promise<SessionSets | null> {
  const rows = await sql`
    select date from gym_set
    where exercise_id = ${exerciseId} and date < ${beforeDate} and done = true
      and reps is not null and reps > 0 and coalesce(estimated, false) = false
    order by date desc limit 1
  `;
  const row = rows[0] as { date: string } | undefined;
  if (!row) return null;
  const sets = await setsForExDate(exerciseId, row.date);
  return { date: row.date, sets };
}

async function setsForExDate(exerciseId: string, date: string): Promise<SetRow[]> {
  const rows = await sql`
    select weight, reps, rir from gym_set
    where exercise_id = ${exerciseId} and date = ${date} and done = true and reps is not null and reps > 0
    order by set_idx asc
  `;
  return rows as unknown as SetRow[];
}

/** Last N training dates for an exercise (newest first) with sets, powers the stall-detection window. */
export async function getRecentSessions(exerciseId: string, beforeDate: string, n = 3): Promise<SessionSets[]> {
  const rows = await sql`
    select distinct date from gym_set
    where exercise_id = ${exerciseId} and date < ${beforeDate} and done = true and reps is not null and reps > 0
    order by date desc limit ${n}
  `;
  const dates = rows as unknown as { date: string }[];
  const out: SessionSets[] = [];
  for (const { date } of dates) out.push({ date, sets: await setsForExDate(exerciseId, date) });
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

/** A date's logged sets (with done + suggestion) to rehydrate an in-progress session on another device. */
export async function getSessionForHydrate(date: string) {
  return sql`
    select exercise_id, set_idx, weight, reps, done, suggested_weight, suggested_reps, swapped_from
    from gym_set where date = ${date} order by exercise_id, set_idx
  `;
}

export async function getSessionDay(date: string): Promise<string | null> {
  const rows = await sql`select day from gym_session where date = ${date} order by day limit 1`;
  const row = rows[0] as { day: string | null } | undefined;
  return row?.day ?? null;
}

/** Rolling schedule: the most recent date with real logged work, and its program day. */
export async function getLastTrainingRow(): Promise<{ date: string; day: string | null; status: string | null } | null> {
  const rows = await sql`
    select date, day, status from gym_session
    where date = (select max(date) from gym_set where done = true and reps is not null and reps > 0)
  `;
  return (rows[0] as { date: string; day: string | null; status: string | null } | undefined) ?? null;
}

/** Distinct training dates, newest first, powers the consecutive-day streak. */
export async function getTrainingDates(limit = 30): Promise<string[]> {
  const rows = await sql`
    select distinct date from gym_set where done = true and reps is not null and reps > 0
    order by date desc limit ${limit}
  `;
  return (rows as unknown as { date: string }[]).map((r) => r.date);
}

/** A note written at the end of a session. Added 2026-08-16, at his request: "maybe a note place in
 *  the end for when I find something that I wanna write it down or tell you."
 *
 *  Deliberately append-only and with no upsert key. A set is a measurement and re-typing it should
 *  correct it in place; a note is a thing he said at a moment, and two notes on one evening are two
 *  notes, not a correction. Same reasoning as the kitchen's cook_log.
 *
 *  `handled` is the half that makes this worth building. The kitchen learned on 2026-08-02 that a
 *  captured question nobody answers is WORSE than no capture at all, because it teaches him the box
 *  does nothing. Unhandled notes are what an agent reads at the start of a session. */
export async function addNote(opts: {
  date: string;
  day?: string | null;
  dayTitle?: string | null;
  body: string;
}) {
  await sql`
    insert into gym_note (date, day, day_title, body)
    values (${opts.date}, ${opts.day ?? null}, ${opts.dayTitle ?? null}, ${opts.body})
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
}

/** Newest first. `onlyUnhandled` is the agent's view: what has he told me that I have not acted on. */
export async function getNotes(opts: { limit?: number; onlyUnhandled?: boolean } = {}): Promise<NoteRow[]> {
  const limit = opts.limit ?? 20;
  const rows = opts.onlyUnhandled
    ? await sql`select * from gym_note where handled = false order by created_at desc limit ${limit}`
    : await sql`select * from gym_note order by created_at desc limit ${limit}`;
  return rows as unknown as NoteRow[];
}
