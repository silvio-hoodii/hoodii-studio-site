/* Type surface for content/kitchen/match.mjs.
 *
 * The matcher is deliberately ONE implementation, in .mjs, because it has to run two ways: as a
 * zero-build CLI (`node content/kitchen/match.mjs <url>`) and inside the Next app. Porting it to TS
 * would break the CLI, and duplicating it would mean two copies of the alias logic drifting apart,
 * which is the exact class of bug this project keeps finding. So it stays .mjs and TS is told its
 * shape here.
 */
declare module '*/match.mjs' {
  export interface MatchHit {
    /** The published ingredient line, verbatim. */
    line: string;
    /** The parsed name that actually resolved. Named `shown` rather than `name` because up to four
     *  different parses of one line are tried, and this is the one that matched: rendering the raw
     *  line instead leaked scraped noise like "divided ($0.02)" onto the menu. */
    shown: string;
    item?: string;
    reason?: string;
    via?: string;
    note?: string;
  }
  export interface Score {
    have: MatchHit[];
    haveVia: MatchHit[];
    missing: MatchHit[];
    unknown: MatchHit[];
    staples: MatchHit[];
    optional: MatchHit[];
    counted: number;
    verdict: 'ready' | 'probably-ready' | 'unclear' | string;
  }
  export function parseIngredient(raw: string): string;
  export function isOptionalLine(raw: string): boolean;
  /** Every item id that could serve this line, not just the winner of the first-hit race. */
  export function matchAllItems(name: string, raw?: string): Set<string>;
  export function matchToItem(name: string, raw?: string): string | null;
  /** Live stock no published ingredient line can reach, so the page can say so out loud. */
  export function unreachableStock(
    items: { id: string; n?: string; level?: string }[],
  ): { id: string; n: string }[];
  export function scoreRecipe(lines: string[], availableIds: Set<string>): Score;
  /** Flatten schema.org `recipeInstructions` (string, string[], HowToStep[] or HowToSection[]). */
  export function flattenInstructions(v: unknown, depth?: number): string[];
  /** Strip a publisher's bullet or step number, leaving the sentence. */
  export function stripListMarker(line: string): string;
  /** Partition pasted recipe text. NEVER infers which lines are method: without a method heading,
   *  `instructions` is empty and `foundMethodHeading` is false, and the caller decides whether that
   *  is fatal. The importer refuses; the web paste box does not, because it renders no method. */
  export function splitPaste(raw: string): {
    name: string | null;
    ingredients: string[];
    instructions: string[];
    foundIngredientsHeading: boolean;
    foundMethodHeading: boolean;
  };
  export function extractRecipe(html: string): {
    name?: string;
    yield?: unknown;
    image?: string;
    totalTime?: string;
    prepTime?: string | null;
    cookTime?: string | null;
    /** The published method, flattened out of schema.org's four different shapes for it. Captured
     *  since 2026-08-17 because a cook card must quote it verbatim and, until then, the only route
     *  from the page to the card was an agent retyping it. */
    instructions: string[];
    /** The publisher's own nutrition panel, verbatim. Her protein figure is the only number on a
     *  card that is not an estimate. */
    nutrition?: Record<string, unknown> | null;
    /** recipeCuisine and recipeCategory from JSON-LD. Not captured on the first ingest, which is why
     *  2,215 of 2,626 dishes had no cuisine and the cuisine filter covered 13% of the corpus. */
    cuisine?: string | null;
    category?: string | null;
    keywords?: string[];
    ingredients: string[];
    rating?: number | null;
    ratingCount?: number | null;
  } | null;
}
