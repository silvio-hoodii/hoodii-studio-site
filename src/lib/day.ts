/* What day it is, where he is.
 *
 * Vercel runs in UTC. Every client on this site stamps its writes with the LOCAL date: the gym
 * sends `new Date(t - offset).toISOString().slice(0,10)`, which in Calgary is six or seven hours
 * behind UTC. So a server that computes "today" as `new Date().toISOString().slice(0,10)` disagrees
 * with the stored dates for the last six hours of every evening, and after 18:00 a session logged
 * an hour ago reads as belonging to yesterday.
 *
 * That was invisible while the hub only said "Next up Lower B". It stopped being invisible on
 * 2026-08-14, when the row started publishing "Last trained N d ago" and the number went up by one
 * every evening at six.
 *
 * America/Edmonton, not a fixed offset: it is the zone Alberta actually observes, so the DST
 * changes take care of themselves. en-CA formats as YYYY-MM-DD, which is the shape everything
 * downstream compares as a string.
 */
export const CALGARY = 'America/Edmonton';

/* One formatter, built once. Three separate implementations of "what day is it" existed before
 * this file was consolidated on 2026-08-14: this one, `kitchenDay` in lib/kitchen/db.ts, and a
 * hand-rolled `getTimezoneOffset()` version inside GymClient that used the CLIENT's timezone and
 * not Calgary at all. Two of them agreed by coincidence; the third stamped every workout with
 * whatever zone the phone happened to be in. */
const FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: CALGARY,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Which calendar day, in Calgary, an instant fell on. Returns YYYY-MM-DD. */
export function dayOf(instant: Date | string | number = new Date()): string {
  return FMT.format(instant instanceof Date ? instant : new Date(instant));
}

export function today(): string {
  return dayOf(new Date());
}

export function daysAgo(n: number): string {
  return dayOf(new Date(Date.now() - n * 86400000));
}

/* ---------------------------------------------------------------------------------------------
 * WHAT TIME IT WAS, where he was.
 *
 * Everything above answers "which day". Nothing answered "which hour", and on 2026-09-08 that gap
 * cost him a wrong reading of his own training log: `watch_sessions.start_time` is the UTC instant
 * Samsung recorded, it carried nothing saying so, and an agent read `2026-09-07 19:12` off it and
 * told him he had lifted at 7 pm. He had lifted at 1:12 pm. The 15:10 session that reads as
 * mid-afternoon was his 9:10 am CrossFit.
 *
 * So the importer now stores `start_local`, a wall clock WITH its offset attached, taken from the
 * per-row offset in the export rather than from any zone name (see HealthOS/server/local-time.mjs:
 * DST and travel are already answered there, and a zone constant would have to be right about 2019).
 *
 * THIS FUNCTION REFUSES A TIMESTAMP WITH NO OFFSET. That is the whole mechanism. `dayOf` above can
 * safely assume Calgary because it is answering "what is today" for a server; a stored instant from
 * an arbitrary past session cannot be assumed, and guessing is exactly how six hours went missing.
 * A caller holding only the naive UTC field gets null and has to go and find `start_local`.
 */
/* `timeZone: 'UTC'` is REQUIRED and is not cosmetic. Without it, Intl formats in whatever zone the
 * runtime happens to be in: the laptop shifted a 1:12 pm session to 6:12 am, and Vercel, running in
 * UTC, would have agreed with the digits by luck while every developer machine disagreed. The
 * digits below are already his wall clock, so the formatter must be told to leave them alone. This
 * was caught by the test beside this file on the first run, having been written wrong. */
const CLOCK = new Intl.DateTimeFormat('en-CA', {
  hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC',
});

/** `2026-09-07 13:12:01-06:00` -> `1:12 p.m.`  Anything without an offset returns null. */
export function clockOf(startLocal: string | null | undefined): string | null {
  if (!startLocal) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?\s*([+-]\d{2}:?\d{2})$/.exec(startLocal.trim());
  if (!m) return null;                       // no offset: refuse rather than assume a zone
  /* Formatted off the wall-clock digits, not by re-parsing into an instant. Re-parsing would push
     it back through the viewer's own timezone, which is how this class of bug regenerates itself on
     a phone in another country. The digits in the string ARE the answer. */
  const d = new Date(Date.UTC(2000, 0, 1, Number(m[2]), Number(m[3])));
  return CLOCK.format(d).replace(/\u202f/g, ' ');
}

/** `2026-09-07 13:12:01-06:00` -> `2026-09-07`. Null when the offset is missing. */
export function localDayOf(startLocal: string | null | undefined): string | null {
  if (!startLocal) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T]\d{2}:\d{2}(?::\d{2})?\s*[+-]\d{2}:?\d{2}$/.exec(startLocal.trim());
  return m?.[1] ?? null;
}
