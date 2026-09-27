import { sql } from './db';
import { deckFor, grade, type Candidate } from './spacing';
import { today } from '@/lib/day';

/* The two daily cards on /curio: questions to recall, and one saved link to keep or drop. Only
 * /curio/api calls this, and src/proxy.ts gates that prefix for reads as well as writes, because
 * curio_save is his unfiltered reading pile (see content/curio/schema.sql). */

export interface QuizCard {
  id: string;
  question: string;
  answer: string;
  sourceUrl: string | null;
  unchecked: boolean;
  isNew: boolean;
}

export interface SaveCard {
  id: string;
  title: string;
  line: string;
  url: string | null;
  category: string;
}

/* Where every question stands on the ladder: never seen, still learning (due within a week), or
   known (spaced a fortnight or more). A picture of progress, not a backlog: nothing here is "due". */
export interface Ladder {
  total: number;
  fresh: number;
  learning: number;
  known: number;
}

/* The saved-links pile, sorted so far. */
export interface Pile { kept: number; dropped: number; left: number }

export interface Today {
  day: string;
  ladder: Ladder;
  pile: Pile;
  quiz: QuizCard[];
  saves: SaveCard[];
  kept: SaveCard[];
}

/* How many unjudged saves come down per visit. One shows; the rest are there for "another" without
 * a second round trip. */
const SAVES_PER_VISIT = 6;

export async function getToday(): Promise<Today> {
  const day = today();
  /* ONE round trip. Neon bills the time it is awake, and on this site every query is a request to it
     (AGENTS.md, "What costs money"), so three reads go as one transaction. */
  const [pool, saves, kept, pileRows] = await sql.transaction([
    /* His own questions first, newest first, then everything else in the order it was logged. The
       ledger's `asked` rows are the ones he actually wondered about. */
    sql`
      select i.id, i.question, i.answer, i.source_kind, i.source_url,
             r.box, r.due, r.first_seen
        from curio_items i
        left join curio_review r on r.item_id = i.id
       where i.status <> 'retired'
       order by (i.origin = 'asked') desc, i.logged desc, i.id`,
    sql`
      select id, title, tldr, url, category from curio_save
       where verdict is null
       order by captured desc nulls last, id
       limit ${SAVES_PER_VISIT}`,
    sql`
      select id, title, tldr, url, category from curio_save
       where verdict = 'keep'
       order by judged_at desc`,
    sql`
      select count(*) filter (where verdict = 'keep')::int as kept,
             count(*) filter (where verdict = 'drop')::int as dropped,
             count(*) filter (where verdict is null)::int as left
        from curio_save`,
  ]) as [
    Array<{ id: string; question: string; answer: string; source_kind: string; source_url: string | null;
      box: number | null; due: unknown; first_seen: unknown }>,
    Array<{ id: string; title: string; tldr: string; url: string | null; category: string }>,
    Array<{ id: string; title: string; tldr: string; url: string | null; category: string }>,
    Pile[],
  ];

  const ladder: Ladder = { total: pool.length, fresh: 0, learning: 0, known: 0 };
  for (const r of pool) {
    if (r.box == null) ladder.fresh += 1;
    else if (r.box >= 3) ladder.known += 1;
    else ladder.learning += 1;
  }

  const d = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v));
  const candidates: Candidate[] = pool.map((r) => ({
    id: r.id,
    review: r.box == null ? null : { box: r.box, due: d(r.due)! },
    firstSeen: d(r.first_seen),
  }));
  const byId = new Map(pool.map((r) => [r.id, r]));
  const quiz = deckFor(candidates, day).map((id) => {
    const r = byId.get(id)!;
    return {
      id,
      question: r.question,
      answer: r.answer,
      sourceUrl: r.source_url,
      unchecked: r.source_kind === 'verify',
      isNew: r.box == null,
    };
  });

  const card = (s: { id: string; title: string; tldr: string; url: string | null; category: string }) => ({
    id: s.id, title: s.title, line: s.tldr, url: s.url, category: s.category,
  });
  const pile = pileRows[0] ?? { kept: 0, dropped: 0, left: 0 };
  return { day, ladder, pile, quiz, saves: saves.map(card), kept: kept.map(card) };
}

export async function gradeCard(id: string, knew: boolean): Promise<void> {
  const day = today();
  const [prev] = (await sql`select box, due from curio_review where item_id = ${id}`) as Array<{
    box: number; due: unknown;
  }>;
  const prevDue = prev ? (prev.due instanceof Date ? prev.due.toISOString().slice(0, 10) : String(prev.due)) : null;
  /* NOT DUE, NOT GRADED. The device paints its saved copy of the day first, so a card graded on
     the phone in the morning can be dealt again from the laptop's copy; a second "knew it" would
     jump it two boxes. A grade on a card that is already scheduled past today is a no-op. */
  if (prevDue && prevDue > day) return;
  const next = grade(prev ? { box: prev.box, due: prevDue as string } : null, knew, day);
  await sql`
    insert into curio_review (item_id, box, due, first_seen, last_grade, reviews, updated_at)
    values (${id}, ${next.box}, ${next.due}, ${day}, ${knew ? 'knew' : 'missed'}, 1, now())
    on conflict (item_id) do update set
      box = excluded.box, due = excluded.due, last_grade = excluded.last_grade,
      reviews = curio_review.reviews + 1, updated_at = now()`;
}

export async function itemExists(id: string): Promise<boolean> {
  const r = await sql`select 1 from curio_items where id = ${id}`;
  return r.length > 0;
}

export async function judgeSave(id: string, verdict: 'keep' | 'drop' | null): Promise<boolean> {
  const r = await sql`
    update curio_save set verdict = ${verdict}, judged_at = ${verdict ? new Date().toISOString() : null}, updated_at = now()
     where id = ${id}
    returning id`;
  return r.length > 0;
}
