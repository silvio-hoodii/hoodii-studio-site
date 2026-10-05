import 'server-only';
import { getRotationState } from './db';
import { loadProgram } from './program';
import { ROTATION, ROTATION_SINCE } from './program-shared';
import type { DayKey } from './types';

function dateDiffDays(a: string, b: string): number {
  return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
}

/* NO `today` AND NO `lastDay`, 2026-09-27: nothing read either. The hub reads `lastDate` and
 * `daysSince`, /gym reads the rest. */
export interface NextUp {
  lastDate: string | null;
  daysSince: number | null;
  nextDay: DayKey;
  /* NO STREAK HERE, and that absence is the point. Removed 2026-08-26.
   *
   * This module used to return one, counted off the app's own log, and it was rendered on /gym and
   * on the hub while a SECOND, watch-based count was rendered on /gym/conditioning. Two numbers of
   * the same shape and name, computed from different evidence, shown as though interchangeable.
   *
   * There is now exactly one, `getTrainingStreak` in ./week.ts, and it counts a day the app logged
   * as well as a day the watch saw, so it is more complete than this one was. Do not reintroduce a
   * streak field here: the reason the old pair could disagree for weeks without anyone noticing is
   * that nothing structural stopped them existing side by side. */
  /** The day already recorded against today, if there is one.
   *
   * `nextDay` is the answer to "what should I train next", and the hub asks exactly that. It is the
   * wrong answer to "what am I looking at", because the moment the first set of a session lands,
   * the rotation advances past it: reloading /gym mid-workout opened the FOLLOWING day, with
   * different exercises and every box empty, and the session he was halfway through looked like it
   * had never happened. Reported as the app "behaving a little bit weird" on 2026-08-14 after a real
   * session. Two questions, two fields. */
  todayDay: DayKey | null;
  /** The last session was ended as CUT SHORT, so `nextDay` is a repeat rather than the next in the
   *  rotation. The page says so, because silently re-offering the same day reads as a bug. */
  cutShort: boolean;
  /** Lifting sessions the WATCH recorded after the last logged rotation session, on dates the app
   *  has nothing for and not on a weekday scheduled for a session outside the rotation (none today;
   *  see `excludedIsodow`). They do NOT move the rotation (since 2026-10-04, see computeNextUp). The
   *  page prints the count and the dates so he can see an unlogged lift and pick its tab by hand. */
  assumedFromWatch: number;
  assumedDates: string[];
}

const ISODOW: Record<string, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
};

/* WHICH WEEKDAYS A WATCH SESSION DOES NOT COUNT AS A ROTATION STEP, read off the programme.
 *
 * This was a literal `isodow <> 6` from 2026-09-04, when Saturday was Session C and C was not a
 * rotation step. C was retired on 2026-09-06 and the literal stayed, so a Saturday lift the watch
 * saw and the app did not was silently dropped from the rotation count. The rule it encoded is
 * "a weekday scheduled for a session outside the rotation", so that is what this derives: the
 * `scheduledOn` days of every programme day not in ROTATION. With A and B the whole programme,
 * the list is empty and no weekday is excluded. If a non-rotation session ever returns with a
 * scheduled day, the exclusion comes back with it and nobody has to remember to restore a literal. */
async function excludedIsodow(): Promise<number[]> {
  try {
    const program = await loadProgram();
    const out = new Set<number>();
    for (const [key, day] of Object.entries(program.days ?? {})) {
      if ((ROTATION as string[]).includes(key)) continue;
      for (const w of day?.scheduledOn ?? []) {
        const n = ISODOW[String(w).toLowerCase()];
        if (n) out.add(n);
      }
    }
    return [...out];
  } catch {
    /* A programme that will not load excludes nothing: counting a watch session is the smaller
       error than dropping one. */
    return [];
  }
}

