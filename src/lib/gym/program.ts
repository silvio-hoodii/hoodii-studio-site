import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Program, WarmupItem, CooldownItem, Conditioning } from './types';

export * from './program-shared';

const CONTENT = join(process.cwd(), 'content', 'gym');

/* `$comment` is stripped on the way in, at every level.
 *
 * These files carry their provenance in a `$comment` array: which trial, which incident, what was
 * tried and rejected. program.json's is 60 lines and conditioning.json's is 50, and every one of
 * them was being serialised into the RSC payload and shipped to his phone on each load, because
 * /gym hands the whole program object to a client component. It reads harmlessly (the retractions
 * quote the old wording, so a grep of the live page still finds "75-85 min" inside a sentence
 * saying it was wrong) but it is developer text and it has no business on a mobile connection at
 * the gym. Recursive, because the nested `slots.$comment` in conditioning.json would otherwise
 * survive. */
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

export async function loadProgram(): Promise<Program> {
  return readJson<Program>('program.json');
}
export async function loadWarmups(): Promise<{ lower: WarmupItem[]; upper: WarmupItem[] }> {
  return readJson('warmups.json');
}
export async function loadCooldowns(): Promise<Record<string, CooldownItem>> {
  return readJson('cooldowns.json');
}
export async function loadConditioning(): Promise<Conditioning> {
  return readJson<Conditioning>('conditioning.json');
}

/* The two swim loaders left this file on 2026-08-26 and are src/lib/swim/content.ts, reading
 * content/swim/ rather than content/gym/. Swim became its own route; its content and its loaders
 * went with it. The stripComments function above is duplicated there rather than shared, which is a
 * deliberate small copy: it is eight lines with no state, and the alternative was a lib/shared
 * module existing solely to hold it. */
