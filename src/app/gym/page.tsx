import { loadProgram, loadWarmups, loadCooldowns, loadExtraSuggestions } from '@/lib/gym/program';
import { computeNextUp } from '@/lib/gym/cycle';
import { getNotes, countNotes } from '@/lib/gym/db';
import { getGymLog, countGymLog } from '@/lib/gym/log';
import SessionLog from '@/components/training/SessionLog';
import { today } from '@/lib/day';
import { shortDate } from '@/lib/format';
import GymClient from './GymClient';

export const dynamic = 'force-dynamic';

export default async function GymHome() {
  /* `streak` comes from week.ts rather than from computeNextUp, as of 2026-08-26. It used to be a
     field on nextUp counted off this app's own log, while a second, watch-based count of the same
     name sat one click away on the conditioning page. There is one now, and it sees both. */
  const [program, warmups, cooldowns, extraSuggestions, nextUp, notes] = await Promise.all([
    loadProgram(),
    loadWarmups(),
    loadCooldowns(),
    loadExtraSuggestions(),
    computeNextUp(today()),
    getNotes({ limit: 20 }),
  ]);
  /* THE LAST FIVE SESSIONS, added 2026-08-27 on his ruling. `gym_session` had been written on every
     session since 2026-05-25 and displayed by nothing at all: he asked "where is the history of
     sessions in the app" and the honest answer was that the app had kept one for three months and
     never shown him a row.

     FIVE, and the count of the rest is on screen beside them. A cap that does not say it is a cap is
     finding 37 in the audit (the notes list silently holds 20). */
  const [logRows, logTotal, noteCount] = await Promise.all([getGymLog(5), countGymLog(), countNotes()]);
  /* COUNTED IN THE DATABASE, NOT IN THE ARRAY. `getNotes` caps at 20 and `notes.filter(...)` could
     only ever see what survived the cap, so an unhandled note older than the twentieth would vanish
     from the count with nothing on screen admitting it. Finding 37. */
  const unacted = noteCount.unhandled;

  return (
    <div className="wrap">
      <h1>Gym</h1>
      {/* NO BLURB UNDER THE TITLE, AND THAT IS A DECISION. Removed 2026-08-27 on his ruling, along
        * with three more paragraphs in GymClient. Do not restore it.
        *
        * It read: "Upper/lower split, logged between sets. Every main pattern twice a week since
        * 2026-08-16, heavy on one day and light on the other. Swim, run and bike have their own
        * pages now, in the row above." 93px and 193 characters at 390px, explaining a programme he
        * designed, to him, above the fold, on the page he opens between sets in a gym.
        *
        * His words: "the walls of text are all still there, the text after gym titel is useless".
        * Measured before cutting: 296px and 624 characters of prose sat between the title and the
        * first exercise. That is more than every per-exercise reason on the whole day put together.
        *
        * The hub row at src/app/page.tsx still carries the one-line version, which is where a
        * description of the app belongs: on the page that indexes it, for someone deciding whether
        * to open it. Not inside it. */}
      <GymClient program={program} warmups={warmups} cooldowns={cooldowns} extraSuggestions={extraSuggestions} nextUp={nextUp} />

      {/* THE LAST FIVE SESSIONS. Below the workout and above the note box, which is the order he
        * reads the page in: do the session, glance at what the last few looked like, then write a
        * note about today.
        *
        * A SERVER COMPONENT AND NOT PART OF GymClient, on purpose. GymClient is the client bundle
        * that runs the whole logging interaction, and history is read-only: putting it there would
        * ship five sessions of data into the bundle for no interactivity, and would put new markup
        * inside the component `scripts/probe-gym.js` drives.
        *
        * `SETS LOGGED OVER SETS PRESCRIBED` is the column that matters and the reason this exists.
        * On 2026-08-16 the watch recorded 68 minutes of lifting and this app logged ONE set. Nothing
        * displayed those two facts together, so for three months the only available reading was that
        * he had done one set. He had not. */}
      <SessionLog
        rows={logRows}
        total={logTotal}
        variant="log-gym"
        moreHref="/gym/log"
        moreLabel="the whole record"
        columns={[
          { head: 'Day', cell: (r) => (r.dayTitle ? (r.dayTitle.split(':')[0] ?? null) : (r.day ?? null)) },
          {
            head: 'Time',
            num: true,
            /* The watch, not the page timer. `finished_at - started_at` is how long the tab was
               open: one session reads 330 minutes and another 130 against the watch's 65. */
            cell: (r) => (r.watchMinutes != null ? `${r.watchMinutes}m` : null),
          },
          {
            head: 'Sets',
            num: true,
            cell: (r) =>
              r.setsPrescribed != null ? `${r.setsLogged}/${r.setsPrescribed}` : `${r.setsLogged}`,
          },
        ]}
        caption="Sets you ticked over sets the day asked for. Time is what the watch recorded, not how long the page was open."
      />

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
              ({noteCount.total}
              {unacted > 0 ? `, ${unacted} not acted on` : ', all acted on'}
              {noteCount.total > notes.length ? `, newest ${notes.length} shown` : ''})
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
