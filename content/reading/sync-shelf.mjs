#!/usr/bin/env node
/**
 * Mirrors ReadingOS/data/all/shelf-finder.json into reading_shelf_entry.
 *
 *   node content/reading/sync-shelf.mjs [--dry-run]
 *
 * Rebuild the source first, or this pushes yesterday's scores:
 *   cd ../ReadingOS && node scripts/ingest.mjs all && node scripts/build-shelf-finder.mjs
 *
 * Separate from sync-catalog.mjs because it mirrors a different file. sync-catalog reads the five
 * per-corpus masters, which each have their own score ceiling (nonfiction and genre top out far
 * below canon because they are built from three or four sources rather than thirteen). This reads
 * the unified pool, where every book is scored once against every source, so the numbers are
 * comparable across sections -- which is the whole point of a page that ranks a mystery novel
 * against a literary one on the same shelf letter.
 */
import { Client } from '@neondatabase/serverless';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const DRY = process.argv.includes('--dry-run');
const SRC = resolve(import.meta.dirname, '..', '..', '..', 'ReadingOS', 'data', 'all', 'shelf-finder.json');

const url =
  process.env.READING_DATABASE_URL || process.env.SWIM_DATABASE_URL ||
  process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!url) throw new Error('READING_DATABASE_URL (or SWIM_/GYM_/KITCHEN_DATABASE_URL) not set');

if (!existsSync(SRC)) {
  console.error(`missing ${SRC}\nRun: cd ../ReadingOS && node scripts/ingest.mjs all && node scripts/build-shelf-finder.mjs`);
  process.exit(1);
}
const db = JSON.parse(readFileSync(SRC, 'utf8'));

/* Open Library enrichment, optional. It is a separate file because it is fetched on a different
 * rhythm from the masters: the award lists change when a prize is announced, the enrichment only
 * when a new book enters the browse tier. Absent, every book simply ships without a cover or a
 * description rather than the sync failing. */
const ENRICH = resolve(import.meta.dirname, '..', '..', '..', 'ReadingOS', 'data', 'all', 'enrichment.json');
const enrich = existsSync(ENRICH) ? (JSON.parse(readFileSync(ENRICH, 'utf8')).books ?? {}) : {};

/* Open Library's page count is crowd-sourced from whichever edition someone catalogued, so it
 * occasionally records a placeholder. "How to Say Babylon" came back as 1pp and promptly sorted
 * to the top of "shortest first", which is the one sort where a bad low number does maximum
 * damage. Anything under 20 pages is not a book in this corpus, it is a bad record, so it is
 * dropped rather than shown. Nothing is guessed in its place. */
const sanePages = (n) => (typeof n === 'number' && n >= 20 && n <= 5000 ? n : null);
console.log(`enrichment: ${Object.keys(enrich).length} books`);

/* The builder emits human section labels; the page needs stable slugs for its URLs. Mapping here
 * rather than in the builder keeps the labels editable, but an unmapped label must be a hard
 * failure: silently dropping a section would empty a whole tab and look like "no books". */
const SHELF_SLUG = new Map([
  ['Fiction', 'fiction'],
  ['Sci-Fi & Fantasy', 'scifi'],
  ['Mystery & Crime', 'mystery'],
  ['Non-fiction', 'nonfiction'],
]);

const letterOf = (fileUnder) => {
  const c = (fileUnder || '').charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
};

const rows = [];
const seen = new Set();
for (const b of db.books ?? []) {
  const shelves = (b.g ?? []).map((label) => {
    const slug = SHELF_SLUG.get(label);
    if (!slug) throw new Error(`unmapped shelf label "${label}" -- add it to SHELF_SLUG`);
    return slug;
  });
  /* shelf-finder.json is keyed for a browser, not a database, so it carries no primary key.
   * Rebuild the same one ReadingOS uses, and refuse on a collision rather than letting an
   * upsert quietly drop a book. */
  const key = `${(b.s || '').toLowerCase()}|${(b.t || '').toLowerCase()}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const e = b.key ? enrich[b.key] : null;
  rows.push({
    key,
    title: b.t, author: b.a, file_under: b.s, letter: letterOf(b.s),
    year: b.y ?? null, score: b.sc, honours: b.h ?? 0, tier: b.k,
    shelves, lists: b.w ?? [], status: b.st ?? null,
    pages: b.pg ?? null, pace: b.pc ?? null,
    ol_key: e?.ol_key ?? null,
    cover_url: e?.cover ?? null,
    description: e?.description ?? null,
    rating: e?.rating ?? null,
    rating_count: e?.rating_count ?? null,
    subjects: e?.subjects ?? [],
    // Open Library's page count is better than nothing where a tag has none.
    ...(b.pg ? {} : { pages: sanePages(e?.pages) }),
  });
}

if (!rows.length) throw new Error('0 shelf rows resolved, refusing to write');

const client = new Client(url);
await client.connect();
let failure = null;
let rowCount = 0;

try {
  if (!DRY) {
    await client.query('begin');
    await client.query('delete from reading_shelf_entry');
    /* One multi-row insert per chunk rather than 3,600 round trips: the catalog sync's
     * row-at-a-time loop takes minutes against Neon over a home connection. */
    const CHUNK = 250;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const values = [];
      const params = [];
      slice.forEach((r, j) => {
        const b = j * 20;
        values.push(`(${Array.from({ length: 20 }, (_, k) => `$${b + k + 1}`).join(',')})`);
        params.push(r.key, r.title, r.author, r.file_under, r.letter, r.year, r.score, r.honours, r.tier, r.shelves, r.lists, r.status, r.pages, r.pace, r.ol_key, r.cover_url, r.description, r.rating, r.rating_count, r.subjects);
      });
      await client.query(
        `insert into reading_shelf_entry
           (key,title,author,file_under,letter,year,score,honours,tier,shelves,lists,status,pages,pace,ol_key,cover_url,description,rating,rating_count,subjects)
         values ${values.join(',')}`,
        params,
      );
      rowCount += slice.length;
    }
    const [{ n }] = (await client.query('select count(*)::int n from reading_shelf_entry')).rows;
    if (n !== rowCount) throw new Error(`${rowCount} rows built but ${n} written: ${rowCount - n} collided on key.`);
    await client.query('commit');
  } else {
    rowCount = rows.length;
  }
} catch (err) {
  failure = err instanceof Error ? err.message : String(err);
  if (!DRY) { try { await client.query('rollback'); } catch { /* nothing was open */ } }
  rowCount = 0;
}

const tiers = rows.reduce((a, r) => ({ ...a, [r.tier]: (a[r.tier] ?? 0) + 1 }), {});
console.log(`${DRY ? '[dry run] ' : ''}reading_shelf_entry: ${rowCount} rows (grab ${tiers.grab ?? 0}, good ${tiers.good ?? 0}, maybe ${tiers.maybe ?? 0})`);
if (!DRY) {
  await client.query('insert into reading_shelf_sync (ok, rows, error) values ($1,$2,$3)', [failure == null, rowCount, failure]);
}
await client.end();
if (failure) {
  console.error('shelf sync FAILED:', failure);
  process.exit(1);
}
