#!/usr/bin/env node
/* Tell the live site that the laptop just wrote to Neon, so the cached index regenerates now rather
 * than on its six-hour timer. Called at the end of HealthOS/sync/run-health-sync.ps1 and
 * ReadLaterOS/run-readlater.ps1; see src/app/api/revalidate/route.ts for why.
 *
 *   node scripts/revalidate.mjs                  # the index
 *   node scripts/revalidate.mjs index curio      # by name: index, music, curio, archive, reading
 *
 * NAMES, NOT PATHS. Git Bash rewrites a bare `/` argument into `C:/Program Files/Git/`, so the
 * first live call revalidated nothing while printing ok. A name cannot be mangled by any shell.
 *
 * CRON_SECRET comes from the environment or from .env.local, the same way scripts/lib/db-url.mjs
 * finds the database. Exits 0 and says so when the secret is absent: a fresh clone has none, and a
 * pipeline step must not fail its whole run over a cache. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.SITE_URL || 'https://hoodii.studio';

function secret() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  try {
    const m = /^CRON_SECRET=(.*)$/m.exec(readFileSync(join(ROOT, '.env.local'), 'utf8'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

const token = secret();
if (!token) {
  console.log('revalidate: no CRON_SECRET here, nothing sent');
  process.exit(0);
}
const NAMES = { index: '/', music: '/music', curio: '/curio', archive: '/curio/archive', reading: '/reading' };
const args = process.argv.slice(2);
const unknown = args.filter((a) => !(a in NAMES));
if (unknown.length) {
  console.error(`revalidate: unknown page name(s) ${unknown.join(', ')}; use ${Object.keys(NAMES).join(', ')}`);
  process.exit(1);
}
const paths = args.map((a) => NAMES[a]);
let status = 0;
let text = '';
try {
  const res = await fetch(`${SITE}/api/revalidate`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ paths: paths.length ? paths : ['/'] }),
  });
  status = res.status;
  text = await res.text();
} catch (e) {
  text = String(e);
}
console.log(`revalidate: ${status} ${text.slice(0, 200)}`);
if (!(status >= 200 && status < 300)) process.exit(1);
/* The route MARKS a page stale; Next rebuilds it on the next request. That request is this one,
   so the rebuild runs now, inside the wake the pipeline's own writes just paid for, rather than
   whenever a crawler next arrives after the database has gone back to sleep. */
let done;
try { done = JSON.parse(text).revalidated ?? []; } catch { done = []; }
const asked = paths.length ? paths : ['/'];
if (done.length < asked.length) {
  console.error(`revalidate: asked for ${asked.join(' ')}, the site accepted ${done.join(' ') || 'nothing'}`);
  process.exit(1);
}
for (const p of done) {
  const r = await fetch(`${SITE}${p}`, { headers: { 'user-agent': 'hoodii-revalidate' } }).catch(() => null);
  console.log(`revalidate: fetched ${p} ${r ? r.status : 'failed'}`);
}
