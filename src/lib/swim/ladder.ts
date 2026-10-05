/* WHICH RUNG OF THE SWIM LADDER HE IS ON, read off his laps rather than off the calendar.
 *
 * Until 2026-10-04 /swim counted weeks from the day his number was set and moved him up every
 * fortnight whatever he swam. He swam the asked first piece in 1 of 18 swims and the page went on
 * climbing; from Oct 9 it would have asked 600 m, a piece he had swum once all year. His words that
 * night: "rebuild everything based on what I can do ... I want it to be grounded." So a rung now
 * advances only when his lengths show it met, `need` times, and nothing here reads a date except to
 * decide which swims count.
 *
 * MET, in the site's own terms (src/lib/swim/deep.ts unbrokenPieces): a piece is a run of freestyle
 * lengths that ends at any stop, any other stroke, or any length outside 12 to 120 s. A rung
 * { firstM, standS } is met by one swim when either
 *   - one piece is 1,000 m or more (the goal itself meets every rung), or
 *   - two pieces sit back to back, the first at least firstM, the stop between them at most standS
 *     seconds, and the two together at least 1,000 m.
 * "Back to back" means the second starts on the very next length, so nothing but the one stop is
 * between them: a breaststroke length is a break, the same as everywhere else on /swim. Where in the
 * swim the pair sits is not checked. The plan says first thing in the swim; the swim that set rung 1
 * (2026-10-04) had it at lengths 21 to 60, and a gate stricter than the evidence it rests on would
 * refuse the evidence.
 *
 * Pure, so the test can hold it to the cases: src/lib/swim/ladder.test.ts. */

export const GOAL_M = 1000;

export interface LadderRung {
  firstM: number;
  /** Longest stop allowed between the two pieces, seconds. Null on the last rung: no stop at all. */
  standS: number | null;
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
  if (pieces.some((p) => p.metres >= GOAL_M)) return true;
  if (rung.standS == null) return false;
  const byStart = [...pieces].sort((a, b) => a.firstIndex - b.firstIndex);
  for (let i = 0; i + 1 < byStart.length; i++) {
    const a = byStart[i]!;
    const b = byStart[i + 1]!;
    if (b.firstIndex !== a.lastIndex + 1) continue;
    if (a.restAfterS == null || a.restAfterS > rung.standS) continue;
    if (a.metres >= rung.firstM && a.metres + b.metres >= GOAL_M) return true;
  }
  return false;
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
