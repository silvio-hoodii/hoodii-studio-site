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
  export function scoreRecipe(lines: string[], availableIds: Set<string>): Score;
  export function extractRecipe(html: string): {
    name?: string;
    yield?: unknown;
    image?: string;
    totalTime?: string;
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
