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

/* Reads the UNIFIED pool, not the five per-corpus masters.
 *
 * Until 2026-08-21 this merged the five separately and kept the highest-scoring row per key. That
 * produced numbers that could not be compared: each corpus had its own ceiling (nonfiction and
 * genre topped out near 1.5 off three or four source lists, canon reached 10.8 off thirteen), so
 * "highest score wins" just meant "canon always wins". Worse, /reading/all then showed one score
 * for a book while /reading/shelf and the queue, both built from the unified pool, showed
 * another. Same app, same book, two numbers.
 *
 * The per-corpus masters are still read, but only to LABEL a row with which corpus it appears in,
 * for the track filter chips. Spanish is appended separately: it is a genuinely separate corpus
 * with its own sources and is not part of the unified pool. */
const ALL_MASTER = rp('data', 'all', 'master.json');
const TAG_DIRS = [rp('data', 'tags'), rp('data', 'current', 'tags'), rp('data', 'nonfiction', 'tags'), rp('data', 'genre', 'tags')];
const LABEL_MASTERS = [
  ['canon', rp('data', 'master.json')],
  ['nonfiction', rp('data', 'nonfiction', 'master.json')],
  ['genre', rp('data', 'genre', 'master.json')],
  ['current', rp('data', 'current', 'master.json')],
];
const SPANISH = [rp('data', 'spanish', 'master.json'), rp('data', 'spanish', 'tags')];

const client = new Client(url);
await client.connect();

let failure = null;
let rowCount = 0;

try {
  const excluded = new Set();
  for (const e of readJSON(rp('data', 'queue.json'), { entries: [] }).entries) excluded.add(e.key);
  for (const e of readJSON(rp('data', 'finished.json'), { entries: [] }).entries) excluded.add(e.key);

  const tags = new Map();
  for (const dir of TAG_DIRS) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      for (const t of readJSON(resolve(dir, f), { tags: [] }).tags ?? []) tags.set(t.key, t);
    }
  }

  const trackOf = new Map();
  const sources = [];
  for (const [track, file] of LABEL_MASTERS) {
    const m = readJSON(file, null);
    if (!m) continue;
    for (const b of m.books ?? []) trackOf.set(b.key, track);
  }

  const byKey = new Map();
  const push = (b, track, tag) => {
    if (excluded.has(b.key)) return;
    byKey.set(b.key, {
      key: b.key, track, title: b.title, author: b.author, year: b.year ?? null,
      score: b.score, categories: b.categories ?? [],
      lists: (b.sources ?? []).map((s) => s.name),
      tagged: !!tag,
      pace: tag?.pace ?? null, pace_note: tag?.pace_note ?? null, pages: tag?.pages ?? null,
      era: tag?.era ?? null, language: tag?.original_language ?? null, mood: tag?.mood ?? [],
      why: tag?.why ?? null,
    });
  };

  const all = readJSON(ALL_MASTER, null);
  if (!all) throw new Error(`${ALL_MASTER} missing. Run: cd ../ReadingOS && node scripts/ingest.mjs all`);
  for (const s of all.sources ?? []) {
    sources.push({ slug: s.slug, track: trackOf.get(s.slug) ?? 'canon', name: s.name, category: s.category, url: s.url ?? null, count: s.count ?? null, status: s.status ?? null });
  }
  for (const b of all.books ?? []) push(b, trackOf.get(b.key) ?? 'canon', tags.get(b.key));

  // Spanish, its own corpus and not in the unified pool. Keys already present win.
  const [spMaster, spTags] = SPANISH;
  const sp = readJSON(spMaster, null);
  if (sp) {
    for (const s of sp.sources ?? []) sources.push({ slug: s.slug, track: 'spanish', name: s.name, category: s.category, url: s.url ?? null, count: s.count ?? null, status: s.status ?? null });
    const spT = new Map();
    if (existsSync(spTags)) {
      for (const f of readdirSync(spTags).filter((x) => x.endsWith('.json'))) {
        for (const t of readJSON(resolve(spTags, f), { tags: [] }).tags ?? []) spT.set(t.key, t);
      }
    }
    for (const b of sp.books ?? []) if (!byKey.has(b.key)) push(b, 'spanish', spT.get(b.key));
  }

  const rows = [...byKey.values()];
  // Refuses to write on zero, the way content/swim/sync.mjs and content/reading/sync.mjs do.
  if (!rows.length) throw new Error('0 catalog rows resolved (masters unreadable or all excluded), refusing to write');

  if (!sources.length) throw new Error('0 source lists resolved, refusing to write');

  if (!DRY) {
    await client.query('begin');
    await client.query('delete from reading_catalog_entry');
    const COLS = ['key','track','title','author','year','score','categories','lists','tagged','pace','pace_note','pages','era','language','mood','why'];
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const values = [];
      const params = [];
      slice.forEach((r, j) => {
        const b = j * COLS.length;
        values.push(`(${COLS.map((_, k) => `$${b + k + 1}`).join(',')})`);
        params.push(...COLS.map((c) => r[c]));
      });
      await client.query(`insert into reading_catalog_entry (${COLS.join(',')}) values ${values.join(',')}`, params);
      rowCount += slice.length;
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
