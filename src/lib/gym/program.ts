import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Program, WarmupItem, CooldownItem, Conditioning } from './types';
import type { MovementCatalogue } from './coverage.mjs';

export * from './program-shared';

const CONTENT = join(process.cwd(), 'content', 'gym');

/* EVERY `$`-PREFIXED KEY is stripped on the way in, at every level.
 *
 * These files carry their provenance in a `$comment` array: which trial, which incident, what was
 * tried and rejected. program.json's is 60 lines and conditioning.json's is 50, and every one of
 * them was being serialised into the RSC payload and shipped to his phone on each load, because
 * /gym hands the whole program object to a client component. It reads harmlessly (the retractions
 * quote the old wording, so a grep of the live page still finds "75-85 min" inside a sentence
 * saying it was wrong) but it is developer text and it has no business on a mobile connection at
 * the gym. Recursive, because the nested `slots.$comment` in conditioning.json would otherwise
 * survive.
 *
 * IT MATCHED ONE KEY NAME UNTIL 2026-09-03, AND THE CONVENTION HAD ALREADY OUTGROWN IT. `$` means
 * "agents only" everywhere in this repo, and six more such fields had appeared since this was
 * written: `$qChanged`, `$cueChanged`, `$caveatChanged`, `$keysRenamed`, `$tricepsNote`, `$schema`.
 * Measured across the four gym content files on the day this changed: 30,538 bytes stripped and
 * **10,995 still shipping**, none of it read by any renderer. Verified before widening the rule,
 * by grepping every `.$name` and `['$name']` access under src/: there are none.
 *
 * SO THE RULE NOW MATCHES THE CONVENTION RATHER THAN A LIST. Same shape as the placement gate a few
 * hundred lines into validate.mjs: a habit that has to be re-applied by hand at each new field is
 * decoration, and this one had silently stopped covering most of its own subject. Adding an archive
 * field to a content file is now free at the phone, which is what makes moving an agent changelog
 * out of a rendered note the obvious move rather than a trade. */
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


/** The movement catalogue: one entry per job, every way to do it in his gym, and which muscles each
 *  way trains. `/health?s=volume` counts weekly sets off it, using the same computation the terminal
 *  gate runs. See src/lib/gym/coverage.mts for why that computation lives outside both callers. */
export async function loadMovements(): Promise<MovementCatalogue> {
  return readJson<MovementCatalogue>('movements.json');
}

/** Every exercise name the gym can do, for the off-plan capture box's autocomplete. Read from the
 *  movement catalogue rather than typed, so a variant added there shows up here with no second
 *  edit. Sorted, deduplicated, and it is a HINT: the box accepts anything he types. */
export async function loadExtraSuggestions(): Promise<string[]> {
  const cat = await readJson<{ movements: Record<string, { variants: { name: string }[] }> }>('movements.json');
  const names = new Set<string>();
  for (const m of Object.values(cat.movements)) for (const v of m.variants) names.add(v.name);
  return [...names].sort((a, b) => a.localeCompare(b));
}
