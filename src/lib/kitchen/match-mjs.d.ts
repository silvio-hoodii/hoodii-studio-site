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
    line: string;
    name: string;
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
  export function matchToItem(name: string, raw?: string): string | null;
  export function scoreRecipe(lines: string[], availableIds: Set<string>): Score;
  export function extractRecipe(html: string): {
    name?: string;
    yield?: unknown;
    image?: string;
    totalTime?: string;
    ingredients: string[];
    rating?: number | null;
    ratingCount?: number | null;
  } | null;
}
