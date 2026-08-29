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

/** 2026-08-14 -> "Aug 14". The year is never in question on MOST windows this site draws: a 28-day
 *  training block, a 14-day strip, the date on a session that happened this month.
 *
 *  THAT PREMISE STOPPED BEING UNIVERSAL ON 2026-08-27, when the session logs started drawing the
 *  whole record: /bike/log lists 76 rides from 2021 to 2026 and had two rows reading "Aug 12" with
 *  no way to tell them apart. Use `logDate` for any list that can span more than one year.
 *
 *  Lived in src/app/gym/conditioning/page.tsx until 2026-08-26. It moved here the moment a second
 *  surface (/swim) needed it, rather than after the two copies had already disagreed, which is the
 *  order the `pastDue` note at the top of this file describes going wrong. */
export function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** 2024-08-12 -> "Aug 12 '24". For lists that span years, where the month and day alone are
 *  ambiguous. Two-digit year because the column is 12px mono on a 390px screen and the century has
 *  never been in doubt.
 *
 *  Callers should not choose between this and `shortDate` by hand. `SessionLog` counts the distinct
 *  years in its own rows and picks, so a list that grows past a new year starts showing years on its
 *  own rather than waiting for someone to notice. */
export function logDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const md = d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${md} '${String(d.getUTCFullYear()).slice(2)}`;
}

/** 2026-02-13 -> "February 13, 2026". The month written out, unlike every other formatter here.
 *
 *  IT EXISTS FOR ONE LINE AND THAT LINE IS A SCREENSHOT. His ask, 2026-08-28: "I want the title or
 *  the bold text to be the dates, just from February 13 to August 24, 2026 ... That's what I'm going
 *  to screenshot and that's what I'm going to use regularly." A heading that leaves the phone as an
 *  image has no page around it to supply context, so "Feb 13" is not enough and neither is a
 *  two-digit year: whoever sees the picture in six months has only what is inside the frame.
 *
 *  Noon UTC for the same reason every other date helper in this file does it, so a date-only string
 *  cannot land on the previous day in a western timezone. */
export function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
