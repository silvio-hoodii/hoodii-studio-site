/* WHICH RUNG OF THE SWIM LADDER HE IS ON, read off his laps rather than off the calendar.
 *
 * Since 2026-10-12 the ladder is one number: THE LONG ONE, the block that opens every swim on his
 * card (content/swim/plan.json card.blocks[0]). A rung { firstM } is met by a swim whose FIRST
 * unbroken piece starts at length 1 and is at least firstM. Anything later in the swim does not
 * count: the card puts the long one first, and 17 of his 19 swims holding a piece of 250 m or more
 * since 2026-08-15 had it from length 1.
 *
 * A piece is src/lib/swim/deep.ts unbrokenPieces, freestyle only, ending at any stop, any other
 * stroke, or any length outside the band; for the ladder the band's ceiling is 45 s, because a
 * longer length is a stop the watch folded into it (Oct 11 length 33: 60 s, no rest recorded).
 *
 * Until 2026-10-12 a rung was two pieces with a capped stop between them (500 m + 30 s + 500 m),
 * from the 2026-10-04 rebuild. He never swam that plan; see plan.json's $comment.
 *
 * Pure, so the test can hold it to the cases: src/lib/swim/ladder.test.ts. */

export const GOAL_M = 1000;

/** Longest length the ladder accepts inside a piece, ms. */
export const LADDER_LENGTH_MAX_MS = 45_000;

export interface LadderRung {
  firstM: number;
}

export interface LadderPiece {
  metres: number;
  /** 1-based length indexes inside the swim. */
  firstIndex: number;
  lastIndex: number;
  /** The stop after the piece's last length, seconds; null when the piece ends the swim. */
  restAfterS: number | null;
}

export interface LadderSwim {
  uuid: string;
  /** His local day, YYYY-MM-DD. */
  date: string;
  pieces: LadderPiece[];
}

export function rungMet(rung: LadderRung, pieces: LadderPiece[]): boolean {
  return pieces.some((p) => p.firstIndex === 1 && p.metres >= rung.firstM);
}

export interface LadderPosition {
  /** 0-based index of the rung he is on; equals rungs.length when the last rung is done. */
  index: number;
  /** Swims that met the current rung since it became current. */
  met: number;
  need: number;
  /** Dates of those swims, oldest first. */
  metOn: string[];
}

/** Walk his swims oldest first from `fromDay`. Each rung needs `need` swims that meet it, counted only
 *  after the rung below it was finished, so one good swim cannot pay for two rungs. */
export function ladderPosition(rungs: LadderRung[], swims: LadderSwim[], fromDay: string, need: number): LadderPosition {
  let index = 0;
  let metOn: string[] = [];
  for (const s of swims) {
    if (s.date < fromDay) continue;
    if (index >= rungs.length) break;
    if (!rungMet(rungs[index]!, s.pieces)) continue;
    metOn.push(s.date);
    if (metOn.length >= need) {
      index += 1;
      metOn = [];
    }
  }
  return { index, met: metOn.length, need, metOn };
}
