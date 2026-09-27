/* Regression suite for spacing.ts.  node --experimental-strip-types src/lib/curio/spacing.test.ts */
import { addDays, deckFor, grade, GAPS, NEW_PER_DAY, REVIEW_CAP, type Candidate } from './spacing.ts';

let failed = 0;
function eq(got: unknown, want: unknown, what: string) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) {
    failed += 1;
    console.error(`FAIL ${what}\n  got  ${g}\n  want ${w}`);
  }
}

const T = '2026-09-27';

// Dates across a month end and a year end.
eq(addDays('2026-09-30', 1), '2026-10-01', 'month rollover');
eq(addDays('2026-12-31', 1), '2027-01-01', 'year rollover');

// First sight.
eq(grade(null, true, T), { box: 1, due: addDays(T, GAPS[1]) }, 'new card, knew it');
eq(grade(null, false, T), { box: 0, due: addDays(T, 1) }, 'new card, missed');

// A miss from high up goes to the bottom, not one step down.
eq(grade({ box: 5, due: T }, false, T), { box: 0, due: addDays(T, 1) }, 'miss resets');

// The top box holds rather than running off the end of the ladder.
const top = GAPS.length - 1;
eq(grade({ box: top, due: T }, true, T), { box: top, due: addDays(T, GAPS[top] ?? -1) }, 'top box holds');

// Deck: due reviews first, oldest first, then new cards in pool order.
const pool: Candidate[] = [
  { id: 'new-a', review: null, firstSeen: null },
  { id: 'later', review: { box: 2, due: addDays(T, 3) }, firstSeen: '2026-09-01' },
  { id: 'due-2', review: { box: 1, due: T }, firstSeen: '2026-09-20' },
  { id: 'due-1', review: { box: 1, due: '2026-09-20' }, firstSeen: '2026-09-10' },
  { id: 'new-b', review: null, firstSeen: null },
  { id: 'new-c', review: null, firstSeen: null },
];
eq(deckFor(pool, T), ['due-1', 'due-2', 'new-a', 'new-b'].slice(0, 2 + NEW_PER_DAY), 'deck order');

// A card not due yet never shows.
eq(deckFor(pool, T).includes('later'), false, 'not-due card stays out');

// New cards already graded today use up the allowance, so a reload does not deal more.
const afterTwo: Candidate[] = [
  { id: 'seen-1', review: { box: 1, due: addDays(T, 3) }, firstSeen: T },
  { id: 'seen-2', review: { box: 0, due: addDays(T, 1) }, firstSeen: T },
  { id: 'new-x', review: null, firstSeen: null },
];
eq(deckFor(afterTwo, T), [], 'allowance spent, nothing more today');

// A long absence does not arrive as a pile.
const backlog: Candidate[] = Array.from({ length: 30 }, (_, i) => ({
  id: `old-${i}`, review: { box: 1, due: addDays(T, -30 + i) }, firstSeen: '2026-08-01',
}));
eq(deckFor(backlog, T).length, REVIEW_CAP, 'overdue capped');

if (failed) {
  console.error(`${failed} spacing case(s) failed`);
  process.exit(1);
}
console.log('spacing: all cases pass');
