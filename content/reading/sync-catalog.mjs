#!/usr/bin/env node
/**
 * Mirrors the four ReadingOS masters (canon, current, nonfiction, genre) into
 * reading_catalog_entry, minus whatever is already in the live ten or already finished.
 *
 *   node content/reading/sync-catalog.mjs [--dry-run]
 *
 * Separate script from sync.mjs on purpose: the masters change when a source list gets added,
 * which is rare, not every time a book gets ticked off. Run it by hand whenever the masters or
 * data/tags/ change, not on the same rhythm as the queue sync.
 *
 * A book that exists in more than one master keeps only its higher-scoring row, same tie-break
 * scripts/add.mjs already uses for the same situation. An untagged book still gets a row, marked
 * tagged = false rather than left out -- see schema.sql for why.
 */
import { Client } from '@neondatabase/serverless';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const DRY = process.argv.includes('--dry-run');
const READINGOS = resolve(import.meta.dirname, '..', '..', '..', 'ReadingOS');
const rp = (...x) => resolve(READINGOS, ...x);

const url =
  process.env.READING_DATABASE_URL || process.env.SWIM_DATABASE_URL ||
  process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!url) throw new Error('READING_DATABASE_URL (or SWIM_DATABASE_URL / GYM_DATABASE_URL / KITCHEN_DATABASE_URL) not set');

const readJSON = (f, fb) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : fb);

const MASTERS = [
  ['canon', rp('data', 'master.json'), rp('data', 'tags')],
  ['current', rp('data', 'current', 'master.json'), rp('data', 'current', 'tags')],
  ['nonfiction', rp('data', 'nonfiction', 'master.json'), rp('data', 'nonfiction', 'tags')],
  ['genre', rp('data', 'genre', 'master.json'), rp('data', 'genre', 'tags')],
  // Missing from the first build of this sync entirely -- 156 books, no tags directory (there is
  // no Hispanophone public-vote list to cross-validate against, per README's "Spanish track"),
  // so every one of these lands honestly marked tagged:false rather than being left out.
  ['spanish', rp('data', 'spanish', 'master.json'), rp('data', 'spanish', 'tags')],
];

const client = new Client(url);
await client.connect();

let failure = null;
let rowCount = 0;

try {
  const excluded = new Set();
  for (const e of readJSON(rp('data', 'queue.json'), { entries: [] }).entries) excluded.add(e.key);
  for (const e of readJSON(rp('data', 'finished.json'), { entries: [] }).entries) excluded.add(e.key);

  // Highest-scoring row per key wins, across all four masters, same as add.mjs.
  const byKey = new Map();
  const sources = [];
  for (const [track, masterPath, tagDir] of MASTERS) {
    const master = readJSON(masterPath, null);
    if (!master) continue;
    for (const s of master.sources ?? []) {
      sources.push({ slug: s.slug, track, name: s.name, category: s.category, url: s.url ?? null, count: s.count ?? null, status: s.status ?? null });
    }
    const tags = new Map();
    if (existsSync(tagDir)) {
      for (const f of readdirSync(tagDir).filter((x) => x.endsWith('.json'))) {
        for (const t of readJSON(resolve(tagDir, f), { tags: [] }).tags ?? []) tags.set(t.key, t);
      }
    }
    for (const b of master.books ?? []) {
      if (excluded.has(b.key)) continue;
      const existing = byKey.get(b.key);
      if (existing && existing.score >= b.score) continue;
      const t = tags.get(b.key);
      byKey.set(b.key, {
        key: b.key, track, title: b.title, author: b.author, year: b.year ?? null,
        score: b.score, categories: b.categories ?? [],
        lists: (b.sources ?? []).map((s) => s.name),
        tagged: !!t,
        pace: t?.pace ?? null, pace_note: t?.pace_note ?? null, pages: t?.pages ?? null,
        era: t?.era ?? null, language: t?.original_language ?? null, mood: t?.mood ?? [],
        why: t?.why ?? null,
      });
    }
  }

  const rows = [...byKey.values()];
  // Refuses to write on zero, the way content/swim/sync.mjs and content/reading/sync.mjs do.
  if (!rows.length) throw new Error('0 catalog rows resolved (masters unreadable or all excluded), refusing to write');

  if (!sources.length) throw new Error('0 source lists resolved, refusing to write');

  if (!DRY) {
    await client.query('begin');
    await client.query('delete from reading_catalog_entry');
    for (const r of rows) {
      await client.query(
        `insert into reading_catalog_entry
           (key, track, title, author, year, score, categories, lists, tagged, pace, pace_note,
            pages, era, language, mood, why)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [r.key, r.track, r.title, r.author, r.year, r.score, r.categories, r.lists, r.tagged,
          r.pace, r.pace_note, r.pages, r.era, r.language, r.mood, r.why],
      );
      rowCount++;
    }
    const [{ n }] = (await client.query('select count(*)::int n from reading_catalog_entry')).rows;
    if (n !== rowCount) throw new Error(`${rowCount} rows built but ${n} written: ${rowCount - n} collided on key.`);

    await client.query('delete from reading_source_list');
    for (const s of sources) {
      await client.query(
        `insert into reading_source_list (slug, track, name, category, url, count, status)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (slug) do update set track = excluded.track`,
        [s.slug, s.track, s.name, s.category, s.url, s.count, s.status],
      );
    }
    await client.query('commit');
  } else {
    rowCount = rows.length;
  }
} catch (err) {
  failure = err instanceof Error ? err.message : String(err);
  if (!DRY) { try { await client.query('rollback'); } catch { /* nothing was open */ } }
  rowCount = 0;
}

console.log(`${DRY ? '[dry run] ' : ''}reading_catalog_entry: ${rowCount} rows`);
if (!DRY) {
  await client.query('insert into reading_catalog_sync (ok, rows, error) values ($1,$2,$3)', [failure == null, rowCount, failure]);
}
await client.end();
if (failure) {
  console.error('catalog sync FAILED:', failure);
  process.exit(1);
}
