import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SwimPlan, SwimCoaching, SwimTeaching } from './types';

const CONTENT = join(process.cwd(), 'content', 'swim');

/* EVERY `$`-PREFIXED KEY is stripped on the way in, at every level.
 *
 * These files carry their provenance in a `$comment` array: which trial, which incident, what was
 * tried and rejected. plan.json's is 30 lines, and every one of them would otherwise be serialised
 * into the RSC payload and shipped to his phone on each load. It reads harmlessly (the retractions
 * quote the old wording, so a grep of the live page still finds the wrong figures inside a sentence
 * saying they were wrong) but it is developer text and it has no business on a mobile connection at
 * the side of a pool.
 *
 * Recursive, and the same function content/gym's loader uses, for the same reason: a nested
 * `structure.$comment` would otherwise survive the top-level strip.
 *
 * WIDENED FROM `$comment` TO EVERY `$` KEY ON 2026-09-03, and this file was the clearest case for
 * it. `plan.json` carries a 10,663-byte `$cuesArchive`, which is the agent changelog that used to
 * be rendered under the cues and was moved out of the note when he said it was a wall of text. It
 * stopped being DISPLAYED that day and never stopped being SENT: it was still in the payload on
 * every load, at the side of a pool, because the strip matched one key name and the convention had
 * moved on. Moving text out of a rendered field is only half a fix if the field it lands in still
 * ships. See the longer note in src/lib/gym/program.ts for the measurement. */
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

async function readJson<T>(file: string): Promise<T> {
  return stripComments(JSON.parse(await readFile(join(CONTENT, file), 'utf8')) as T);
}

export async function loadSwimPlan(): Promise<SwimPlan> {
  return readJson<SwimPlan>('plan.json');
}

export async function loadSwimCoaching(): Promise<SwimCoaching> {
  return readJson<SwimCoaching>('coaching.json');
}

export async function loadSwimTeaching(): Promise<SwimTeaching> {
  return readJson<SwimTeaching>('teaching.json');
}
