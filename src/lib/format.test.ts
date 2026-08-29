/* REGRESSION SUITE FOR THE DATE HELPERS BEHIND THE /health HEADLINE.
 *
 *   node --experimental-strip-types src/lib/format.test.ts
 *
 * WHY THESE TWO AND NOT THE WHOLE FILE. `spanInMonths` does calendar arithmetic, and calendar
 * arithmetic in JavaScript has one famous trap: 31 January plus one month is 31 February, which
 * `Date.UTC` rolls forward into March, and the remainder then comes back NEGATIVE. The clamp that
 * stops it cannot fire on today's data, so without a test it is a line nobody has ever seen work.
 * That is the same shape as the `{PEAK_*}` gate that sat dead after `process.exit()` and reported
 * zero failures while checking nothing.
 *
 * `dayMonth` is here because it is deliberately ambiguous in the general case and safe in the one
 * place it is used, and a test is where that reasoning becomes checkable rather than a comment.
 *
 * THE LIVE VALUES ARE A CASE. The headline he screenshots reads "13/02 to 24/08, 6 months, 11 days"
 * and those three strings are asserted here, so a change to any of the three fails here rather than
 * on his phone.
 */
import { dayMonth, spanInMonths } from './format.ts';

let failed = 0;

function eq(name: string, got: string, want: string) {
  if (got === want) {
    console.log(`ok    ${name}`);
    return;
  }
  failed++;
  console.log(`FAIL  ${name}\n        expected ${JSON.stringify(want)}\n        got      ${JSON.stringify(got)}`);
}

/* ---- the live headline, the one he screenshots ------------------------------------------------ */
eq('the headline start date', dayMonth('2026-02-13'), '13/02');
eq('the headline end date', dayMonth('2026-08-24'), '24/08');
eq('the headline span', spanInMonths('2026-02-13', '2026-08-24'), '6 months, 11 days');

/* ---- the month-end trap, which is why this file exists ----------------------------------------
 *
 * THESE THREE WERE CHOSEN BY RUNNING THE FUNCTION BOTH WAYS, not by reasoning about it, and the
 * first three cases I wrote turned out NOT to exercise the clamp at all: the `months--` above it
 * already handled them, so they would have passed with the clamp deleted. A case that passes on the
 * broken version tests nothing.
 *
 * The clamp only fires when the end day is at or past the start day AND the start day does not
 * exist in the target month. Measured, with the clamp removed:
 *
 *     2026-01-31 to 2026-03-02   ->  1 month, -1 days     <- a NEGATIVE remainder on the card
 *     2026-08-31 to 2026-10-01   ->  1 month              <- silently swallows a day
 *     2026-05-31 to 2026-07-01   ->  1 month              <- same
 */
eq('31 Jan to 2 Mar, the case that goes NEGATIVE unclamped', spanInMonths('2026-01-31', '2026-03-02'), '1 month, 2 days');
eq('31 Aug to 1 Oct does not swallow the extra day', spanInMonths('2026-08-31', '2026-10-01'), '1 month, 1 day');
eq('31 May to 1 Jul, the same shape in a different month', spanInMonths('2026-05-31', '2026-07-01'), '1 month, 1 day');
eq('31 Jan to 28 Feb stays under a month', spanInMonths('2026-01-31', '2026-02-28'), '28 days');
eq('31 Jan to 31 Mar is a clean two months', spanInMonths('2026-01-31', '2026-03-31'), '2 months');

/* ---- a leap year, because 2028 is one and this line will still be here ------------------------- */
eq('across 29 February', spanInMonths('2028-01-29', '2028-02-29'), '1 month');

/* ---- the ordinary shapes ---------------------------------------------------------------------- */
eq('exactly one month says month, not "1 months"', spanInMonths('2026-02-13', '2026-03-13'), '1 month');
eq('one day', spanInMonths('2026-02-13', '2026-02-14'), '1 day');
eq('no time at all', spanInMonths('2026-02-13', '2026-02-13'), '0 days');
eq('under a month falls back to days', spanInMonths('2026-02-13', '2026-03-01'), '16 days');
eq('a month and one day', spanInMonths('2026-02-13', '2026-03-14'), '1 month, 1 day');
eq('over a year', spanInMonths('2025-02-13', '2026-08-24'), '18 months, 11 days');

/* ---- a backwards range returns nothing rather than a negative ---------------------------------- */
eq('the end before the start is floored, never negative', spanInMonths('2026-08-24', '2026-02-13'), '0 days');

console.log('-'.repeat(70));
console.log(failed ? `${failed} FAILED` : 'all format cases pass');
process.exit(failed ? 1 : 0);
