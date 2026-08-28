import 'server-only';
import { neon } from '@neondatabase/serverless';
import type { AcquisitionEntry, AcquirePayload, QueueEntry } from './queue-types';

/* Read-only. ReadingOS/data/queue.json and data/acquire.json are the ledgers and
 * content/reading/sync.mjs pushes a mirror here by hand; nothing on the web writes back, which is
 * why there is no /reading/api for the queue. */
const DATABASE_URL =
  process.env.READING_DATABASE_URL || process.env.SWIM_DATABASE_URL ||
  process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    'READING_DATABASE_URL (or SWIM_DATABASE_URL / GYM_DATABASE_URL / KITCHEN_DATABASE_URL as fallback) is not set',
  );
}

export const sql = neon(DATABASE_URL);

function iso(v: unknown): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

export async function getQueue(): Promise<QueueEntry[]> {
  const rows = (await sql`
    select key, position, title, author, year, status, track, score, categories, pace,
           pace_note, pages, era, language, mood, format, why, picked_via
      from reading_queue_entry
     order by position`) as Array<{
    key: string; position: number; title: string; author: string; year: number | null;
    status: string; track: QueueEntry['track']; score: string | null; categories: string[];
    pace: string | null; pace_note: string | null; pages: number | null; era: string | null;
    language: string | null; mood: string[]; format: string | null; why: string | null;
    picked_via: string | null;
  }>;
  return rows.map((r) => ({
    key: r.key, position: r.position, title: r.title, author: r.author, year: r.year,
    status: r.status, track: r.track, score: r.score === null ? null : Number(r.score),
    categories: r.categories, pace: r.pace, paceNote: r.pace_note, pages: r.pages, era: r.era,
    language: r.language, mood: r.mood, format: r.format, why: r.why, pickedVia: r.picked_via,
  }));
}

/** Keyed by queue key, so a caller can look up "does this book have an acquisition row" in O(1)
 *  without a join -- most queue entries (owned/reading ones) have none, on purpose. */
export async function getAcquisitionMap(): Promise<Map<string, AcquisitionEntry>> {
  const rows = (await sql`
    select key, verdict, verdict_detail, checked_at, home_branch_label, home_branch_now, payload
      from reading_acquisition_entry`) as Array<{
    key: string; verdict: AcquisitionEntry['verdict']; verdict_detail: string | null;
    checked_at: unknown; home_branch_label: string | null; home_branch_now: boolean;
    payload: AcquirePayload;
  }>;
  const map = new Map<string, AcquisitionEntry>();
  for (const r of rows) {
    map.set(r.key, {
      key: r.key, verdict: r.verdict, verdictDetail: r.verdict_detail, checkedAt: iso(r.checked_at),
      homeBranchLabel: r.home_branch_label, homeBranchNow: r.home_branch_now, payload: r.payload,
    });
  }
  return map;
}

export interface ReadingLiveness {
  lastOkAt: string | null;
  queueUpdated: string | null;
  acquireGenerated: string | null;
  hasAcquisitionData: boolean;
  /** True once the last successful sync is over a week old -- matches ACQUIRE.md's own
   *  `staleness-window: 7` (holds move daily, so acquisition status ages faster than the queue). */
  stale: boolean;
  /** How old the acquisition snapshot is, in days, so a surface can DATE the claim instead of only
   *  learning that it is or is not past a threshold. Added 2026-08-28: `stale` alone cannot render
   *  "on the shelf as of Aug 20", and a sentence that has to say when is a sentence that needs the
   *  number. Null when nothing has ever synced. */
  ageDays: number | null;
  /** THE ONE THAT GATES THE WORD "NOW". True when the library check is too old to support a
   *  present-tense claim about a physical shelf.
   *
   *  Separate from `stale` because they answer different questions on different clocks, and 04-reading
   *  P1-1 is what happens when one boolean tries to do both. `stale` is about the whole mirror at
   *  ACQUIRE.md's seven-day window, which is right for "is the queue current". A hold moves DAILY:
   *  `getLiveness`'s own comment said so and then allowed seven days before saying anything, while
   *  the queue page rendered a green `--signal` badge and the hub row said "on a home-branch shelf
   *  right now" off a check that was six days old at the time of the audit. --signal is reserved for
   *  a value that is true right now, and both files' comments said exactly that about this exact
   *  badge. */
  homeBranchNowStale: boolean;
  lastError: string | null;
}

const STALE_AFTER_DAYS = 7;
/* A day, because that is how often holds move. The sync is run by hand, so this fires often and is
 * meant to: the honest rendering is "on the shelf as of Aug 20", which is still useful, rather than
 * "right now", which is a claim nobody checked. */
const HOME_BRANCH_NOW_AFTER_DAYS = 1;

