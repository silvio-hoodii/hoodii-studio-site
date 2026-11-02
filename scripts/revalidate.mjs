#!/usr/bin/env node
/* A NO-OP, KEPT AT THIS PATH ON PURPOSE. Since 2026-11-02 the site has no cached page to regenerate:
 * the front page is static and /api/revalidate is gone. This file used to POST to that route so the
 * index rebuilt right after the laptop wrote to Neon. HealthOS/sync/run-health-sync.ps1
 * (`node scripts\revalidate.mjs index`) and ReadLaterOS/run-readlater.ps1
 * (`node scripts\revalidate.mjs index curio archive`) still call it, and a pipeline step must not
 * fail over a cache that no longer exists, so it accepts the old page names, sends nothing over the
 * network and exits 0. Once those two callers drop the line, delete this file.
 *
 *   node scripts/revalidate.mjs [index|music|curio|archive|reading ...]
 *
 * An unknown name still exits 1, so a typo in a caller is not swallowed. */
const KNOWN = ['index', 'music', 'curio', 'archive', 'reading'];
const args = process.argv.slice(2);
const unknown = args.filter((a) => !KNOWN.includes(a));
if (unknown.length) {
  console.error(`revalidate: unknown page name(s) ${unknown.join(', ')}; the old names were ${KNOWN.join(', ')}`);
  process.exit(1);
}
console.log(`revalidate: nothing to do, the site has no cached pages (asked for ${args.join(' ') || 'index'})`);