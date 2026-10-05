/* SETS PROGRESSION SKIPS, AND HIS LOG KEEPS. Added 2026-10-04.
 *
 * Two sessions of barbell RDL were typed at 60 to 68 lb (2026-09-28, 2026-10-01) against a working
 * weight of 175, and the card then suggested 68 and 65 for a lift he had moved at 165 to 225 for six
 * weeks. The numbers in gym_set are his record and stay exactly as typed; the question is only whether
 * the suggestion engine may build on them. `content/gym/excluded-sets.json` names the row ids it may
 * not, each with its reason, and `getExerciseHistories` in db.ts leaves them out of the one read behind
 * the suggestion, the stall detector and the trend line. Deleting a line from that file puts the row
 * back. Same move as HealthOS/disowned-sessions.json: skip on the way in, never edit the source.
 *
 * FAIL-LOUD. A malformed file throws at import, so /gym/api/plan returns its 500 rather than quietly
 * excluding nothing (or the wrong rows) and printing a confident weight. */

export interface ExcludedSet {
  id: number;
  exerciseId: string;
  date: string;
  weight: number | null;
  reps: number | null;
  why: string;
}

/** The ids progression must skip, after checking every row of the file. Throws on any bad row. */
export function excludedSetIds(file: unknown): number[] {
  const sets = (file as { sets?: unknown })?.sets;
  if (!Array.isArray(sets)) throw new Error('excluded-sets.json: "sets" must be an array');
  const seen = new Set<number>();
  sets.forEach((raw, i) => {
    const s = raw as Partial<ExcludedSet>;
    const at = `excluded-sets.json sets[${i}]`;
    if (!Number.isSafeInteger(s.id) || (s.id as number) <= 0) throw new Error(`${at}: "id" must be a gym_set id, got ${JSON.stringify(s.id)}`);
    if (seen.has(s.id as number)) throw new Error(`${at}: id ${s.id} is listed twice`);
    seen.add(s.id as number);
    if (typeof s.exerciseId !== 'string' || !s.exerciseId) throw new Error(`${at}: "exerciseId" is required`);
    if (typeof s.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) throw new Error(`${at}: "date" must be YYYY-MM-DD`);
    if (typeof s.why !== 'string' || s.why.trim().length < 20) throw new Error(`${at}: "why" must say why, at least 20 characters`);
  });
  return [...seen];
}
