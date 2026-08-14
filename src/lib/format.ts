/* How this site says "when".
 *
 * It said it twelve ways. A cross-surface audit on 2026-08-14 found "days ago" spelled three
 * different ways, twice on the SAME page: the hub's gym row read "5 d ago" while its health row two
 * lines below read "47 days old", and /music said "6d ago" with no space at all.
 *
 * Worse, and this is the one that is a bug rather than a style drift: `pastDue` existed twice, once
 * in kitchen/page.tsx and once in kitchen/shop/page.tsx, identical except that at zero days one said
 * `today` and the other said `use today`. Two copies of a function is one copy plus a future
 * disagreement, and that one had already happened.
 *
 * Deliberately NOT a date-formatting library. These are the four shapes this site actually uses.
 */

/** How long ago something happened, in whole days. "today" / "yesterday" / "N days ago". */
export function daysAgoText(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** Relative time from an instant, for things that happen through the day rather than on a date. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return daysAgoText(Math.round(mins / (60 * 24)));
}

/** A deadline, named rather than described. Compact on purpose: this renders in a tight right-hand
 *  column beside a food name, where "3 days left" wraps and "3 d left" does not.
 *
 *  NAME THE DEADLINE, DO NOT DESCRIBE A MOOD, which DESIGN.md states. The negative branch existed in
 *  neither copy originally, so arugula three days past its use-by rendered as "today". */
export function dueInText(days: number | null | undefined): string {
  if (days == null) return '';
  if (days < 0) return `${-days} d past its best`;
  if (days === 0) return 'today';
  return `${days} d left`;
}
