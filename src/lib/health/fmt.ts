/* ONE DATE FORMAT AND ONE MEDIAN FOR THE TRAINING PAGES. Both were copied per file: `when()` four
 * times with two different outputs, `median()` three times. A second copy is how a fix reaches one
 * page and not the other. Pure functions, no server-only import, so client and server files can
 * both read them. */

/** "Jun 6, 2025". With the year, for pages that span more than one: "Jun 6" beside "Aug 25" reads
 *  as one season. Noon UTC so a date-only string cannot land on the previous day. */
export function when(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The middle value, or the mean of the two middle values. Null for an empty list. */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}
