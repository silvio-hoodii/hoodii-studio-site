/**
 * WHEN A GYM SESSION ENDED, derived rather than waited for. Pure: no database, no filesystem.
 *
 * THE CLASS. `gym_session.finished_at` was written by the Finish and "ran out of time" buttons and by
 * nothing else, so a session he walked away from stayed open forever. It happened twice: five rows
 * from June closed by hand on 2026-08-15, five from September (09-10 to 09-23) closed on 2026-10-18
 * with `node scripts/guard-live-session.mjs --close-stranded`. Closing them by hand was validating
 * instances. This file makes "open forever" unrepresentable in what anything READS:
 *
 *   finished_at set                          ->  ended then. Unchanged.
 *   open, last activity under LIVE_HOURS ago ->  live. He could be standing at the rack.
 *   open, last activity older than that      ->  ended AT ITS LAST ACTIVITY.
 *
 * LAST ACTIVITY is the later of `started_at` and the newest `gym_set.logged_at` under the same
 * date and day. A session with no sets therefore ends at its own start, which reads as a zero-length
 * session: that is what it was.
 *
 * NEVER now(). A derived finish of now() would enter a 23-hour session into his record, which is
 * the exact number `page_open_min` in log.ts would then print.
 *
 * ONE THRESHOLD. LIVE_HOURS was a private constant in scripts/guard-live-session.mjs; it lives here
 * so the guard, the page, the log and the write path cannot disagree about what "live" means.
 *
 * TWO FORMS OF ONE RULE. The app reads session state in Postgres, so the readers use the SQL
 * fragments below, and the age is computed there off timestamptz (never in JS from a zone name,
 * HOODII/CLAUDE.md "Times are HIS clock"). `sessionState` is the same rule in JS, for the guard's
 * partition and for the regression suite, src/lib/gym/session-end.test.ts, which also runs the SQL
 * fragments against Postgres with `--sql` and asserts both forms agree.
 *
 * `.mts` like coverage.mts, so node runs it with no build step and Next bundles it.
 */

/** How long after his last logged set a session could plausibly still be running. His sessions run
 *  50 to 90 minutes by the watch; six hours is slack for a long one, a phone left open on the drive
 *  home, and a flush that arrived late. Past it, "he is mid-workout" is not a live hypothesis. */
export const LIVE_HOURS = 6;

/** An instant, or null. A string with no offset is REFUSED (null), never guessed at: a timestamp
 *  without an offset is not a time. */
export function toInstant(v: string | Date | null | undefined): number | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  const s = String(v).trim();
  if (!/(Z|[+-]\d{2}(:?\d{2})?)$/i.test(s)) return null;
  const t = Date.parse(s.replace(' ', 'T'));
  return Number.isNaN(t) ? null : t;
}

export interface SessionTimes {
  startedAt: string | Date | null;
  finishedAt: string | Date | null;
}

export interface SessionState {
  /** True only for an unfinished session whose last activity is inside LIVE_HOURS. */
  live: boolean;
  /** When it ended: the stored finish, else its last activity once outside the window. Null while
   *  live, and null for an unfinished row with no time at all (nothing honest to stamp). */
  finishedAt: Date | null;
}

/** Hours since last activity -> could he still be training. Null hours (no time recorded) is not
 *  live: nobody is mid-workout on a row with no clock. */
export function isLiveHours(hours: number | null): boolean {
  return hours != null && hours < LIVE_HOURS;
}

/** The later of the start and the newest set, or null when neither carries a usable time. */
export function lastActivityAt(startedAt: string | Date | null, lastSetAt: string | Date | null): Date | null {
  const a = toInstant(startedAt);
  const b = toInstant(lastSetAt);
  if (a == null && b == null) return null;
  return new Date(Math.max(a ?? -Infinity, b ?? -Infinity));
}

export function sessionState(
  s: SessionTimes,
  lastSetAt: string | Date | null,
  now: string | Date,
): SessionState {
  const fin = toInstant(s.finishedAt);
  if (fin != null) return { live: false, finishedAt: new Date(fin) };
  const last = lastActivityAt(s.startedAt, lastSetAt);
  const nowMs = toInstant(now);
  if (last == null || nowMs == null) return { live: false, finishedAt: null };
  const hours = (nowMs - last.getTime()) / 3_600_000;
  return isLiveHours(hours) ? { live: true, finishedAt: null } : { live: false, finishedAt: last };
}

/** The suggested entry point: when this session ended, or null while it is live. */
export function effectiveFinishedAt(
  s: SessionTimes,
  lastSetAt: string | Date | null,
  now: string | Date,
): Date | null {
  return sessionState(s, lastSetAt, now).finishedAt;
}

/* ------------------------------------------------------------------------------------------------
 * THE SAME RULE IN SQL, for every reader that asks Postgres. Each takes the alias of a gym_session
 * row in the surrounding query. The alias is checked so nothing but an identifier is ever spliced:
 * callers pass a literal, and wrap the result in `sql.unsafe` because the neon tag binds every `${}`
 * as a parameter.
 * ---------------------------------------------------------------------------------------------- */

function alias(a: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(a)) throw new Error(`session-end: not an alias: ${a}`);
  return a;
}

/** Later of started_at and the newest set under the same date and day. Null when neither exists. */
export function lastActivitySql(a: string): string {
  const s = alias(a);
  return `greatest(${s}.started_at, (select max(se_g.logged_at) from gym_set se_g where se_g.date = ${s}.date and se_g.day is not distinct from ${s}.day))`;
}

/** True only for an unfinished session inside the live window. */
export function isOpenSql(a: string): string {
  const s = alias(a);
  return `(${s}.finished_at is null and ${lastActivitySql(s)} > now() - interval '${LIVE_HOURS} hours')`;
}

/** finished_at, else last activity once outside the window, else null (live, or no time at all). */
export function effectiveFinishedAtSql(a: string): string {
  const s = alias(a);
  const last = lastActivitySql(s);
  return `coalesce(${s}.finished_at, case when ${last} <= now() - interval '${LIVE_HOURS} hours' then ${last} end)`;
}

/** The stored status, except that an unfinished row outside the window reads 'finished', which is
 *  what --close-stranded writes for it. 'active' therefore means live, and only live. */
export function effectiveStatusSql(a: string): string {
  const s = alias(a);
  return `(case when ${s}.finished_at is null and not coalesce(${isOpenSql(s)}, false) then 'finished' else ${s}.status end)`;
}

/** Hours since last activity, computed by Postgres off timestamptz. For the guard's partition. */
export function hoursSinceActivitySql(a: string): string {
  return `extract(epoch from (now() - ${lastActivitySql(a)})) / 3600`;
}

/** What a finish write stamps: now() while the session is live, its last activity once it is not.
 *  So a Finish pressed hours after he left records when he left, not when he remembered. */
export function finishStampSql(a: string): string {
  const last = lastActivitySql(alias(a));
  return `(case when ${last} <= now() - interval '${LIVE_HOURS} hours' then ${last} else now() end)`;
}
