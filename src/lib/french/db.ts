import 'server-only';
import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { schedule, previewIntervals, type SchedulableCard } from './fsrs';

// Same underlying Neon database as Gym/Kitchen/Health (french_ prefix keeps the tables apart), see
// content/french/schema.sql. Falls back through the same chain the other lib/*/db.ts modules use.
const DATABASE_URL =
  process.env.FRENCH_DATABASE_URL || process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('FRENCH_DATABASE_URL (or GYM_DATABASE_URL / KITCHEN_DATABASE_URL as fallback) is not set');
}

export const sql = neon(DATABASE_URL);

// New cards introduced per day. The old build put 1,359 unseen cards in front of him on day one
// and he never came back. This cap is the fix: a hard ceiling, not a suggestion. See DESIGN.md rule 6.
export const NEW_PER_DAY = 12;
// Review queue ceiling for one sitting, sized for the stated 20-30 min/day budget.
export const MAX_QUEUE = 40;

const today = (): string => new Date().toISOString().slice(0, 10);

export interface CardRow extends SchedulableCard {
  id: string;
  front: string;
  back: string;
  es_hint: string | null;
  kind: string;
  book: string | null;
  chapter: string | null;
  page: string | null;
  note: string | null;
  created_at: string;
  suspended: boolean;
  last_rating: number | null;
  interval_days: number;
}

export interface NewCardInput {
  front: string;
  back: string;
  kind?: string;
  es_hint?: string | null;
  note?: string | null;
  book?: string | null;
  chapter?: string | null;
  page?: string | null;
}

// Stable id from the French side + kind, so re-photographing the same page updates rather than
// duplicating.
export function cardId(front: string, kind: string): string {
  return createHash('sha1').update(`${kind}::${front.trim().toLowerCase()}`).digest('hex').slice(0, 16);
}

async function bumpDay(delta: { reviewed?: number; added?: number; book_work?: number }) {
  const { reviewed = 0, added = 0, book_work = 0 } = delta;
  await sql`
    insert into french_days (date, reviewed, added, book_work) values (${today()}, ${reviewed}, ${added}, ${book_work})
    on conflict (date) do update set
      reviewed  = french_days.reviewed + excluded.reviewed,
      added     = french_days.added + excluded.added,
      book_work = greatest(french_days.book_work, excluded.book_work)
  `;
}

/**
 * Insert cards from one book section. Existing cards keep their FSRS state: re-ingesting a page
 * must never reset scheduling progress. This is the ONLY card intake, see DESIGN.md rule 1.
 */
export async function addCards(
  cards: NewCardInput[],
  source: { book?: string | null; chapter?: string | null; page?: string | null } = {},
): Promise<{ added: number; skipped: number }> {
  const now = new Date().toISOString();
  let added = 0;
  let skipped = 0;
  for (const c of cards) {
    if (!c.front || !c.back) { skipped++; continue; }
    const id = cardId(c.front, c.kind || 'vocab');
    const existedRows = await sql`select 1 from french_cards where id = ${id}`;
    const existed = existedRows.length > 0;
    await sql`
      insert into french_cards (id, front, back, es_hint, kind, book, chapter, page, note, created_at)
      values (${id}, ${c.front.trim()}, ${c.back.trim()}, ${c.es_hint || null}, ${c.kind || 'vocab'},
        ${source.book ?? c.book ?? null}, ${source.chapter ?? c.chapter ?? null},
        ${source.page ?? c.page ?? null}, ${c.note || null}, ${now})
      on conflict (id) do update set
        back    = coalesce(nullif(excluded.back, ''), french_cards.back),
        es_hint = coalesce(nullif(excluded.es_hint, ''), french_cards.es_hint),
        note    = coalesce(nullif(excluded.note, ''), french_cards.note)
    `;
    if (existed) skipped++; else added++;
  }
  if (added) await bumpDay({ added });
  return { added, skipped };
}

export interface QueueCard extends CardRow {
  is_new: boolean;
  preview: Record<string, number>;
}

/**
 * The queue for right now: cards genuinely due, then up to NEW_PER_DAY unseen cards. Due always
 * comes first: new material never buries the review debt.
 */
export async function getQueue(limit = MAX_QUEUE): Promise<QueueCard[]> {
  const now = new Date().toISOString();
  const due = (await sql`
    select * from french_cards
    where suspended = false and reps > 0 and next_review_at <= ${now}
    order by next_review_at asc
    limit ${limit}
  `) as unknown as CardRow[];

  // Cards whose FIRST-EVER review happened today. Counting reps = 1 instead would undercount any
  // card relearned in the same session, letting extra new cards leak past the daily cap.
  const introducedRows = await sql`
    select count(*)::int as n from (
      select card_id, min(reviewed_at) as first_seen from french_reviews group by card_id
    ) x where x.first_seen::date = ${today()}
  `;
  const introducedToday = (introducedRows[0] as { n: number }).n;

  const newBudget = Math.max(0, Math.min(NEW_PER_DAY - introducedToday, limit - due.length));
  const fresh = newBudget > 0 ? ((await sql`
    select * from french_cards
    where suspended = false and reps = 0
    order by created_at asc
    limit ${newBudget}
  `) as unknown as CardRow[]) : [];

  return [...due, ...fresh].map((row) => ({
    ...row,
    is_new: row.reps === 0,
    preview: previewIntervals(row),
  }));
}

