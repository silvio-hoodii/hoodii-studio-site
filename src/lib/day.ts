/* What day it is, where he is.
 *
 * Vercel runs in UTC. Every client on this site stamps its writes with the LOCAL date: the gym
 * sends `new Date(t - offset).toISOString().slice(0,10)`, which in Calgary is six or seven hours
 * behind UTC. So a server that computes "today" as `new Date().toISOString().slice(0,10)` disagrees
 * with the stored dates for the last six hours of every evening, and after 18:00 a session logged
 * an hour ago reads as belonging to yesterday.
 *
 * That was invisible while the hub only said "Next up Lower B". It stopped being invisible on
 * 2026-08-14, when the row started publishing "Last trained N d ago" and the number went up by one
 * every evening at six.
 *
 * America/Edmonton, not a fixed offset: it is the zone Alberta actually observes, so the DST
 * changes take care of themselves. en-CA formats as YYYY-MM-DD, which is the shape everything
 * downstream compares as a string.
 */
const CALGARY = 'America/Edmonton';

export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CALGARY }).format(new Date());
}

export function daysAgo(n: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CALGARY }).format(new Date(Date.now() - n * 86400000));
}
