import { neon } from '@neondatabase/serverless';

/* Read-only. CuriosityOS/log.md is the ledger and content/curio/sync.mjs pushes a mirror here;
 * nothing on the web ever writes back, which is why there is no /curio/api at all. */
const DATABASE_URL =
  process.env.CURIO_DATABASE_URL || process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('CURIO_DATABASE_URL (or GYM_DATABASE_URL / KITCHEN_DATABASE_URL as fallback) is not set');
}

export const sql = neon(DATABASE_URL);

export interface CurioFresh {
  headline: string;
  body: string;
  source?: string;
}

export interface CurioDigest {
  day: string;
  subject: string;
  opener: string | null;
  fresh: CurioFresh[];
}

export interface CurioItem {
  id: string;
  logged: string;
  question: string;
  answer: string;
  flavor: string;
  sourceKind: string;
  sourceUrl: string | null;
  status: string;
  sentCount: number;
}

export interface CurioSummary {
  items: number;
  digests: number;
  latestDay: string | null;
  latestQuestion: string | null;
}

function day(v: unknown): string {
  // Neon hands back a Date for `date` columns; the day string is all this ever renders.
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '');
}

export async function getSummary(): Promise<CurioSummary> {
  const [counts] = (await sql`
    select
      (select count(*) from curio_items)   ::int as items,
      (select count(*) from curio_digests) ::int as digests,
      (select max(day) from curio_digests)      as latest_day`) as Array<{
    items: number; digests: number; latest_day: unknown;
  }>;
  const [latest] = (await sql`
    select question from curio_items order by logged desc, question limit 1`) as Array<{ question: string }>;

  return {
    items: counts?.items ?? 0,
    digests: counts?.digests ?? 0,
    latestDay: counts?.latest_day ? day(counts.latest_day) : null,
    latestQuestion: latest?.question ?? null,
  };
}

export async function getDigests(): Promise<CurioDigest[]> {
  const rows = (await sql`
    select day, subject, opener, fresh from curio_digests order by day desc`) as Array<{
    day: unknown; subject: string; opener: string | null; fresh: CurioFresh[];
  }>;
  return rows.map((r) => ({
    day: day(r.day),
    subject: r.subject,
    opener: r.opener,
    // jsonb comes back parsed, but a hand-edited row could still be a string.
    fresh: (typeof r.fresh === 'string' ? JSON.parse(r.fresh) : r.fresh) ?? [],
  }));
}

export async function getItems(): Promise<CurioItem[]> {
  const rows = (await sql`
    select id, logged, question, answer, flavor, source_kind, source_url, status,
           coalesce(array_length(sent_dates, 1), 0)::int as sent_count
      from curio_items
     where status <> 'retired'
     order by logged desc, question`) as Array<{
    id: string; logged: unknown; question: string; answer: string; flavor: string;
    source_kind: string; source_url: string | null; status: string; sent_count: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    logged: day(r.logged),
    question: r.question,
    answer: r.answer,
    flavor: r.flavor,
    sourceKind: r.source_kind,
    sourceUrl: r.source_url,
    status: r.status,
    sentCount: r.sent_count,
  }));
}
