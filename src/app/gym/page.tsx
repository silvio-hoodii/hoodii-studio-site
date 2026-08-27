import { loadProgram, loadWarmups, loadCooldowns, loadRirGuide } from '@/lib/gym/program';
import { computeNextUp } from '@/lib/gym/cycle';
import { getTrainingStreak } from '@/lib/gym/week';
import { getNotes } from '@/lib/gym/db';
import { today } from '@/lib/day';
import { shortDate } from '@/lib/format';
import GymClient from './GymClient';

export const dynamic = 'force-dynamic';

export default async function GymHome() {
  /* `streak` comes from week.ts rather than from computeNextUp, as of 2026-08-26. It used to be a
     field on nextUp counted off this app's own log, while a second, watch-based count of the same
     name sat one click away on the conditioning page. There is one now, and it sees both. */
  const [program, warmups, cooldowns, rirGuide, nextUp, streak, notes] = await Promise.all([
    loadProgram(),
    loadWarmups(),
    loadCooldowns(),
    loadRirGuide(),
    computeNextUp(today()),
    getTrainingStreak(),
    getNotes({ limit: 20 }),
  ]);
  const unacted = notes.filter((n) => !n.handled).length;

  return (
    <div className="wrap">
      <h1>Gym</h1>
      <p className="lede">
        Upper/lower split, logged between sets. Every main pattern twice a week since 2026-08-16,
        heavy on one day and light on the other. Swim, run and bike have their own pages now, in
        the row above.
      </p>
      <GymClient program={program} warmups={warmups} cooldowns={cooldowns} rirGuide={rirGuide} nextUp={nextUp} streak={streak} />

      {/* THE NOTE BOX HAD NO OTHER END. Notes have been written from the bottom of this page since
          2026-08-16, at his request, and `gym_note` was write-only from the web: the only thing
          that ever read one back was a CLI on the laptop. He could type into it and never see what
          he had typed, which is the shape of a box that stops being believed.

          COLLAPSED. This page is the tallest thing on the site at about ten phone screens, and it
          is the one he opens between sets. A closed summary costs one row.

          THE COUNT OF UNACTED NOTES IS IN THE SUMMARY, not hidden inside. Nine of them were sitting
          unanswered on 2026-08-27, two of which are direct questions about the programme, and
          nothing anywhere showed that. `handled` is set by an agent through scripts/gym-notes.mjs,
          so the number going down is a promise this system either keeps or visibly does not. */}
      {notes.length > 0 && (
        <details className="exgroup ladder-all">
          <summary className="exgroup-label">
            What you have written{' '}
            <span className="tag">
              ({notes.length}
              {unacted > 0 ? `, ${unacted} not acted on` : ', all acted on'})
            </span>
          </summary>
          <p className="ex-cue">
            Everything typed into the box at the end of a workout, newest first. A note marked
            &ldquo;acted on&rdquo; means someone changed something because of it.
          </p>
          {/* `note-row`, NOT `ex`. See training.css: `.ex` is what the probe harness selects to find
              today's exercises, and reusing it here made its cardNames() return 28 things on a
              10-exercise day. Every test still passed, which is what makes it worth a comment. */}
          <div className="notelist">
            {notes.map((n) => (
              <div className="note-row" key={n.id}>
                <div className="note-body">{n.body}</div>
                <div className="note-meta">
                  {shortDate(n.date)}
                  {n.day_title ? ` · ${n.day_title}` : ''}
                  {n.handled ? ' · acted on' : ''}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
