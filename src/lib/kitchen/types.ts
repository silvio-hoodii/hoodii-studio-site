export type Unit = string;

export interface Ingredient {
  ref: string;
  stock?: string;
  staple?: boolean;
  display: string;
  qty?: number;
  unit?: Unit;
  prep?: string;
  /** The dish does not exist without it. Missing means the dish is not offered, never adapted. */
  defining?: boolean;
  /** Frozen is the correct state for this dish, not a blocker. Frozen fruit in a smoothie. */
  frozenOk?: boolean;
  /** A garnish or nice-to-have. Never blocks and never downgrades the dish's status. */
  optional?: boolean;
  /** What the dish actually WANTS, when what is declared is a workable substitute.
   *
   *  The gap this fills, found 2026-08-09: the schema could say "you cannot make this" (`defining`)
   *  and "you can adapt" (`altText`), but had no way to say "you can make it and it will be worse".
   *  So piccata asked for "lemon juice", the bottle in the fridge satisfied it, and three Walmart
   *  trips later nothing had ever suggested buying a fresh lemon. Advisory only: it must never
   *  block, or every dish becomes a shopping list. */
  betterWith?: { display: string; stock?: string; why: string };
  altText?: string;
  section?: string;
}

export interface StepUse {
  ref: string;
  amount?: number;
  unit?: Unit;
  optional?: boolean;
}

export interface Heat {
  surface: string;
  /** What the pan should be DOING. Required on the stovetop, which is induction with
   *  inconsistent per-burner dial scales, so a position means nothing. */
  target?: string;
  recheck?: string;
  tempF?: number;
  tempC?: number;
}

export interface Step {
  n: number;
  text: string;
  uses?: (string | StepUse)[];
  equipment?: string[];
  minutes?: number;
  /** Short name for this step's countdown once it is pinned to the rail, where it sits next to
   *  timers from other recipes. "chicken, side 1" reads at a glance; "Pan Sauce: Chicken Piccata,
   *  step 9" does not. Optional: without it the rail falls back to the dish name and step number. */
  timerLabel?: string;
  heat?: Heat | null;
  doneness?: { kind?: string; test: string };
  look?: string;
  warn?: string;
}

export interface Recipe {
  id: string;
  name: string;
  build: string;
  form: 'dish' | 'technique' | 'method' | 'assembly' | 'macro';
  meal: string[];
  why?: string;
  source?: { name?: string; url?: string; why?: string };
  deviations?: { what: string; why: string }[];
  time: { activeMin?: number; totalMin?: number | null; note?: string | null };
  serves: {
    count: number | null;
    unit: string | null;
    proteinPerUnit: number | null;
    proteinMath?: string;
  };
  ingredients: Ingredient[];
  equipment: string[];
  steps: Step[];
  history?: string[];
  /** How much this recipe can be trusted, and why.
   *
   *  Added 2026-08-09 because he asked the question nobody had answered: "Where is this recipe
   *  coming from? Is this something that the agent came up with so I shouldn't trust it?" The
   *  answer for 28 of 29 was: an agent wrote it and nobody has cooked it. That has to be visible
   *  in the app, not buried in a JSON file. */
  provenance?: {
    tier: 'sourced' | 'adapted' | 'authored';
    /** Has anyone actually cooked these exact quantities and had it work. */
    cooked: boolean;
    statement: string;
    sources: { name?: string; url?: string | null; note?: string | null }[];
    /** The `build` at which every one of this recipe's steps was read AS THE APP RENDERS THEM.
     *
     *  Added 2026-08-09 after a recipe passed the validator, passed four screenshots, passed a
     *  grep, shipped, and had eleven defects in it, including a step with no heat setting and a
     *  step whose table and text disagreed. Every check this project owns reads the JSON, and
     *  every one of those eleven was invisible there and obvious on screen.
     *
     *  It is a build string rather than a date on purpose: change one word of a step and the stamp
     *  no longer matches, `validate.mjs` fails the build, and the recipe stops being offered until
     *  someone reads it again. "I checked it" has been promised and broken eight times in this
     *  project. This is the same claim as a fact git can check. */
    readAt?: string;
    /** What happened the last time it was actually cooked. `readAt` says the screens are legible;
     *  this says the instructions worked at a stove, and they are not the same claim.
     *
     *  Piccata proved that on 2026-08-09: it passed a six-source quantity check, passed a full
     *  rendered read, and then burnt the second batch because no step said what the heat should be
     *  once the pan was already hot. A dish that failed is not offered, whatever else it passes. */
    cookedResult?: 'worked' | 'failed';
  };
}

export type StockLevel = 'have' | 'low' | 'out' | 'none';
export type StockWhere = 'fridge' | 'freezer' | 'pantry' | string;

export interface StockItem {
  id: string;
  n: string;
  label?: string;
  where: StockWhere;
  level: StockLevel;
  by?: string | null;
  note?: string | null;
  made?: string;
  /** How much is left, and in what unit. `null` means genuinely unknown and MUST stay unknown:
   *  nobody weighs a bag of frozen onions, and the failure this replaces was a system that filled
   *  an unknown with the last number someone typed. An unknown amount is not a zero and it is not
   *  the previous amount. */
  qty: number | null;
  unit: string | null;
  /** The individual bags or packs, e.g. [350, 250]. Both the COUNT and the TOTAL are derived from
   *  this, which is the whole point: "2 bags" and "600 g" cannot disagree when they are two views
   *  of one array instead of two hand-typed numbers. */
  portions: number[] | null;
  /** Derived, never stored. Frozen is a location plus stock, not a third way of having something. */
  state: StockLevel | 'frozen';
  usableNow: boolean;
  since?: string;
  src: string;
  ageDays: number | null;
  daysLeft: number | null;
  conf: 'fresh' | 'modeled' | 'stale' | 'unknown';
}

export interface Stock {
  generatedAt: string;
  events: number;
  items: Record<string, StockItem>;
}

/** Why a dish is or is not on offer. */
export type Offer =
  | { status: 'ready'; missing: []; frozen: string[]; low: string[] }
  | { status: 'adapt'; missing: Ingredient[]; frozen: string[]; low: string[] }
  | { status: 'thaw'; missing: []; frozen: string[]; low: string[] }
  | { status: 'blocked'; missing: Ingredient[]; frozen: string[]; low: string[] };
