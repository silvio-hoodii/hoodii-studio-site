import 'server-only';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cache } from 'react';
import type { Pack } from './types';

/* Packs are DATA, one JSON file per book, exactly like content/kitchen/recipes.
 *
 * They were previously seven generated HTML files on a separate Vercel project. Generated, to be
 * fair to it, not hand-written: ReadingOS built them from source JSON. But a build that lives in
 * another repo and runs when someone remembers is how the hub row describing this app stayed wrong
 * for months. The file IS the page now, and every number on the index is counted off these at
 * render rather than written down.
 *
 * content/reading/validate.mjs runs in `pnpm build`, so a pack whose cards point at the wrong
 * section cannot deploy. That check came across with the data and it is the load-bearing half: a
 * mis-tagged card grades correctly and quietly aims the miss report at the wrong stretch of the
 * book, which is invisible from the outside.
 *
 * Shapes and label maps live in ./types, which carries no `server-only`, because the recall deck is
 * a client component and needs them.
 */

const DIR = join(process.cwd(), 'content', 'reading', 'packs');

export const allPacks = cache(async (): Promise<Pack[]> => {
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.json'));
  const out = await Promise.all(
    files.map(async (f) => JSON.parse(await readFile(join(DIR, f), 'utf8')) as Pack),
  );
  return out.sort((a, b) => a.book.localeCompare(b.book));
});

export const getPack = cache(async (slug: string): Promise<Pack | null> => {
  try {
    return JSON.parse(await readFile(join(DIR, `${slug}.json`), 'utf8')) as Pack;
  } catch {
    return null;
  }
});

export type { Pack, Card, Section, CardKind } from './types';
export { kindLabel, unitLabel, cardKindLabel } from './types';
