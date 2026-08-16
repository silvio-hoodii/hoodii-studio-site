import 'server-only';
import { neon } from '@neondatabase/serverless';

/* Read-only. SwimOS/wedge/app/data/schedule.json is the ledger and content/swim/sync.mjs pushes a
 * mirror here; nothing on the web ever writes back, which is why there is no /swim/api. */
const DATABASE_URL =
  process.env.SWIM_DATABASE_URL || process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('SWIM_DATABASE_URL (or GYM_DATABASE_URL / KITCHEN_DATABASE_URL as fallback) is not set');
}

export const sql = neon(DATABASE_URL);

export interface SwimSession {
  pool: string;
  activity: string;
  date: string;
  start: string;
  end: string;
  op: string;
  detail: string | null;
  note: string | null;
  len: number | null;
}

export interface SwimCoverage {
  name: string;
  op: string;
  area: string | null;
  status: string;
  note: string | null;
}

/* Two axes, and they are genuinely different faults.
 *
 * `confirmStale` means nobody has checked these times against the pools lately. `dataStale` means
 * the schedule no longer reaches today at all, which happens when the scrapers keep succeeding at
 * fetching nothing. /health has the first. The second is specific to a timetable and it is the
 * worse one, because a schedule that has fallen behind does not look broken. It looks like a city
 * where no pool has any lane swim, and the page will say so in a calm voice unless something stops
 * it.
 *
 * THE AGE IS MEASURED FROM THE SCRAPE, NOT FROM THE MIRROR WRITE, and that is the whole point of
 * carrying `generated` through sync.mjs into swim_sync. Timing the mirror instead would answer the
 * wrong question twice over: running `node content/swim/sync.mjs` by hand would reset the clock
 * without anyone having gone near a pool website, and a scrape that has silently stopped returning
 * anything would go on looking fresh for as long as the sync kept re-mirroring the same stale file.
 * One number, `generated`, ages correctly under both failures. If the sync itself dies, the newest
 * ok row stops advancing and its `generated` ages with it, so that case is covered too. */
export interface SwimLiveness {
  lastOkAt: string | null;
  confirmedAt: string | null;
  hoursSinceConfirmed: number | null;
  confirmStale: boolean;
  coversThrough: string | null;
  dataStale: boolean;
  lastError: string | null;
}

/* 30 hours, not 36. The scrape runs once a day rather than three times, so one missed run is the
 * whole signal and there is no point waiting for a second. The log shows roughly one missed day a
 * week already, from a laptop that was asleep, so this banner will fire and it should. */
const CONFIRM_STALE_AFTER_HOURS = 30;

function day(v: unknown): string {
  // Neon hands back a Date for date/timestamp columns; the day string is all this renders.
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '');
}

function iso(v: unknown): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

/** Local date in Calgary as YYYY-MM-DD, which is the only clock this data means anything against. */
export function calgaryToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** Local wall clock in Calgary as HH:MM, comparable by string against session start/end. */
export function calgaryNow(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Edmonton', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);
}

export async function getLiveness(): Promise<SwimLiveness> {
  /* Only `ok = true` counts. Liveness is asserted by a row that says a run SUCCEEDED, never
     inferred from the absence of an error, because the absence of an error is the failure mode.
     An empty table is not a healthy one, so a null here reads as stale. */
  const [ok] = (await sql`
    select ran_at, generated, covers_through
      from swim_sync where ok = true order by ran_at desc limit 1`) as Array<{
    ran_at: unknown; generated: unknown; covers_through: string | null;
  }>;
  const [bad] = (await sql`
    select error from swim_sync where ok = false order by ran_at desc limit 1`) as Array<{
    error: string | null;
  }>;

  const lastOkAt = iso(ok?.ran_at);
  const coversThrough = ok?.covers_through ?? null;
  /* Falls back to the mirror write only when the payload carried no `generated` at all, which
     should not happen but would otherwise read as "confirmed at the epoch" and fire the banner
     forever on a database that is actually fine. */
  const confirmedAt = iso(ok?.generated) ?? lastOkAt;
  const hoursSinceConfirmed = confirmedAt
    ? (Date.now() - new Date(confirmedAt).getTime()) / 3_600_000
    : null;

  return {
    lastOkAt,
    confirmedAt,
    hoursSinceConfirmed,
    confirmStale: hoursSinceConfirmed === null || hoursSinceConfirmed > CONFIRM_STALE_AFTER_HOURS,
    coversThrough,
    /* Not "older than N days". The question is whether the window still reaches today at all,
       because the moment it does not, every "open right now" answer is drawn from a day that has
       already happened. */
    dataStale: coversThrough === null || coversThrough < calgaryToday(),
    lastError: bad?.error ?? null,
  };
}

/** Every session from today onward, ordered, with pool length joined in. */
export async function getUpcoming(from: string = calgaryToday()): Promise<SwimSession[]> {
  const rows = (await sql`
    select s.pool, s.activity, s.date, s.start, s."end", s.op, s.detail, s.note, p.len
      from swim_session s
      left join swim_pool p on p.name = s.pool
     where s.date >= ${from}
     order by s.date, s.start, s.pool`) as Array<{
    pool: string; activity: string; date: unknown; start: string; end: string;
    op: string; detail: string | null; note: string | null; len: number | null;
  }>;
  return rows.map((r) => ({ ...r, date: day(r.date) }));
}

export async function getCoverage(): Promise<SwimCoverage[]> {
  return (await sql`
    select name, op, area, status, note from swim_coverage
     order by case status when 'live' then 0 when 'coming' then 1 when 'seasonal' then 2 else 3 end,
              name`) as SwimCoverage[];
}

export interface SwimSummary {
  openNow: number;
  poolsLive: number;
  poolsTotal: number;
  nextStart: string | null;
  nextPool: string | null;
}

/** What the hub row needs, in one round trip rather than by loading the timetable. */
export async function getSummary(now: Date = new Date()): Promise<SwimSummary> {
  const today = calgaryToday(now);
  const clock = calgaryNow(now);

  const [counts] = (await sql`
    select
      (select count(*) from swim_session
        where date = ${today} and start <= ${clock} and "end" > ${clock})::int as open_now,
      (select count(*) from swim_coverage where status = 'live')::int as pools_live,
      (select count(*) from swim_coverage)::int as pools_total`) as Array<{
    open_now: number; pools_live: number; pools_total: number;
  }>;

  const [next] = (await sql`
    select start, pool from swim_session
     where date = ${today} and start > ${clock} order by start limit 1`) as Array<{
    start: string; pool: string;
  }>;

  return {
    openNow: counts?.open_now ?? 0,
    poolsLive: counts?.pools_live ?? 0,
    poolsTotal: counts?.pools_total ?? 0,
    nextStart: next?.start ?? null,
    nextPool: next?.pool ?? null,
  };
}

/** "Killarney Aquatic & Recreation Centre" reads as "Killarney" in a list of twenty. */
export function shortPool(name: string): string {
  return name
    .replace(/\s*(Aquatic|Community|Sport|Recreation|Leisure|Athletic|Wellness)\b.*$/i, '')
    .replace(/\s*(Centre|Center|Pool|Complex|Park)\b\s*$/i, '')
    .trim() || name;
}

/** Minutes between two HH:MM wall-clock strings on the same day. */
export function minutesBetween(a: string, b: string): number {
  const p = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return p(b) - p(a);
}
