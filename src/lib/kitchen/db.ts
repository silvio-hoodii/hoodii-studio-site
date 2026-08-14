import { neon } from '@neondatabase/serverless';
import { CALGARY, dayOf } from '../day';

if (!process.env.KITCHEN_DATABASE_URL) {
  // Fail loudly at import rather than returning an empty fridge, which would look like
  // "you have nothing" instead of "the database is unreachable".
  throw new Error('KITCHEN_DATABASE_URL is not set');
}

export const sql = neon(process.env.KITCHEN_DATABASE_URL);

/** The kitchen is in Calgary. The server is not.
 *
 * The old app ran on his laptop, so `new Date()` was already Calgary time and the stock fold could
 * use local time freely. Vercel runs UTC, so the same code would silently shift every use-by count
 * by up to a day: an event he taps at 8pm Calgary is already tomorrow in UTC, which is exactly the
 * ageDays:-1 bug the old lib/stock.mjs documents having fixed once. Pinning it here keeps that fix.
 */
export const KITCHEN_TZ = CALGARY;

/** Which calendar day, in the kitchen's timezone, an instant fell on. Returns YYYY-MM-DD.
 *
 * Delegates to lib/day.ts as of 2026-08-14. It had its own identical Intl instance, which is the
 * kind of duplicate that agrees right up until one of them is edited. The name stays because the
 * reasoning above is about the kitchen specifically and is worth keeping where it is used. */
export const kitchenDay = dayOf;

/** Whole days between two YYYY-MM-DD calendar days. Positive means `b` is later. */
export function daysBetween(a: string, b: string): number {
  const p = (s: string) => {
    const [y = 1970, m = 1, d = 1] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((p(b) - p(a)) / 86400000);
}