export async function reviewCard(id: string, rating: number): Promise<(CardRow & ReturnType<typeof schedule>) | null> {
  const rows = (await sql`select * from french_cards where id = ${id}`) as unknown as CardRow[];
  const card = rows[0];
  if (!card) return null;

  const now = new Date();
  const elapsed = card.last_review_at ? (now.getTime() - Date.parse(card.last_review_at)) / 86400000 : 0;
  const s = schedule(card, rating, now);

  await sql`
    update french_cards set stability = ${s.stability}, difficulty = ${s.difficulty}, state = ${s.state},
      reps = ${s.reps}, lapses = ${s.lapses}, last_rating = ${s.last_rating}, interval_days = ${s.interval_days},
      last_review_at = ${s.last_review_at}, next_review_at = ${s.next_review_at}
    where id = ${id}
  `;
  await sql`
    insert into french_reviews (card_id, rating, elapsed_days, interval_days, reviewed_at)
    values (${id}, ${rating}, ${elapsed}, ${s.interval_days}, ${s.last_review_at})
  `;
  await bumpDay({ reviewed: 1 });
  return { ...card, ...s };
}

export async function logChapter(opts: {
  book: string;
  chapter: string;
  title?: string | null;
  pages?: string | null;
  cards_made?: number;
}) {
  const { book, chapter, title = null, pages = null, cards_made = 0 } = opts;
  await sql`
    insert into french_chapters (book, chapter, title, pages, cards_made, done_at)
    values (${book}, ${String(chapter)}, ${title}, ${pages}, ${cards_made}, ${new Date().toISOString()})
    on conflict (book, chapter) do update set
      title = coalesce(excluded.title, french_chapters.title),
      pages = coalesce(excluded.pages, french_chapters.pages),
      cards_made = french_chapters.cards_made + excluded.cards_made,
      done_at = excluded.done_at
  `;
  await bumpDay({ book_work: 1 });
}

export async function getChapters() {
  return sql`select * from french_chapters order by done_at desc`;
}

/** Consecutive days ending today (or yesterday, so an unstarted today doesn't zero it). */
export async function getStreak(): Promise<number> {
  const rows = (await sql`
    select date from french_days where reviewed > 0 order by date desc
  `) as unknown as { date: string }[];
  if (!rows.length) return 0;
  const dayNum = (d: string) => Math.floor(Date.parse(d + 'T00:00:00Z') / 86400000);
  const t = dayNum(today());
  if (t - dayNum((rows[0] as { date: string }).date) > 1) return 0;
  let streak = 1;
  for (let i = 1; i < rows.length; i++) {
    if (dayNum((rows[i - 1] as { date: string }).date) - dayNum((rows[i] as { date: string }).date) === 1) streak++;
    else break;
  }
  return streak;
}

export interface FrenchState {
  id: number;
  exam_date: string | null;
  started_at: string;
}

export async function getState(): Promise<FrenchState> {
  const rows = (await sql`select * from french_state where id = 1`) as unknown as FrenchState[];
  return rows[0] as FrenchState;
}

export async function setExamDate(date: string | null): Promise<FrenchState> {
  await sql`update french_state set exam_date = ${date || null} where id = 1`;
  return getState();
}

export interface FrenchSummary {
  total: number;
  unseen: number;
  dueNow: number;
  learned: number;
  queueSize: number;
  reviewedToday: number;
  streak: number;
  chapters: number;
  lastChapter: { book: string; chapter: string; title: string | null } | null;
  examDate: string | null;
  daysToExam: number | null;
  newPerDay: number;
}

/**
 * Honest counts only. No readiness percentage, no projected CLB score: there is no defensible way
 * to compute either from card data, and a fake number is worse than no number. See DESIGN.md rule 5.
 */
export async function getSummary(): Promise<FrenchSummary> {
  const now = new Date().toISOString();
  const t = today();

  const [totalR, unseenR, dueR, learnedR, todayR, st, chaptersR, lastChR, streak] = await Promise.all([
    sql`select count(*)::int n from french_cards where suspended = false`,
    sql`select count(*)::int n from french_cards where suspended = false and reps = 0`,
    sql`select count(*)::int n from french_cards where suspended = false and reps > 0 and next_review_at <= ${now}`,
    sql`select count(*)::int n from french_cards where suspended = false and reps > 0 and stability >= 21`,
    sql`select * from french_days where date = ${t}`,
    getState(),
    sql`select count(*)::int n from french_chapters`,
    sql`select book, chapter, title from french_chapters order by done_at desc limit 1`,
    getStreak(),
  ]);

  const total = (totalR[0] as { n: number }).n;
  const unseen = (unseenR[0] as { n: number }).n;
  const dueNow = (dueR[0] as { n: number }).n;
  const learned = (learnedR[0] as { n: number }).n;
  const todayRow = (todayR[0] as { reviewed: number } | undefined) ?? { reviewed: 0 };

  let daysToExam: number | null = null;
  if (st.exam_date) {
    daysToExam = Math.ceil((Date.parse(st.exam_date + 'T00:00:00Z') - Date.parse(t + 'T00:00:00Z')) / 86400000);
  }

  return {
    total, unseen, dueNow, learned,
    queueSize: Math.min(dueNow + Math.min(unseen, NEW_PER_DAY), MAX_QUEUE),
    reviewedToday: todayRow.reviewed,
    streak,
    chapters: (chaptersR[0] as { n: number }).n,
    lastChapter: (lastChR[0] as FrenchSummary['lastChapter']) ?? null,
    examDate: st.exam_date,
    daysToExam,
    newPerDay: NEW_PER_DAY,
  };
}

/** 365-day review counts for the activity strip. */
export async function getActivity(): Promise<{ date: string; reviewed: number }[]> {
  return (await sql`
    select date, reviewed from french_days
    where date >= to_char(now() - interval '365 days', 'YYYY-MM-DD')
    order by date asc
  `) as unknown as { date: string; reviewed: number }[];
}