type SyncOkRow = { ran_at: unknown; queue_updated: string | null; acquire_generated: unknown };
type SyncBadRow = { error: string | null };

/** The two rows turned into the answer, in ONE place.
 *
 * `getLiveness` and `getReadingFrontRow` both need this, and two thresholds computed twice is two
 * definitions of "stale" waiting to disagree. Same reason `src/lib/gym/coverage.mts` has one home:
 * both implementations keep printing plausible numbers while they drift. */
function deriveLiveness(ok: SyncOkRow | undefined, bad: SyncBadRow | undefined): ReadingLiveness {
  const lastOkAt = iso(ok?.ran_at);
  const acquireGenerated = iso(ok?.acquire_generated);
  const ageSource = acquireGenerated ?? lastOkAt;
  const ageDays = ageSource ? (Date.now() - new Date(ageSource).getTime()) / 86_400_000 : null;

  return {
    lastOkAt,
    queueUpdated: ok?.queue_updated ?? null,
    acquireGenerated,
    hasAcquisitionData: acquireGenerated !== null,
    stale: ageDays === null || ageDays > STALE_AFTER_DAYS,
    ageDays: ageDays === null ? null : Math.floor(ageDays),
    homeBranchNowStale: ageDays === null || ageDays > HOME_BRANCH_NOW_AFTER_DAYS,
    lastError: bad?.error ?? null,
  };
}

export async function getLiveness(): Promise<ReadingLiveness> {
  const [ok] = (await sql`
    select ran_at, queue_updated, acquire_generated
      from reading_sync where ok = true order by ran_at desc limit 1`) as SyncOkRow[];
  const [bad] = (await sql`
    select error from reading_sync where ok = false order by ran_at desc limit 1`) as SyncBadRow[];
  return deriveLiveness(ok, bad);
}

/* ---------------------------------------------------------------------------------------------
 * THE HUB'S READING ROW, in ONE round trip.
 *
 * It was five calls behind a `Promise.all`, four of which hit Neon, and it needed a fifth for the
 * liveness above. The hub carries `revalidate = 60` and was 67.1% of the whole account's CPU before
 * that revalidate landed, so it is the one route already known to multiply per-render cost.
 * 04-reading P2-4, audit theme T5.
 *
 * A `Promise.all` makes queries concurrent, not free: Vercel bills Provisioned Memory for an
 * instance's whole lifetime including time spent waiting on I/O, so five concurrent round trips hold
 * five slices of that wait open. `getShelfBundle` in shelf-db.ts is the house pattern (nine became
 * one, verified live) and this is the same construction.
 *
 * THE ROW NEEDS COUNTS, NOT ROWS. `getQueue()` selected eighteen columns of ten books to call
 * `.length` on them, and `getAcquisitionMap()` built a Map of every acquisition row including its
 * whole JSON payload to count the ones with `home_branch_now`. Both are now `count(*)`.
 *
 * `55 published lists` was TYPED into the sentence this feeds, in a function whose own comment bans
 * typed facts (04-reading P3-1). It is `sourceLists` below, from the same transaction.
 * ------------------------------------------------------------------------------------------- */

export interface ReadingFrontRow {
  queued: number;
  borrowNowAtHome: number;
  shelfTotal: number;
  shelfWorth: number;
  wants: number;
  sourceLists: number;
  liveness: ReadingLiveness;
}

export async function getReadingFrontRow(): Promise<ReadingFrontRow> {
  const [queuedRows, borrowRows, shelfRows, wantRows, listRows, okRows, badRows] =
    (await sql.transaction([
      sql`select count(*)::int n from reading_queue_entry`,
      sql`select count(*)::int n from reading_acquisition_entry where home_branch_now`,
      sql`select count(*)::int total, count(*) filter (where tier <> 'maybe')::int worth
            from reading_shelf_entry`,
      sql`select count(*)::int n from reading_want`,
      sql`select count(*)::int n from reading_source_list`,
      sql`select ran_at, queue_updated, acquire_generated
            from reading_sync where ok = true order by ran_at desc limit 1`,
      sql`select error from reading_sync where ok = false order by ran_at desc limit 1`,
    ], { readOnly: true })) as [
      { n: number }[],
      { n: number }[],
      { total: number; worth: number }[],
      { n: number }[],
      { n: number }[],
      SyncOkRow[],
      SyncBadRow[],
    ];

  return {
    queued: queuedRows[0]?.n ?? 0,
    borrowNowAtHome: borrowRows[0]?.n ?? 0,
    shelfTotal: shelfRows[0]?.total ?? 0,
    shelfWorth: shelfRows[0]?.worth ?? 0,
    wants: wantRows[0]?.n ?? 0,
    sourceLists: listRows[0]?.n ?? 0,
    liveness: deriveLiveness(okRows[0], badRows[0]),
  };
}
