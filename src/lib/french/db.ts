import 'server-only';
import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { schedule, previewIntervals, type SchedulableCard } from './fsrs';
import { CALGARY, today, daysAgo } from '../day';

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

/* `today` COMES FROM src/lib/day.ts, and did not until 2026-08-28.
 *
 * It read `new Date().toISOString().slice(0, 10)` here: UTC, on a server that runs in UTC, for a man
 * in Calgary. Six or seven hours out, so the French "day" ran 18:00 to 18:00 local and every number
 * on the page bent after dinner. Found by 05-small-apps F1, which is the same defect `src/lib/day.ts`
 * was written for on 2026-08-14 after the hub's "last trained N d ago" went up by one every evening
 * at six. /health and /gym were moved onto it then. /french was not, because /french did not exist.
 *
 * THE ONE THAT MATTERS IS NOT THE DISPLAY, IT IS THE CEILING. `NEW_PER_DAY = 12` is documented five
 * lines below as a hard ceiling and it is the single rule this project died twice without: the old
 * build put 1,359 unseen cards in front of him on day one. A ceiling that resets at 18:00 lets a
 * 17:00 sitting and a 18:30 sitting introduce 24 new cards in one calendar day. That is the
 * wall-of-cards failure at half scale, arriving through the mechanism built to prevent it.
 *
 * The other two: "N reviewed today" showed last evening's reviews as this morning's, and the streak
 * folded two Calgary days into one row (Monday 19:00 and Tuesday 17:00 both stamp Tuesday),
 * undercounting a real streak on a page whose design rule is honest numbers only.
 *
 * No schema change. `french_days.date` is text and existing rows keep whatever they were stamped
 * with; the boundary moves for everything written from here on. */

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
 *
 * EVERY CARD MUST NAME A BOOK AND A PAGE, refused here since 2026-08-28.
 *
 * DESIGN.md rule 7 already said every card traces to a real page and that the source renders on the
 * card back. It was prose, and the route comment said out loud that the discipline "lives in the
 * caller" (`src/app/french/api/cards/route.ts`), which is another way of saying nothing executes it.
 * The cookie limited WHO could post, never WHAT. Found by 05-small-apps F2.
 *
 * This is not hypothetical hygiene. Both previous deaths of this project came from content entering
 * that no page had earned: a seeded deck the first time, 1,359 unseen cards the second. A card with
 * no book and no page is a card he cannot check against anything, which is exactly the thing whose
 * absence he has to be able to trust.
 *
 * `scripts/ingest-page.mjs` and the documented in-session flow always supply both, so nothing
 * legitimate is refused. Rejections are COUNTED AND NAMED in the return rather than thrown, so a
 * batch of forty with one bad row still lands thirty-nine and says which one did not.
 */
export async function addCards(
  cards: NewCardInput[],
  source: { book?: string | null; chapter?: string | null; page?: string | null } = {},
): Promise<{ added: number; skipped: number; rejected: { front: string; why: string }[] }> {
  const now = new Date().toISOString();
  let added = 0;
  let skipped = 0;
  const rejected: { front: string; why: string }[] = [];
  for (const c of cards) {
    if (!c.front || !c.back) { skipped++; continue; }

    /* Resolved the same way the insert below resolves them, so the check cannot pass a card the
     * insert then stores as null. Two different resolutions of one field is the shape of defect
     * this file has already paid for elsewhere. */
    const book = source.book ?? c.book ?? null;
    const page = source.page ?? c.page ?? null;
    if (!book || !page) {
      rejected.push({
        front: c.front.trim().slice(0, 60),
        why: !book && !page ? 'no book and no page' : !book ? 'no book' : 'no page',
      });
      continue;
    }

    const id = cardId(c.front, c.kind || 'vocab');
    const existedRows = await sql`select 1 from french_cards where id = ${id}`;
    const existed = existedRows.length > 0;
    await sql`
      insert into french_cards (id, front, back, es_hint, kind, book, chapter, page, note, created_at)
      values (${id}, ${c.front.trim()}, ${c.back.trim()}, ${c.es_hint || null}, ${c.kind || 'vocab'},
        ${book}, ${source.chapter ?? c.chapter ?? null},
        ${page}, ${c.note || null}, ${now})
      on conflict (id) do update set
        back    = coalesce(nullif(excluded.back, ''), french_cards.back),
        es_hint = coalesce(nullif(excluded.es_hint, ''), french_cards.es_hint),
        note    = coalesce(nullif(excluded.note, ''), french_cards.note)
    `;
    if (existed) skipped++; else added++;
  }
  if (added) await bumpDay({ added });
  return { added, skipped, rejected };
}

