import { dayMonth, shortDate, spanInMonths } from '@/lib/format';
import type { YearBody } from '@/lib/health/year';

/** The bold date line above the number. HERE for the same reason the sentence is: both pages built
 *  it out of `peak.date` and `low.date` independently, so the endpoint had to be corrected in two
 *  files when his ruling changed, and a correction applied to one of two copies is how the two
 *  disagreed in the first place. The dates and the number now come from one place or neither does.
 *
 *  The duration is CALENDAR MONTHS, in the bracket he asked for: "I feel like saying February to
 *  August is too much ... I also want to make it evident that it's about 6 months." See
 *  spanInMonths in lib/format.ts, which carries a suite because its month-end clamp cannot fire on
 *  today's data. */
export function YearRangeDates({ body }: { body: YearBody }) {
  return (
    <>
      {dayMonth(body.peak.date)} to {dayMonth(body.latest.date)}{' '}
      <span className="yearline-span">({spanInMonths(body.peak.date, body.latest.date)})</span>
    </>
  );
}

/* THE YEAR'S WEIGHT RANGE, IN ONE SENTENCE, RENDERED IN ONE PLACE.
 *
 * WHY THIS FILE EXISTS. /health and /health/deep both print "peak kg down to low kg, at X kg a
 * week", off the same `getYearBody()`, and AGENTS.md says sharing that function is what stops the
 * two printing different headlines. It stopped them printing different NUMBERS. It did not stop
 * them printing different SENTENCES, and by 2026-09-09 they had drifted into saying opposite things
 * about the same figure:
 *
 *   /health/deep  "...down to 103.7 kg. The most recent reading is 105.2 kg on 6 Sep 2026, so the
 *                  low is behind you rather than current."
 *   /health       "...down to 103.7 kg, at -0.56 kg a week."  and nothing else.
 *
 * /health is the DEFAULT tab and the first thing on the page. So the surface he actually lands on
 * was the one that read as "you weigh 103.7", three lines above a tile saying 105.2, and the page
 * that corrected it was one tap away. His words, finding it: "that first header message is outdated
 * now, the one that compares against an old weight ... everything should be connected."
 *
 * THE STATISTIC IS NOT CHANGED, because it is his. He asked for peak-to-low by name: "difference
 * between the highest weight that I've had this year and the lowest ... I want a big [number]".
 * Peak-to-low is the right answer to the question he asked. It is simply not an answer to "what do
 * I weigh", and until now nothing on the landing surface said which question it was answering.
 *
 * A SHARED FUNCTION IS NOT A SHARED SENTENCE. That is the class this file removes: two pages
 * agreeing on a number and disagreeing about what it means is worse than two numbers, because both
 * look right. `lowIsLatest` had been computed in year.ts since the beginning and read by exactly
 * one of the two callers.
 */
export function YearRangeSentence({ body }: { body: YearBody }) {
  return (
    <>
      <span className="tnum">{body.peak.kg.toFixed(1)} kg</span> down to{' '}
      <span className="tnum">{body.latest.kg.toFixed(1)} kg</span>, at{' '}
      <span className="tnum">
        {body.kgPerWeek > 0 ? '+' : ''}{body.kgPerWeek.toFixed(2)} kg
      </span>{' '}
      a week.{' '}
      {/* THE LOW IS NAMED RATHER THAN HEADLINED, which is the half of his ruling that keeps the
          achievement on the page. Derived, so on the day the newest reading IS the low the sentence
          stops saying it twice. */}
      {body.lowIsLatest ? (
        <>That is also the lowest reading of the year.</>
      ) : (
        <>
          Your lowest this year was{' '}
          <span className="tnum">{body.low.kg.toFixed(1)} kg</span> on {shortDate(body.low.date)}.
        </>
      )}
    </>
  );
}
