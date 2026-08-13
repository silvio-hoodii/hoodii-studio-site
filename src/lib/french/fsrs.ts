// FSRS-5 scheduler. Verbatim port of LanguageOS/server/fsrs.mjs, which was itself ported
// verbatim from the shelved Next.js build's lib/srs.ts and correct: the old system died of
// deployment bugs, not scheduling bugs. Do not change these weights or the formulas; if the
// scheduling ever needs to change, that is a deliberate decision made with real review data, not a
// drive-by edit here.
//
// One change from the original: a single desired-retention number instead of a per-deck table.
// Per-deck retention was tuning nobody had data to justify.

const W = [
  0.4072, 1.1829, 3.1262, 15.4722, // w0-w3: initial stability per rating
  7.2102,   // w4:  initial difficulty base
  0.5316,   // w5:  initial difficulty scaling / mean-reversion weight
  1.0651,   // w6:  difficulty linear step per rating unit
  0.0589,   // w7:  reserved
  1.723,    // w8:  recall stability growth factor
  0.1718,   // w9:  stability decay with stability
  1.018,    // w10: retrievability influence on growth
  2.0153,   // w11: lapse stability base
  0.0613,   // w12: difficulty effect on lapse stability
  0.3615,   // w13: prior stability effect on lapse
  2.2692,   // w14: retrievability effect on lapse
  0.2009,   // w15: hard penalty multiplier
  2.9898,   // w16: easy bonus multiplier
  0.51,     // w17: short-term (same-day) stability increase
  0.6093,   // w18: short-term offset
] as const;

export const DESIRED_RETENTION = 0.9;

// Rating: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 } as const;
export type RatingValue = (typeof Rating)[keyof typeof Rating];
// State:  0 = New, 1 = Learning, 2 = Review, 3 = Relearning
export const State = { New: 0, Learning: 1, Review: 2, Relearning: 3 } as const;

export interface SchedulableCard {
  stability: number;
  difficulty: number;
  state: number;
  reps: number;
  lapses: number;
  last_review_at: string | null;
}

export interface ScheduleResult {
  stability: number;
  difficulty: number;
  state: number;
  lapses: number;
  reps: number;
  last_review_at: string;
  next_review_at: string;
  last_rating: number;
  interval_days: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

const initStability = (rating: number) => Math.max(W[rating - 1] as number, 0.1);

const initDifficulty = (rating: number) =>
  clamp((W[4] as number) - Math.exp((W[5] as number) * (rating - 1)) + 1, 1, 10);

function nextDifficulty(d: number, rating: number) {
  const d0Easy = initDifficulty(Rating.Easy);
  const linearStep = d - (W[6] as number) * (rating - 3);
  return clamp((W[5] as number) * d0Easy + (1 - (W[5] as number)) * linearStep, 1, 10);
}

// Same-day re-review (elapsed < 1 day), e.g. a card seen again in the same session.
const shortTermStability = (s: number, rating: number) =>
  Math.max(s * Math.exp((W[17] as number) * (rating - 3 + (W[18] as number))), 0.1);

export function computeRetrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + elapsedDays / (9 * stability), -1);
}

function nextRecallStability(d: number, s: number, r: number, rating: number) {
  const hardPenalty = rating === Rating.Hard ? (W[15] as number) : 1;
  const easyBonus = rating === Rating.Easy ? (W[16] as number) : 1;
  return s * (
    Math.exp(W[8] as number) * (11 - d) *
    Math.pow(s, -(W[9] as number)) *
    (Math.exp((W[10] as number) * (1 - r)) - 1) *
    hardPenalty * easyBonus + 1
  );
}

const nextForgetStability = (d: number, s: number, r: number) => Math.max(
  (W[11] as number) * Math.pow(d, -(W[12] as number)) *
  (Math.pow(s + 1, W[13] as number) - 1) *
  Math.exp((W[14] as number) * (1 - r)),
  0.1,
);

const nextInterval = (stability: number) =>
  Math.max(1, Math.round(stability * 9 * (1 / DESIRED_RETENTION - 1)));

/** Schedule one review. */
export function schedule(card: SchedulableCard, rating: number, now: Date = new Date()): ScheduleResult {
  const last = card.last_review_at ? new Date(card.last_review_at) : now;
  const elapsedDays = Math.max(0, (now.getTime() - last.getTime()) / 86400000);

  let stability: number, difficulty: number, state: number;
  let lapses = card.lapses || 0;

  if (!card.state || card.state === State.New || !card.reps) {
    stability = initStability(rating);
    difficulty = initDifficulty(rating);
    state = rating === Rating.Again ? State.Learning : State.Review;
  } else {
    const r = computeRetrievability(elapsedDays, card.stability);
    difficulty = nextDifficulty(card.difficulty, rating);

    if (elapsedDays < 1) {
      // Same-day: nudge stability, never treat as a real interval test.
      stability = shortTermStability(card.stability, rating);
      state = card.state;
      if (rating === Rating.Again) { state = State.Relearning; lapses += 1; }
    } else if (rating === Rating.Again) {
      stability = nextForgetStability(difficulty, card.stability, r);
      state = State.Relearning;
      lapses += 1;
    } else {
      stability = nextRecallStability(difficulty, card.stability, r, rating);
      state = State.Review;
    }
  }

  // A lapsed card comes back tomorrow, not in a week.
  const intervalDays = rating === Rating.Again ? 1 : nextInterval(stability);
  const next = new Date(now.getTime() + intervalDays * 86400000);

  return {
    stability,
    difficulty,
    state,
    lapses,
    reps: (card.reps || 0) + 1,
    last_review_at: now.toISOString(),
    next_review_at: next.toISOString(),
    last_rating: rating,
    interval_days: intervalDays,
  };
}

/** What each button would do, for the interval previews on the rating row. */
export function previewIntervals(card: SchedulableCard, now: Date = new Date()): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, rating] of Object.entries(Rating)) {
    out[name.toLowerCase()] = schedule(card, rating, now).interval_days;
  }
  return out;
}

/** Human label for an interval preview: 1 -> "1d", 30 -> "1mo". */
export function humanInterval(days: number): string {
  if (days < 1) return '<1d';
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}
