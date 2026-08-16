/* Shapes and labels, with NO `server-only` and no filesystem import, because the recall deck is a
 * client component and needs both.
 *
 * Splitting this out is not tidiness. `src/lib/reading/packs.ts` opens with `import 'server-only'`
 * and reads the packs off disk, and the moment Recall.tsx imported a label map from it the whole
 * route failed to build: server-only is a poison pill by design, and it did its job. The rule this
 * encodes is the one the kitchen already follows with `src/lib/kitchen/types.ts`: data shapes are
 * shared, data ACCESS is not.
 */

export type CardKind = 'who' | 'plot' | 'detail' | 'why' | 'idea' | 'technique' | 'evidence';

export interface Card {
  id: string;
  ch: number;
  sec: string;
  kind: CardKind;
  q: string;
  a: string;
}

export interface Section {
  id: string;
  from: number;
  to: number;
  title: string;
  recap: string;
}

export interface Pack {
  book: string;
  author: string;
  slug: string;
  year: number;
  /** `part` on the six books whose spine is five parts, `chapter` on the one with real chapters. */
  unit: 'chapter' | 'part';
  kind: 'novel' | 'nonfiction' | 'memoir';
  total_chapters: number;
  generated: string;
  finished_on: string | null;
  sections: Section[];
  cards: Card[];
  talk: {
    short: string;
    if_pressed: string;
    arguments: { q: string; a: string }[];
    one_liners: string[];
    prompts: string[];
  };
  context: string[];
  sources: string[];
}

export const kindLabel: Record<Pack['kind'], string> = {
  nonfiction: 'non-fiction',
  novel: 'novel',
  memoir: 'memoir',
};

/** What the reader sees on a card's chapter chip. */
export const unitLabel = (p: Pick<Pack, 'unit'>) => (p.unit === 'part' ? 'part' : 'ch');

export const cardKindLabel: Record<CardKind, string> = {
  who: "Who's who",
  plot: 'What happened',
  detail: 'The detail',
  why: 'Say it out loud',
  idea: 'The idea',
  technique: 'How to do it',
  evidence: 'The evidence',
};