export interface QueueCard extends CardRow {
  is_new: boolean;
  preview: Record<string, number>;
}

/** How many cards were seen for the FIRST time today, in Calgary.
 *
 * ONE IMPLEMENTATION, because two disagreeing ones is what 05-small-apps F4 found. `getQueue` had
 * this inline and `getSummary`'s `queueSize` did not have it at all, so after a morning sitting that
 * spent the new-card budget the button said "Review 12" and the overlay opened with fewer. A button
 * that overstates what is behind it is the same class of defect as a page claiming "right now" off a
 * week-old mirror, at a smaller scale.
 *
 * Counting `reps = 1` instead would undercount any card relearned in the same session, letting extra
 * new cards leak past the daily cap.
 *
 * `at time zone` and not a bare `::date`. `reviewed_at` is timestamptz and Neon runs in UTC, so
 * `x.first_seen::date` was the UTC day: from 18:00 Calgary it returned tomorrow's date, matched
 * nothing, counted zero introduced, and handed back a fresh budget of 12 to a man who had already
 * taken 12 that afternoon. The ceiling this whole app exists to enforce reset at dinner. */
export async function getIntroducedToday(): Promise<number> {
  const rows = await sql`
    select count(*)::int as n from (
      select card_id, min(reviewed_at) as first_seen from french_reviews group by card_id
    ) x where (x.first_seen at time zone ${CALGARY})::date = ${today()}::date
  `;
  return (rows[0] as { n: number }).n;
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

  const introducedToday = await getIntroducedToday();

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

  const [totalR, unseenR, dueR, learnedR, todayR, st, chaptersR, lastChR, streak, introducedToday] = await Promise.all([
    sql`select count(*)::int n from french_cards where suspended = false`,
    sql`select count(*)::int n from french_cards where suspended = false and reps = 0`,
    sql`select count(*)::int n from french_cards where suspended = false and reps > 0 and next_review_at <= ${now}`,
    sql`select count(*)::int n from french_cards where suspended = false and reps > 0 and stability >= 21`,
    sql`select * from french_days where date = ${t}`,
    getState(),
    sql`select count(*)::int n from french_chapters`,
    sql`select book, chapter, title from french_chapters order by done_at desc limit 1`,
    getStreak(),
    getIntroducedToday(),
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

  /* THE SAME ARITHMETIC `getQueue` PERFORMS, not a plausible-looking version of it. It read
   * `Math.min(dueNow + Math.min(unseen, NEW_PER_DAY), MAX_QUEUE)`, which ignored the new cards
   * already taken today, so the Review button promised twelve after a morning sitting had spent
   * them and the overlay opened with fewer. `newBudget` here mirrors getQueue's line for line
   * against the same `introducedToday`. */
  const newBudget = Math.max(0, Math.min(NEW_PER_DAY - introducedToday, unseen));

  return {
    total, unseen, dueNow, learned,
    queueSize: Math.min(dueNow + newBudget, MAX_QUEUE),
    reviewedToday: todayRow.reviewed,
    streak,
    chapters: (chaptersR[0] as { n: number }).n,
    lastChapter: (lastChR[0] as FrenchSummary['lastChapter']) ?? null,
    examDate: st.exam_date,
    daysToExam,
    newPerDay: NEW_PER_DAY,
  };
}

/** 365-day review counts for the activity strip.
 *
 * The window is computed in Calgary, not by `to_char(now() - interval '365 days')`, which is the UTC
 * day and drops or keeps an extra row at the far end every evening. It matters less than the ceiling
 * above, and it is one line, and two definitions of "a day" in one file is how the first one comes
 * back. */
export async function getActivity(): Promise<{ date: string; reviewed: number }[]> {
  return (await sql`
    select date, reviewed from french_days
    where date >= ${daysAgo(365)}
    order by date asc
  `) as unknown as { date: string; reviewed: number }[];
}
