/* Regression suite for ladder.ts.  node --experimental-strip-types src/lib/swim/ladder.test.ts
 * The swims below are his real ones, typed from HealthOS/swim-laps.json (piece = deep.ts unbrokenPieces,
 * with the ladder's 45 s ceiling per length). Since 2026-10-12 a rung is the long one: the swim's first
 * piece, from length 1, at least firstM. */
import { ladderPosition, rungMet, type LadderPiece, type LadderRung, type LadderSwim } from './ladder.ts';

let failed = 0;
function eq(got: unknown, want: unknown, what: string) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) {
    failed += 1;
    console.error(`FAIL ${what}\n  got  ${g}\n  want ${w}`);
  }
}
const P = (metres: number, firstIndex: number, restAfterS: number | null): LadderPiece => ({
  metres, firstIndex, lastIndex: firstIndex + metres / 25 - 1, restAfterS,
});

// 2026-10-09: lengths 1-20 free (500) then 15 s, 21-28 (200) then 3 s, ...
const oct9 = [P(500, 1, 15), P(200, 21, 3), P(150, 29, 17)];
// 2026-10-04: lengths 1-9 free (225), 10 breaststroke, 11-20 (250), 21-40 (500), 41-60 (500).
const oct4 = [P(225, 1, null), P(250, 11, 15), P(500, 21, 36), P(500, 41, null)];
// 2026-10-10: 100 m first, 49 s.
const oct10 = [P(100, 1, 49), P(200, 5, 40)];

const r500: LadderRung = { firstM: 500 };
const r600: LadderRung = { firstM: 600 };
const last: LadderRung = { firstM: 1000 };

eq(rungMet(r500, oct9), true, 'Oct 9: 500 m from length 1 meets 500');
eq(rungMet(r600, oct9), false, 'Oct 9 does not meet 600');
eq(rungMet(r500, oct4), false, 'Oct 4: the 500s came later in the swim, not first');
eq(rungMet(r500, oct10), false, 'a 100 m first piece meets nothing');
eq(rungMet(r500, [P(450, 1, 10), P(50, 19, null)]), false, 'a stop inside the long one breaks it');
eq(rungMet(last, [P(1000, 1, null)]), true, '1,000 m first thing meets the last rung');
eq(rungMet(r500, [P(200, 5, 40), P(500, 1, 30)]), true, 'piece order in the input does not matter');

// Position.
const rungs: LadderRung[] = [r500, r600, { firstM: 700 }];
const at = (m: number) => (date: string, uuid: string): LadderSwim => ({ uuid, date, pieces: [P(m, 1, 30), P(200, m / 25 + 1, null)] });
const good = at(500);
const s6 = at(600);
const plain = at(100);

eq(ladderPosition(rungs, [], '2026-10-13', 2), { index: 0, met: 0, need: 2, metOn: [] }, 'no swims: rung 1, none met');
eq(ladderPosition(rungs, [good('2026-10-09', 'x'), good('2026-10-12', 'y')], '2026-10-13', 2).met, 0, 'swims before the card do not count');
eq(ladderPosition(rungs, [good('2026-10-13', 'a'), plain('2026-10-14', 'b')], '2026-10-13', 2),
  { index: 0, met: 1, need: 2, metOn: ['2026-10-13'] }, 'one of two: still rung 1');
eq(ladderPosition(rungs, [good('2026-10-13', 'a'), plain('2026-10-14', 'b'), good('2026-10-15', 'c')], '2026-10-13', 2),
  { index: 1, met: 0, need: 2, metOn: [] }, 'two swims met: rung 2, its count starts at zero');
eq(ladderPosition(rungs, [s6('2026-10-13', 'a'), s6('2026-10-14', 'c'), s6('2026-10-15', 'd')], '2026-10-13', 2),
  { index: 1, met: 1, need: 2, metOn: ['2026-10-15'] }, 'one swim never pays for two rungs');
eq(ladderPosition(rungs, [good('2026-10-13', 'a'), good('2026-10-14', 'b'), s6('2026-10-15', 'c'), s6('2026-10-16', 'd'), at(700)('2026-10-17', 'e'), at(700)('2026-10-18', 'f')], '2026-10-13', 2).index,
  3, 'past the last rung: index equals the rung count');
const month = Array.from({ length: 20 }, (_, i) => plain(`2026-10-${String(13 + i).padStart(2, '0')}`, `m${i}`));
eq(ladderPosition(rungs, month, '2026-10-13', 2).index, 0, 'time alone never moves him up');

if (failed) {
  console.error(`\n${failed} ladder test(s) failed`);
  process.exit(1);
}
console.log('ladder: all cases pass');
