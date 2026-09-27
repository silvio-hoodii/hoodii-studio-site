/* The ReadLater pile, both ways.
 *
 *   node content/curio/sync-saves.mjs [path-to-KnowledgeVault/ReadLater]
 *
 * UP: every processed note in the vault becomes a curio_save row, so /curio can deal him one saved
 * link a day with keep and drop. DOWN: every keep or drop he tapped is written into that note's
 * frontmatter as `verdict:`, so the vault stays the whole record and anything that searches it
 * (the UserPromptSubmit hook, a session grepping by hand) sees what he kept and skips what he
 * dropped. Run by ReadLaterOS/run-readlater.ps1 after the nightly processor.
 *
 * Why this exists, his words 2026-09-26: "I have this habit of just sending links to the knowledge
 * vault and they are there, but I never in my lifetime opened one of those." 389 notes, every one
 * read and summarised correctly by the nightly job, 95 proposed actions, 0 applied.
 *
 * THE ID IS THE FILENAME, not the vault path. The processor files a note under a category folder
 * and a later recategorisation moves it, and a path key would turn that move into a new unjudged
 * row plus a deleted judged one. Filenames are unique across the vault (checked 2026-09-27), and
 * the script refuses to run if that stops being true rather than letting two notes share a verdict.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { neon } from '@neondatabase/serverless';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const ROOT = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'))
  || 'C:/Users/sneyr/Documents/KnowledgeVault/ReadLater';
const FORCE = process.argv.includes('--force');
const url =
  process.env.CURIO_DATABASE_URL || process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!url) throw new Error('CURIO_DATABASE_URL (or GYM_DATABASE_URL / KITCHEN_DATABASE_URL) not set');
if (!existsSync(ROOT)) throw new Error(`no ReadLater folder at ${ROOT}`);
const sql = neon(url);

/* ---- read the vault ---- */

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

/* The first sentence of the TL;DR, which is what the card shows. A sentence ends at a full stop
 * followed by a space and a capital, so "Dr. Smith" and "v1.2" do not cut it short; past 220
 * characters it is cut at a word. */
function firstSentence(s) {
  const m = s.match(/^(.+?[.!?])(?=\s+[A-Z"(])/);
  let line = (m ? m[1] : s).trim();
  if (line.length > 220) line = `${line.slice(0, 220).replace(/\s+\S*$/, '')}...`;
  return line;
}

const notes = [];
const seen = new Map();
for (const dir of readdirSync(ROOT)) {
  const full = join(ROOT, dir);
  if (dir === 'inbox' || dir.startsWith('_') || !statSync(full).isDirectory()) continue;
  for (const f of readdirSync(full)) {
    if (!f.endsWith('.md')) continue;
    const path = join(full, f);
    const text = readFileSync(path, 'utf8');
    const fm = frontmatter(text);
    // Early notes (June) carry `processed:` and no `status:` line; both mean the processor filed it.
    if (!(fm.status === 'processed' || (!fm.status && fm.processed))) continue;
    const id = basename(f, '.md');
    if (seen.has(id)) throw new Error(`two notes share the filename ${id}: ${seen.get(id)} and ${path}`);
    seen.set(id, path);
    const title = (text.match(/^# (.+)$/m)?.[1] ?? id).trim();
    const tldr = text.match(/^\*\*TL;DR\.?\*\*\s*(.+)$/m)?.[1]?.trim() ?? '';
    notes.push({
      id, path, text, title,
      tldr: firstSentence(tldr),
      url: fm.source || null,
      category: fm.category || dir,
      captured: /^\d{4}-\d{2}-\d{2}/.test(fm.captured ?? '') ? fm.captured.slice(0, 10) : null,
      verdict: fm.verdict === 'keep' || fm.verdict === 'drop' ? fm.verdict : null,
    });
  }
}
if (!notes.length) throw new Error(`parsed 0 notes under ${ROOT}, refusing to write`);

/* ---- down first: verdicts tapped on the phone go into the notes ----
 *
 * Down before up, so the upsert below reads a vault that already carries every verdict and cannot
 * write a stale null over one. */
const judged = await sql`select id, verdict from curio_save where verdict is not null`;
let wroteDown = 0;
for (const r of judged) {
  const n = notes.find((x) => x.id === r.id);
  if (!n || n.verdict === r.verdict) continue;
  const next = /^verdict:.*$/m.test(n.text.split(/\r?\n---/)[0])
    ? n.text.replace(/^verdict:.*$/m, `verdict: ${r.verdict}`)
    : n.text.replace(/^(---\r?\n[\s\S]*?)(\r?\n---)/, `$1\nverdict: ${r.verdict}$2`);
  if (next === n.text) throw new Error(`could not write a verdict into ${n.path}`);
  writeFileSync(n.path, next, 'utf8');
  n.verdict = r.verdict;
  wroteDown += 1;
}

/* ---- up ---- */

/* A regeneration may not shrink an accumulated artifact, the same contract as sync.mjs. The pile
 * only grows; fewer notes than the mirror holds means the vault is not fully synced from the phone
 * yet (Obsidian is a desktop app and pulls only while it runs), not that notes were deleted. */
const [before] = await sql`select count(*)::int n from curio_save`;
if (before?.n && notes.length < before.n && !FORCE) {
  throw new Error(
    `REFUSING TO SHRINK curio_save: it holds ${before.n}, the vault parses to ${notes.length}.\n`
    + `  Usually Obsidian has not finished syncing. Rerun with --force if notes really were deleted.`,
  );
}

const rows = notes.map((n) => ({
  id: n.id, title: n.title, tldr: n.tldr, url: n.url, category: n.category,
  captured: n.captured, verdict: n.verdict,
}));
await sql`
  insert into curio_save (id, title, tldr, url, category, captured, verdict, updated_at)
  select id, title, tldr, url, category, captured::date, verdict, now()
    from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
      as x(id text, title text, tldr text, url text, category text, captured text, verdict text)
  on conflict (id) do update set
    title = excluded.title, tldr = excluded.tldr, url = excluded.url,
    category = excluded.category, captured = excluded.captured,
    verdict = coalesce(curio_save.verdict, excluded.verdict),
    updated_at = now()`;

const [after] = await sql`
  select count(*)::int n, count(verdict)::int judged,
         count(*) filter (where verdict = 'keep')::int kept
    from curio_save`;
console.log(
  `sync-saves: ${notes.length} notes up, ${wroteDown} verdicts written into notes; `
  + `mirror ${after.n} rows, ${after.judged} judged, ${after.kept} kept`,
);
