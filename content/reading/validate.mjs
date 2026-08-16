#!/usr/bin/env node
/**
 * Structural gate for content/reading/packs/*.json. Runs in `pnpm build`, so a broken pack cannot
 * deploy. Zero dependencies, same as content/kitchen/validate.mjs.
 *
 *   node content/reading/validate.mjs
 *
 * WHY THIS EXISTS AND NOT A PROSE RULE. These checks are a port of the ones in
 * ReadingOS/scripts/finish-pack.mjs, which refused to emit a pack that failed them and caught a
 * real mis-tag on its very first run. The packs moved here; if the checks had stayed behind, this
 * repo would have inherited the data and lost the only thing keeping it honest.
 *
 * WHAT A MIS-TAG ACTUALLY COSTS, because it is not obvious and it is the reason these are worth
 * running. The whole point of the recall deck is the miss report: you get a question wrong, and the
 * app tells you which stretch of the book to re-read by looking up the card's section. A card
 * tagged with the wrong section still LOOKS fine, still asks a real question, still grades. It just
 * quietly aims you at the wrong part of the book, and there is no way to notice from the outside.
 * A section with no cards is the same failure with the opposite shape: a gap there can never be
 * detected, so that stretch is silently untested forever.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, 'packs');
const KINDS = new Set(['who', 'plot', 'detail', 'why', 'idea', 'technique', 'evidence']);
const UNITS = new Set(['chapter', 'part']);
const errors = [];

const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
if (!files.length) errors.push('no packs found in content/reading/packs');

for (const file of files) {
  const where = `packs/${file}`;
  let p;
  try {
    p = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  } catch (e) {
    errors.push(`${where}: not valid JSON (${e.message})`);
    continue;
  }

  const fail = (m) => errors.push(`${where}: ${m}`);

  // The filename IS the route. A slug that disagrees with it produces a page that cannot link to
  // itself, which is exactly the sort of thing that works locally and 404s in production.
  if (p.slug !== file.replace(/\.json$/, '')) fail(`slug "${p.slug}" does not match the filename`);

  for (const k of ['book', 'author', 'slug', 'kind', 'unit', 'total_chapters', 'sections', 'cards', 'talk']) {
    if (p[k] == null) fail(`missing "${k}"`);
  }
  if (p.unit && !UNITS.has(p.unit)) fail(`unit "${p.unit}" is not chapter or part`);

  const sections = Array.isArray(p.sections) ? [...p.sections].sort((a, b) => a.from - b.from) : [];
  const cards = Array.isArray(p.cards) ? p.cards : [];

  /* Contiguity. Sections must cover 1..total_chapters exactly, with no gap and no overlap, because
     the miss report groups by section and a chapter belonging to no section can never be reported
     against. */
  let expect = 1;
  for (const s of sections) {
    if (s.from !== expect) fail(`section ${s.id} starts at ${s.from}, expected ${expect} (gap or overlap)`);
    if (s.to < s.from) fail(`section ${s.id} ends before it starts`);
    if (!s.title || !s.recap) fail(`section ${s.id} is missing a title or a recap`);
    expect = s.to + 1;
  }
  if (sections.length && expect - 1 !== p.total_chapters) {
    fail(`sections cover 1..${expect - 1}, book has ${p.total_chapters}`);
  }

  const byId = new Map(sections.map((s) => [s.id, s]));
  const cardsPerSection = new Map(sections.map((s) => [s.id, 0]));
  const seen = new Set();

  for (const c of cards) {
    if (seen.has(c.id)) fail(`duplicate card id ${c.id}`);
    seen.add(c.id);
    if (!c.q || !c.a) fail(`card ${c.id}: empty question or answer`);
    if (c.kind && !KINDS.has(c.kind)) fail(`card ${c.id}: unknown kind "${c.kind}"`);
    if (c.ch < 1 || c.ch > p.total_chapters) fail(`card ${c.id}: chapter ${c.ch} out of range`);
    const sec = byId.get(c.sec);
    if (!sec) {
      fail(`card ${c.id}: unknown section "${c.sec}"`);
    } else {
      if (c.ch < sec.from || c.ch > sec.to) {
        fail(`card ${c.id}: chapter ${c.ch} is not inside section ${sec.id} (${sec.from}-${sec.to})`);
      }
      cardsPerSection.set(c.sec, cardsPerSection.get(c.sec) + 1);
    }
  }

  for (const [id, n] of cardsPerSection) {
    if (n === 0) {
      const s = byId.get(id);
      fail(`section ${id} (${s?.title}) has no cards, so a gap there can never be detected`);
    }
  }

  const t = p.talk ?? {};
  for (const k of ['short', 'if_pressed', 'arguments', 'one_liners', 'prompts']) {
    if (t[k] == null) fail(`talk is missing "${k}"`);
  }
  for (const a of t.arguments ?? []) {
    if (!a.q || !a.a) fail('an entry in talk.arguments is missing its question or answer');
  }

  /* The page tells a reader every fact was written from fetched pages rather than from memory. That
     sentence is only true while a pack can name what it was written from, so an empty list is a
     published claim with nothing behind it. */
  if (!Array.isArray(p.sources) || !p.sources.length) {
    fail('no sources, and the page claims every fact came from one');
  }
}

if (errors.length) {
  console.error('Reading packs failed validation:\n');
  for (const e of errors) console.error(`  x  ${e}`);
  console.error(`\n${errors.length} problem${errors.length === 1 ? '' : 's'}. Fix the pack, not this file.`);
  process.exit(1);
}
console.log(`Reading: ${files.length} packs valid.`);
