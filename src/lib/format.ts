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

/** 2026-02-13 -> "13/02". Day then month, numeric, no year.
 *
 *  HIS CALL, 2026-08-28: "I don't want the full date, like long words. Just regular day, day, month,
 *  month, and maybe the year goes on top." The year is not dropped, it is PROMOTED: it sits above the
 *  number as its own label, so the two dates stop repeating it and the picture still says which year
 *  it is. Both endpoints of this range are always inside one calendar year, which is what makes that
 *  safe here and would not make it safe anywhere else on this site.
 *
 *  DAY FIRST, on his instruction. It is ambiguous in the general case and it is not ambiguous in
 *  this one: 13 and 24 are both past 12, so neither can be read as a month. If a future range ever
 *  runs between the 1st and the 12th at both ends, that stops being true, which is why this helper
 *  is used on ONE line on two pages and is not offered as a general date format. */
export function dayMonth(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** How long between two dates, in the unit a person actually thinks in: "6 months, 11 days".
 *
 *  HIS ASK, and it is the third thing the screenshot has to say: "I also want to make it evident
 *  that it's about 6 months. I don't know if we should put maybe brackets or something."
 *
 *  CALENDAR MONTHS, NOT DAYS DIVIDED BY 30. 192 days over 30.44 is "6.3 months", which is a number
 *  nobody feels and which rounds to a claim. 13 February to 13 August is exactly six months and the
 *  remaining eleven days are exactly eleven days, so the sentence is true rather than approximate
 *  and it costs the same space.
 *
 *  THE ANCHOR DAY IS CLAMPED to the target month's length. Without it, 31 January plus one month is
 *  31 February, which JavaScript rolls forward into March, and the remainder then comes back
 *  NEGATIVE. It cannot fire on today's data and it is two lines. */
export function spanInMonths(fromIso: string, toIso: string): string {
  const a = new Date(`${fromIso}T12:00:00Z`);
  const b = new Date(`${toIso}T12:00:00Z`);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months--;
  if (months < 0) months = 0;

  const targetMonth = a.getUTCMonth() + months;
  const daysInTarget = new Date(Date.UTC(a.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  const anchor = new Date(Date.UTC(
    a.getUTCFullYear(), targetMonth, Math.min(a.getUTCDate(), daysInTarget), 12,
  ));
  const days = Math.max(0, Math.round((b.getTime() - anchor.getTime()) / 86400000));

  const m = months === 1 ? '1 month' : `${months} months`;
  if (months === 0) return days === 1 ? '1 day' : `${days} days`;
  if (days === 0) return m;
  return `${m}, ${days === 1 ? '1 day' : `${days} days`}`;
}
