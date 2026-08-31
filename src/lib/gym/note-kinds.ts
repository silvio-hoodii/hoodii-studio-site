/**
 * WHAT A NOTE IS ABOUT, when he says. Three values, one definition, no server-only import so the
 * client, the route and the db layer all read the same list.
 *
 * DERIVED FROM HIS 37 NOTES, NOT DESIGNED. Grouping gym_note rows 2 to 38 by what they actually
 * are gives five clusters. Two of them already have a channel that works: form-and-feel (#4 "I'm
 * feeling a lot of tricep ... something on my form gets lost", #30, #35) and equipment reality
 * (#14 #15 #18 #19 #25 #26 #27) both arrive as prose in the end-of-session box, get read by
 * scripts/gym-notes.mjs, and end up written into equipment.json or a cue. Nothing about them is
 * improved by a category.
 *
 * These three are the ones where the absence of a category costs a NUMBER:
 *
 *   did       Eleven of the 37 rows record work the set table does not hold. #23 is two lifts with
 *             weight, reps and set count typed into a prose box; #33, #36 and #38 are the same
 *             shape. Nothing that counts a set can see any of it.
 *   skipped   #7 "Not enough time for lat pull down, my fault" and #37 "Didn't do ever head
 *             extension because at i said before taht pairing doesn't make sense". An exercise with
 *             no gym_set row is currently "he chose not to" and "nobody wrote it down" wearing the
 *             same face, and on 2026-08-30 that ambiguity produced a recommendation to delete an
 *             exercise with 16 performed sets across 8 dates.
 *   question  The largest cluster (#3 #6 #8 #9 #13 #17 #20 #22 #28 #29 #34). Every one of them is
 *             about a specific exercise and none of them says which, because the box that took it
 *             was at the bottom of the page. #6 is "Why is there db standing calf here": answering
 *             it needed the day, the block and a guess.
 *
 * NULL IS A VALUE AND IT MEANS HE DID NOT SAY. The end-of-session note box does not ask, per the
 * ruling recorded in src/app/gym/api/note/route.ts, and the 37 existing rows are not backfilled.
 *
 * The CHECK constraint in content/gym/schema.sql repeats this list deliberately: the route refuses a
 * bad request with a 400, and the constraint stops a writer added later from inventing a fourth
 * value. Change one and the other fails loudly rather than drifting quietly.
 */
export const NOTE_KINDS = ['did', 'skipped', 'question'] as const;

export type NoteKind = (typeof NOTE_KINDS)[number];

/** The label on the button, and the only place these words are written. Present tense and his
 *  register, not a field name: "Skipped it", never "Decline (prescribed)". */
export const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  did: 'Did it differently',
  skipped: 'Skipped it',
  question: 'Question about it',
};

/** Narrows an untrusted value. Returns null for absent AND for unrecognised, because the column is
 *  nullable and "he did not say" is the correct reading of both: a note must never be lost because
 *  a stale tab sent a kind this build does not know. */
export function asNoteKind(v: unknown): NoteKind | null {
  return typeof v === 'string' && (NOTE_KINDS as readonly string[]).includes(v) ? (v as NoteKind) : null;
}