/** Rolling "what's next": the session after the last one done, in ROTATION order. Four since
 * 2026-10-04 (Lower 1, Upper 1, Lower 2, Upper 2); A and B alternated before that.
 *
 * READS THE APP'S LOG AND THE WATCH, since 2026-09-03. Until then it read the app only, on the
 * argument that only the app knows WHICH session was performed. True, and it made the answer wrong
 * more often than right: between 2026-05-25 and 2026-08-25 the watch recorded 72 lifting sessions
 * and the app 37, so most weeks the rotation was computed over a minority of his training and
 * reset to Session A after any seven-day gap in LOGGING. His words on 2026-09-03: "I don't even
 * know if the session that I'm doing is the right one."
 *
 * With two rotation sessions the inference was honest: a lifting session the watch saw and the app
 * did not was one step of the rotation, whichever it was.
 *
 * WITH FOUR IT IS NOT, and since 2026-10-04 a watch-only lift no longer moves the rotation. The watch
 * knows he lifted, not WHICH session he did, so stepping once per watch lift silently skipped
 * sessions: one unlogged lift after Upper 2 sent him past Lower 1 to Upper 1, and the squat day was
 * gone without a word (coach review, 2026-10-04). The rotation now advances only on sessions logged
 * in the app. The watch dates are still returned and printed, and the tabs let him pick another
 * session in one tap.
 *
 * NO SESSION OUTSIDE THE ROTATION SINCE 2026-09-06, when Session C (Saturday) was folded into A and
 * B. See `excludedIsodow` below for what replaced the Saturday exclusion.
 *
 * THE LAYOFF RESET IS GONE with the four-session week. It sent him to Session A after seven days
 * without a LOGGED session, which is the bug above wearing a different name. Two rotation sessions
 * have no "start of the cycle" to reset to: after any gap the next session is simply the other one. */
export async function computeNextUp(today: string): Promise<NextUp> {
  /* ONE QUERY, since 2026-09-27. Was three in a row. The programme read is a local file. */
  const state = await getRotationState([...ROTATION], today, await excludedIsodow(), ROTATION_SINCE);
  const lastRow = state.last;

  let lastDate: string | null = null;
  let daysSince: number | null = null;
  let cutShort = false;
  let base = 0; // index into ROTATION of the session the rotation would offer from the app log alone

  if (lastRow?.date) {
    const lastDay = lastRow.day as DayKey | null;
    lastDate = lastRow.date;
    daysSince = dateDiffDays(today, lastDate);
    const idx = lastDay ? ROTATION.indexOf(lastDay) : -1;
    /* A DAY HE CUT SHORT IS NOT A DAY HE DID, so the rotation does not step past it.
     *
     * 2026-08-16, in the note box: "Didn't have that much time so can we just restart from here next
     * session whats the best approach". He had logged two sets of back squat out of a Lower A day
     * holding eight exercises, and because this is a rotation rather than a calendar, the next line
     * of code moved him to Upper A and Lower A was simply gone. Answering that in prose would have
     * been telling him to remember something; the fix is that there is nothing to remember. */
    cutShort = lastRow.status === 'cutshort';
    base = idx === -1 ? 0 : cutShort ? idx : (idx + 1) % ROTATION.length;
  }

  /* Watch sessions after the last logged rotation date, on dates the app has no session for, not on
     an excluded weekday. Today is excluded: a session in progress right now is `todayDay`'s
     business, and the watch export is manual so it never has today's data anyway. REPORTED, NOT
     COUNTED: they do not move the rotation (see the comment on computeNextUp). */
  const assumedDates = state.watchDates;
  const assumedFromWatch = assumedDates.length;

  const rotationNext: DayKey = ROTATION[base]!;
  /* NO SATURDAY SESSION SINCE 2026-09-06. Session C was folded into A and B on his word ("session c,
     whatever that is... fold"); the jumps and bounds are primers inside the two sessions now. The
     rotation is the whole schedule: whichever of A and B he did not do last. */
  const nextDay: DayKey = rotationNext;
  /* A day recorded today under a retired key (Session A or B) is not a tab on the page, so it is not
     today's session here: the page would open on a key the programme no longer has. */
  const todayDay = state.todayDay && (ROTATION as string[]).includes(state.todayDay) ? (state.todayDay as DayKey) : null;

  return { lastDate, daysSince, nextDay, todayDay, cutShort, assumedFromWatch, assumedDates };
}
