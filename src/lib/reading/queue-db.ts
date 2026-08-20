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
  lastError: string | null;
}

const STALE_AFTER_DAYS = 7;

export async function getLiveness(): Promise<ReadingLiveness> {
  const [ok] = (await sql`
    select ran_at, queue_updated, acquire_generated
      from reading_sync where ok = true order by ran_at desc limit 1`) as Array<{
    ran_at: unknown; queue_updated: string | null; acquire_generated: unknown;
  }>;
  const [bad] = (await sql`
    select error from reading_sync where ok = false order by ran_at desc limit 1`) as Array<{
    error: string | null;
  }>;

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
    lastError: bad?.error ?? null,
  };
}
