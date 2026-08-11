import 'server-only';
import {
  getAccessToken, getRecentlyPlayed, getTopTracks, getTopArtists, TIME_RANGES,
} from './spotify';
import { insertPlays, replaceTop, recordSync, newestPlayedAtMs } from './db';

/* The accumulator.
 *
 * This runs on a schedule and its only job is to get plays into Postgres before Spotify's 50-item
 * window slides past them. Everything else here is secondary.
 *
 * Two things it must never do:
 *
 *   1. Swallow a failure. Every path writes a music_sync row, success or not, because a dead
 *      refresh token produces no error anyone would see otherwise. See spotify.ts.
 *   2. Skip the play fetch because the top-snapshot half failed. Tops are a nice-to-have that
 *      Spotify recomputes and can be re-read any time. Plays are perishable and unrecoverable.
 *      So plays go first and top failures are collected rather than thrown.
 */

export interface SyncResult {
  ok: boolean;
  playsFetched: number;
  playsAdded: number;
  topsAdded: number;
  warnings: string[];
  error?: string;
}

export async function syncMusic(): Promise<SyncResult> {
  const warnings: string[] = [];
  let playsFetched = 0;
  let playsAdded = 0;
  let topsAdded = 0;

  try {
    const token = await getAccessToken();

    /* Plays first, and deliberately WITHOUT the `after` cursor on a cold table.
     *
     * `after` makes a warm run cheaper, but the dedupe in insertPlays is what makes the result
     * correct, so the only thing `after` can do here is lose data if our newest row is somehow
     * ahead of Spotify's. Ask for the full 50 whenever we hold little enough that the extra rows
     * are free anyway. */
    const newest = await newestPlayedAtMs();
    const plays = await getRecentlyPlayed(token, newest);
    playsFetched = plays.length;
    playsAdded = await insertPlays(plays);

    /* If a WARM run comes back with a full 50 new plays, the window saturated between polls and
     * there were probably more we will never see. Worth saying out loud rather than succeeding
     * quietly.
     *
     * `newest === undefined` means the table was empty, so all 50 being new is just the initial
     * backfill and nothing was lost. The first version of this check omitted that condition and
     * duly fired on the very first run, which is the kind of alarm that teaches you to ignore
     * alarms. */
    if (newest !== undefined && playsAdded >= 50) {
      warnings.push(
        'this run added the full 50-item maximum, so listening outran the poll interval and some ' +
          'plays were almost certainly lost. Consider a fourth daily cron.',
      );
    }

    const capturedOn = new Date().toISOString().slice(0, 10);
    for (const range of TIME_RANGES) {
      try {
        const [tracks, artists] = await Promise.all([
          getTopTracks(token, range),
          getTopArtists(token, range),
        ]);
        topsAdded += await replaceTop(capturedOn, 'track', range, tracks);
        topsAdded += await replaceTop(capturedOn, 'artist', range, artists);
      } catch (err) {
        // Collected, not thrown: the plays above are already safe and that is what matters.
        warnings.push(`top snapshot for ${range} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await recordSync({ ok: true, playsAdded, topsAdded, error: warnings.join(' | ') || null });
    return { ok: true, playsFetched, playsAdded, topsAdded, warnings };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    /* Best-effort: if Postgres itself is what is broken, this write fails too and there is nothing
     * further to be done from in here. The thrown error still reaches the route's logs. */
    await recordSync({ ok: false, playsAdded, topsAdded, error }).catch(() => {});
    return { ok: false, playsFetched, playsAdded, topsAdded, warnings, error };
  }
}
