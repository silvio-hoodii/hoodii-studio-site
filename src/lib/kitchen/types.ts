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
