/** Where a command-line script finds the Neon connection string, in one place.
 *
 * The gym, health and kitchen tables all live in ONE Neon database with prefixed table names, so
 * any of these three variables reaches all of them. `src/lib/gym/db.ts` says the same thing and
 * carries the same fallback; this is the terminal-side half, because a script started from a git
 * hook gets none of Next's environment loading.
 *
 * EXTRACTED 2026-08-27, when scripts/guard-live-session.mjs became the second script needing it.
 * The first copy was written blind and looked only at DATABASE_URL, which does not exist in this
 * repo's .env.local: the guard reported "no database here" on the machine that has one, and a guard
 * that skips itself is worse than no guard because it prints a reassuring line while checking
 * nothing. Two copies of a lookup drift the moment a variable is renamed, and this one had already
 * drifted before it ran once.
 *
 * Returns null rather than throwing. Each caller decides what an absent database means: a fresh
 * clone and a CI runner are both legitimate places to have none.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const DB_URL_KEYS = ['GYM_DATABASE_URL', 'HEALTH_DATABASE_URL', 'KITCHEN_DATABASE_URL', 'DATABASE_URL'];

export function databaseUrl() {
  for (const k of DB_URL_KEYS) {
    if (process.env[k]) return process.env[k];
  }
  try {
    const env = readFileSync(join(ROOT, '.env.local'), 'utf8');
    const m = /(?:GYM|HEALTH|KITCHEN)_DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/.exec(env);
    if (m) return m[1].trim();
  } catch { /* no local env file is not an error here */ }
  return null;
}
