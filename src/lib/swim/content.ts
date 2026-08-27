import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SwimPlan, SwimCoaching, SwimTeaching } from './types';

const CONTENT = join(process.cwd(), 'content', 'swim');

/* `$comment` is stripped on the way in, at every level.
 *
 * These files carry their provenance in a `$comment` array: which trial, which incident, what was
 * tried and rejected. plan.json's is 30 lines, and every one of them would otherwise be serialised
 * into the RSC payload and shipped to his phone on each load. It reads harmlessly (the retractions
 * quote the old wording, so a grep of the live page still finds the wrong figures inside a sentence
 * saying they were wrong) but it is developer text and it has no business on a mobile connection at
 * the side of a pool.
 *
 * Recursive, and the same function content/gym's loader uses, for the same reason: a nested
 * `structure.$comment` would otherwise survive the top-level strip. */
function stripComments<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripComments) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === '$comment') continue;
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
