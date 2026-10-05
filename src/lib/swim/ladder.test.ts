/* Regression suite for ladder.ts.  node --experimental-strip-types src/lib/swim/ladder.test.ts
 * The swims below are his real ones, typed from HealthOS/swim-laps.json (piece = deep.ts unbrokenPieces). */
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

// 2026-10-04: lengths 1-9 free (225), 10 breaststroke, 11-20 free (250) then 15 s, 21-40 (500) then 36 s, 41-60 (500).
const oct4 = [P(225, 1, null), P(250, 11, 15), P(500, 21, 36), P(500, 41, null)];
// 2026-09-26: 400 m first, 64 s, then 100 m pieces.
const sep26 = [P(400, 1, 64), P(100, 17, 50), P(100, 21, 45)];

const r1: LadderRung = { firstM: 500, standS: 30 };
const r1loose: LadderRung = { firstM: 500, standS: 36 };
const last: LadderRung = { firstM: 1000, standS: null };

eq(rungMet(r1loose, oct4), true, 'Oct 4 meets 500 m + 36 s + 500 m');
eq(rungMet(r1, oct4), false, 'Oct 4 does not meet a 30 s stand: 36 s is over it');
eq(rungMet(r1, sep26), false, 'a 400 m first piece does not meet a 500 m rung');
eq(rungMet({ firstM: 400, standS: 70 }, sep26), false, '400 + 100 is not 1,000 m');
// The breaststroke length at 10 sits between the 225 and the 250: not back to back, so not a pair.
eq(rungMet({ firstM: 200, standS: 60 }, [P(225, 1, 0), P(775, 11, null)]), false, 'a stroke change is a break, not a stop');
eq(rungMet(r1, [P(500, 1, 20), P(500, 21, null)]), true, '500 + 20 s + 500 meets a 30 s rung');
eq(rungMet(r1, [P(500, 1, 20), P(400, 21, null)]), false, 'the pair must reach 1,000 m');
eq(rungMet(last, [P(500, 1, 5), P(500, 21, null)]), false, 'the last rung allows no stop at all');
eq(rungMet(last, [P(1000, 1, null)]), true, '1,000 m unbroken meets the last rung');
eq(rungMet(r1, [P(1000, 1, null)]), true, 'the goal itself meets every rung');
eq(rungMet(r1, [P(500, 21, null), P(500, 1, 25)].reverse()), true, 'piece order in the input does not matter');

// Position.
const rungs: LadderRung[] = [r1, { firstM: 500, standS: 15 }, { firstM: 600, standS: 15 }];
const good = (date: string, uuid: string): LadderSwim => ({ uuid, date, pieces: [P(500, 1, 12), P(500, 21, null)] });
const s6 = (date: string, uuid: string): LadderSwim => ({ uuid, date, pieces: [P(600, 1, 10), P(400, 25, null)] });
const plain = (date: string, uuid: string): LadderSwim => ({ uuid, date, pieces: [P(200, 1, 60), P(100, 9, null)] });

eq(ladderPosition(rungs, [], '2026-10-04', 2), { index: 0, met: 0, need: 2, metOn: [] }, 'no swims: rung 1, none met');
eq(ladderPosition(rungs, [{ uuid: 'a', date: '2026-10-04', pieces: oct4 }], '2026-10-04', 2).index, 0, 'Oct 4 alone does not move him off rung 1');
eq(ladderPosition(rungs, [good('2026-10-03', 'x'), good('2026-10-02', 'y')], '2026-10-04', 2).met, 0, 'swims before the ladder start do not count');
eq(ladderPosition(rungs, [good('2026-10-05', 'a'), plain('2026-10-06', 'b')], '2026-10-04', 2),
  { index: 0, met: 1, need: 2, metOn: ['2026-10-05'] }, 'one of two: still rung 1');
eq(ladderPosition(rungs, [good('2026-10-05', 'a'), plain('2026-10-06', 'b'), good('2026-10-07', 'c')], '2026-10-04', 2),
  { index: 1, met: 0, need: 2, metOn: [] }, 'two swims met: rung 2, its count starts at zero');
// 12 s stands meet rung 2 (15 s) too, but the swim that finished rung 1 cannot also count for rung 2.
eq(ladderPosition(rungs, [good('2026-10-05', 'a'), good('2026-10-07', 'c'), good('2026-10-08', 'd')], '2026-10-04', 2),
  { index: 1, met: 1, need: 2, metOn: ['2026-10-08'] }, 'one swim never pays for two rungs');
eq(ladderPosition(rungs, [good('2026-10-05', 'a'), good('2026-10-06', 'b'), s6('2026-10-07', 'c'), s6('2026-10-08', 'd'), s6('2026-10-09', 'e'), s6('2026-10-10', 'f')], '2026-10-04', 2).index,
  3, 'past the last rung: index equals the rung count');
// The calendar does nothing: a month of swims below the rung leaves him on it.
const month = Array.from({ length: 20 }, (_, i) => plain(`2026-10-${String(5 + i).padStart(2, '0')}`, `m${i}`));
eq(ladderPosition(rungs, month, '2026-10-04', 2).index, 0, 'time alone never moves him up');

if (failed) {
  console.error(`\n${failed} ladder test(s) failed`);
  process.exit(1);
}
console.log('ladder: all cases pass');
