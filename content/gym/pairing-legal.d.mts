/* TYPES FOR pairing-legal.mjs, so the TypeScript half of the site can call the same rule the build
 * gate runs without a second implementation.
 *
 * A HAND-WRITTEN .d.mts RATHER THAN CONVERTING THE MODULE TO TypeScript. `content/gym/validate.mjs`
 * is a plain Node script that runs with no build step, from `pnpm build`, from `verify.mjs` and from
 * a terminal, and the whole point of this module is that the validator and the app share it. Making
 * it .ts would put a compiler between the build gate and its own rule. `coverage.mts` solved the
 * same problem from the other side, by being TypeScript that node can run directly; that works there
 * because only tooling reads it. This one is read by the validator first.
 *
 * If the shapes here and the code there disagree, content/gym/validate.test.mjs catches it: it calls
 * the module through both callers and asserts they reach the same verdict. */

export interface PairingStation {
  name?: string;
  /** Two exercises may occupy this ONE fixture in a single rest window. Defaults to false. */
  sharedInOneWindow?: boolean;
  /** Fixtures within arm's reach. Must be MUTUAL to count. */
  adjacentTo?: string[];
}

export interface PairingSide {
  zone: string;
  station: string | null;
}

export type PairingRefusal =
  | { code: 'two-stations'; stations: string[] }
  | { code: 'adjacent-crosszone'; stations: string[] }
  | { code: 'station-not-shared'; station: string };

export type StationLookup = (zone: string, station: string | null) => PairingStation | undefined;

export function pairingRefusal(a: PairingSide, b: PairingSide, stationOf: StationLookup): PairingRefusal | null;
export function pairingLegal(a: PairingSide, b: PairingSide, stationOf: StationLookup): boolean;
