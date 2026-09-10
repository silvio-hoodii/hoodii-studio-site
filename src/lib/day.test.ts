/* Regression suite for the clock half of day.ts.  node --experimental-strip-types src/lib/day.test.ts
 *
 * THE FIRST TWO CASES ARE HIS GROUND TRUTH, 2026-09-08. The watch had recorded a 9 am CrossFit demo
 * and a 1 pm weight-machines session he never did, and the store held them as `15:10` and `19:12`,
 * UTC with nothing marking it as UTC. Both were read back to him six hours wrong.
 *
 * THE REFUSAL CASES MATTER MORE THAN THE CONVERSIONS. `clockOf` returning null for a timestamp with
 * no offset is the mechanism: a caller cannot render UTC as local by accident, because the function
 * will not do it. Delete those cases and the guard is gone while every other test still passes.
 *
 * This suite caught its own subject on the first run: `clockOf` was written without
 * `timeZone: 'UTC'` on the formatter and reported 1:12 pm as 6:12 am on this laptop, which is the
 * same bug one layer up.
 */
import { clockOf, localDayOf } from './day.ts';

const cases: [string | null, string | null, string][] = [
  ['2026-09-07 13:12:01-06:00', '1:12 p.m.', 'the machines he did not do'],
  ['2026-09-07 09:10:10-06:00', '9:10 a.m.', 'the CrossFit demo'],
  ['2026-09-06 14:32:06-06:00', '2:32 p.m.', 'Sunday swim'],
  ['2026-09-07 19:12:01.511', null, 'naive UTC must be REFUSED, not guessed'],
  ['2026-09-07 13:12:01', null, 'naive local must be refused too'],
  [null, null, 'null in, null out'],
];
let bad = 0;
for (const [input, want, label] of cases) {
  const got = clockOf(input);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(input)} -> ${JSON.stringify(got)}`);
}
const day = localDayOf('2026-09-07 21:30:00-06:00');
const dayOk = day === '2026-09-07';
if (!dayOk) bad++;
console.log(`${dayOk ? 'PASS' : 'FAIL'}  late-evening local day stays the 7th -> ${day}`);
console.log(bad ? `${bad} FAILED` : 'all passed');
process.exit(bad ? 1 : 0);
