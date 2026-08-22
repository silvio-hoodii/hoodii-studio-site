import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from '../health/db';

/* WHAT LEVEL AM I, for a 35-year-old man in a 25 m pool.
 *
 * His ask: "there have to be reference or benchmarks on timings for specific levels. I want to know
 * on what level I am with my current timings." And, importantly: "you're probably only going to
 * find reference for elite and whatever and really high-performing athletes. We'll have to make up
 * our own tiers."
 *
 * He was right, so the honesty is structural rather than editorial. Every tier carries a
 * `provenance` and the page prints it. Three tiers are real published standards for men 35-39; two
 * are multiples of one of those that I chose; one is not a time at all. A reader can tell which is
 * which without being told to be careful.
 *
 * The personal bests come from Samsung's own best_records file, imported for the first time on
 * 2026-08-22. The distances are DERIVED, not labelled, and the import re-tests that derivation on
 * every run: pace per 100 m has to rise with distance. See SWIM_PB_TYPES in
 * HealthOS/server/import-watch-sessions.mjs. */

export type Provenance = 'sourced' | 'sourced-other-course' | 'constructed' | 'capability';

export interface SwimSource {
  id: string;
  label: string;
  url: string;
  note?: string;
}

export interface SwimTier {
  id: string;
  name: string;
  provenance: Provenance;
  sourceId?: string;
  what: string;
  times?: Record<string, string>;
  derivedFrom?: { tier: string; multiplier: number };
}

export interface SwimStandards {
  meta: { sex: string; ageGroup: string; course: string; courseNote: string; stroke: string; builtOn: string };
  sources: SwimSource[];
  tiers: SwimTier[];
  profileNote: string[];
}

export interface PbRow {
  distanceM: number;
  achievedOn: string;
  durationMs: number;
}

/** One distance, his best, and where it sits. */
export interface DistanceStanding {
  distanceM: number;
  best: PbRow | null;
  /** Every attempt Samsung kept, newest first. This is the phone app's "top times" list. */
  history: PbRow[];
  /** Tier id he currently meets, or null when he is short of the slowest timed tier. */
  tierId: string | null;
  /** The next timed tier up, and what it would take. */
  next: { tierId: string; name: string; timeMs: number; gapMs: number } | null;
  /** Points against the age-matched record. 1000 would equal that record. */
  pointsVsAgeRecord: number | null;
  pacePer100Ms: number | null;
}

const CONTENT = join(process.cwd(), 'content', 'gym');

/** "1:38.71" or "47.70" to milliseconds. */
export function parseTime(s: string): number {
  const parts = s.split(':');
  const secs = parts.length === 2 ? Number(parts[0]) * 60 + Number(parts[1]) : Number(parts[0]);
  return Math.round(secs * 1000);
}

/** Milliseconds to "47.70", "1:38.71" or "1:44:29".
 *
 *  Hundredths under an hour, because swimming is timed to hundredths and rounding to whole seconds
 *  would hide a personal best by a tenth. Whole seconds and an hours field above that: the 5 km
 *  rows rendered as "104:29.32" on the first build, which is correct and reads as 104 minutes to
 *  anyone who does not stop to think, on the one distance where nobody has a feel for the number. */
export function fmtTime(ms: number): string {
  const total = ms / 1000;
  if (total < 60) return total.toFixed(2);
  if (total < 3600) {
    const m = Math.floor(total / 60);
    return `${m}:${(total - m * 60).toFixed(2).padStart(5, '0')}`;
  }
  const h = Math.floor(total / 3600);
  const m = Math.floor((total - h * 3600) / 60);
  const s = Math.round(total - h * 3600 - m * 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export async function loadSwimStandards(): Promise<SwimStandards> {
  const raw = JSON.parse(await readFile(join(CONTENT, 'swim-standards.json'), 'utf8')) as SwimStandards & {
    $comment?: unknown;
  };
  const { $comment, ...rest } = raw;
  void $comment;
  return rest as SwimStandards;
}

/** A tier's time at a distance, resolving `derivedFrom` against the tier it multiplies. */
export function tierTimeMs(tier: SwimTier, distanceM: number, all: SwimTier[]): number | null {
  const key = String(distanceM);
  if (tier.times?.[key]) return parseTime(tier.times[key] as string);
  if (tier.derivedFrom) {
    const base = all.find((t) => t.id === tier.derivedFrom?.tier);
    if (!base) return null;
    const baseMs = tierTimeMs(base, distanceM, all);
    return baseMs == null ? null : Math.round(baseMs * tier.derivedFrom.multiplier);
  }
  return null;
}

export async function getSwimPbs(): Promise<PbRow[]> {
  const rows = await sql`
    select distance_m, achieved_on, duration_ms
    from health_swim_pb
    order by distance_m, duration_ms
  `;
  return (rows as unknown as { distance_m: number; achieved_on: string; duration_ms: number }[]).map((r) => ({
    distanceM: Number(r.distance_m),
    achievedOn: r.achieved_on,
    durationMs: Number(r.duration_ms),
  }));
}

export function standingFor(
  distanceM: number,
  pbs: PbRow[],
  standards: SwimStandards,
): DistanceStanding {
  const mine = pbs.filter((p) => p.distanceM === distanceM).sort((a, b) => a.durationMs - b.durationMs);
  const best = mine[0] ?? null;
  const history = [...mine].sort((a, b) => (a.achievedOn < b.achievedOn ? 1 : -1));

  /* Timed tiers only, fastest first. `capability` has no time by design and cannot be "met". */
  const timed = standards.tiers
    .map((t) => ({ tier: t, ms: tierTimeMs(t, distanceM, standards.tiers) }))
    .filter((x): x is { tier: SwimTier; ms: number } => x.ms != null)
    .sort((a, b) => a.ms - b.ms);

  let tierId: string | null = null;
  let next: DistanceStanding['next'] = null;
  if (best) {
    /* The hardest tier he has actually beaten. `timed` is ascending by time, so the first tier
       whose standard his time is under IS the fastest one he meets. */
    for (const { tier, ms } of timed) {
      if (best.durationMs <= ms) { tierId = tier.id; break; }
    }
    const harder = [...timed].reverse().find((x) => x.ms < best.durationMs);
    if (harder) {
      next = { tierId: harder.tier.id, name: harder.tier.name, timeMs: harder.ms, gapMs: best.durationMs - harder.ms };
    }
  }

  const record = standards.tiers.find((t) => t.id === 'world');
  const recordMs = record ? tierTimeMs(record, distanceM, standards.tiers) : null;

  return {
    distanceM,
    best,
    history,
    tierId,
    next,
    /* World Aquatics points, 1000 x (reference / time) cubed, against the AGE-MATCHED record rather
       than the open one. Scoring a 35-year-old against a 22-year-old world record answers a question
       nobody asked; scoring him against the best man his age is the comparison he actually made. */
    pointsVsAgeRecord: best && recordMs ? Math.round(1000 * (recordMs / best.durationMs) ** 3) : null,
    pacePer100Ms: best ? Math.round(best.durationMs / (distanceM / 100)) : null,
  };
}

/** The distances the tier table covers, in order. */
export function ratedDistances(standards: SwimStandards): number[] {
  const keys = new Set<number>();
  for (const t of standards.tiers) for (const k of Object.keys(t.times ?? {})) keys.add(Number(k));
  return [...keys].sort((a, b) => a - b);
}
