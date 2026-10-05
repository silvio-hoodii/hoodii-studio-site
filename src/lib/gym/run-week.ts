/* WHICH WEEK OF THE RUN PLAN IS THIS. Added 2026-10-04 with the outdoor rebuild.
 *
 * The run plan changes shape over its weeks (one run in weeks 1 and 2, two from week 3), so both
 * /run and the planned week on /health have to agree on the week, and they both read it here. Pure
 * arithmetic on two Calgary dates (YYYY-MM-DD), so it imports nothing and the gym validator's
 * regression suite can reason about it the same way. Before the start it is week 1; after the last
 * week it holds on the last week, flagged, because a plan that has run out still describes the
 * last thing he was asked to do. */
export interface RunWeekAt {
  /** 1-based, clamped to the plan. */
  week: number;
  before: boolean;
  after: boolean;
}

export function runWeekAt(startsOn: string, date: string, weeks: number): RunWeekAt {
  const ms = Date.parse(`${date}T12:00:00Z`) - Date.parse(`${startsOn}T12:00:00Z`);
  const days = Math.round(ms / 86_400_000);
  const raw = Math.floor(days / 7) + 1;
  return {
    week: Math.min(Math.max(raw, 1), Math.max(weeks, 1)),
    before: days < 0,
    after: raw > weeks,
  };
}

export const SHORT_DAY: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};
