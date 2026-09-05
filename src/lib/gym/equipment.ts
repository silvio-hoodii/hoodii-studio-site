import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/* THE GYM AS A PLACE: zones, the fixtures in each, which fixtures two exercises can share in one
 * rest window, and which stand within arm's reach of each other.
 *
 * A LOADER RATHER THAN A STATIC IMPORT, unlike `ladder.ts` which imports the JSON directly. The
 * difference is what each needs: ladder.ts wants one array at module scope and is imported by the
 * progression engine, which runs everywhere; this returns the whole file to a server component that
 * is already reading program.json and movements.json through the same shape. Following the
 * neighbours in program.ts keeps `stripComments` applying, which matters here: equipment.json's
 * `$comment` is the header explaining the safe-defaults rule, and it has no business on his phone.
 */

export interface EquipmentStation {
  /** The fixture's name in HIS words, which is what a card prints. Never the key. */
  name: string;
  /** Two exercises may occupy this ONE fixture in a single rest window. Defaults to false and is
   *  declared per station WITH the reason, because a wrong "you can" costs a session and a wrong
   *  "you cannot" costs a walk. Today: the bench and the plyo box. */
  sharedInOneWindow?: boolean;
  /** Fixtures within arm's reach of this one. Case (c) of his 2026-05-23 pairing rule, and it must
   *  be MUTUAL: validate.mjs and `pairingLegal` in fill.ts both require each to name the other. */
  adjacentTo?: string[];
  open?: unknown[];
}

export interface EquipmentZone {
  name: string;
  /** Whether there is floor to lie on. False in the cable section and the machine bank. */
  floor?: boolean;
  stations?: Record<string, EquipmentStation>;
}

export interface Equipment {
  zones: Record<string, EquipmentZone>;
  portable?: Record<string, unknown>;
  absent?: unknown;
  unexplored?: unknown;
}

/* Duplicated from program.ts rather than exported from it, for the same reason the swim loaders
 * duplicate it: eight lines with no state, against a lib/shared module existing solely to hold it.
 * If a third copy appears, that is the moment to extract one. */
function stripComments<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripComments) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith('$')) continue;
      out[k] = stripComments(v);
    }
    return out as T;
  }
  return value;
}

export async function loadEquipment(): Promise<Equipment> {
  const raw = await readFile(join(process.cwd(), 'content', 'gym', 'equipment.json'), 'utf8');
  return stripComments(JSON.parse(raw) as Equipment);
}
