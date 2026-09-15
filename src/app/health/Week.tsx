import { KIND_LABEL, SLOT_LABEL, type TrainingWeek } from '@/lib/gym/week';
import { shortDate } from '@/lib/format';

/* THE WEEK. Moved here from /gym/conditioning's Overview tab on 2026-08-27, unchanged.
 *
 * These four blocks were the whole reason that page existed, and they were three taps inside a
 * route named after the gym. They answer the one question all four disciplines share: did he train,
 * and is he due a day off. That is what makes /health the index rather than a sixth route holding
 * shared state, which is how the duplication this redesign removes got started in the first place.
 *
 * Co-located with the page that owns them rather than in src/components/training/, which is for
 * things TWO routes draw. Nothing else draws these. */

const DAY_SHORT: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};


/* WHERE HE STANDS, and it is the first thing on the page because it is the only thing here that
 * changes daily. Everything else is a plan and the plan does not move.
 *
 * The count comes from the WATCH, so it includes the sessions he never opened the app for. Counting
 * the app instead would have reported four training days in the block that was actually seven. */
export function RunStanding({ week }: { week: TrainingWeek }) {
  const { actual, rule } = week;
  const over = actual.overRule;
  const lastKnown = [...actual.days].reverse().find((d) => d.known);

  return (
    <div className={`standing${over ? ' over' : ''}`}>
      <div className="standing-n">
        <span className="tnum big">{actual.currentRun}</span>
        <span className="standing-unit">
          {actual.currentRun === 1 ? 'day in a row' : 'days in a row'}
        </span>
      </div>
      <div className="standing-body">
        <div className="standing-rule">
          {rule.text}{' '}
          {over
            ? 'You are past it.'
            : actual.currentRun >= rule.maxConsecutive
              ? 'Tomorrow should be off.'
              : actual.currentRun === 0
                ? 'You are rested.'
                : `${rule.maxConsecutive - actual.currentRun} more before a day off.`}
        </div>
        <div className="ex-meta">
          {actual.currentRun > 1 && actual.currentRunFrom
            ? `${shortDate(actual.currentRunFrom)} to ${shortDate(lastKnown?.date ?? actual.currentRunFrom)}. `
            : actual.currentRun === 0 ? 'Last session was more than a day ago. ' : ''}
          {actual.longestRun > actual.currentRun && actual.longestRunFrom && actual.longestRunTo && (
            <>
              Longest in the last four weeks was {actual.longestRun}, {shortDate(actual.longestRunFrom)}{' '}
              to {shortDate(actual.longestRunTo)}.
            </>
          )}
        </div>
        {/* The horizon, said out loud. A day the mirror has not reached is not a rest day, and the
            count above stops at the last day anything is known about rather than at today. Without
            this line a stalled sync reads as a rest he did not take, which is the one direction an
            error here must never go. */}
        {lastKnown && lastKnown.date !== week.actual.days.at(-1)?.date && (
          <div className="ex-cue">
            {/* NOT "the last day the watch mirror has reached", which was false on 2026-09-09: the
                watch stopped at Sep 7 and this line said Sep 8, because `lastKnown` is the last day
                either source knows about and Sep 8 came from gym_set. Naming one source for a
                two-source horizon is how the count and the sentence drift apart. */}
            Counted to {shortDate(lastKnown.date)}.
          </div>
        )}
      </div>
    </div>
  );
}

/* RecoveryNotice, the "This is load, not recovery" box, was here until 2026-09-15. It fired on every
 * visit because he does not wear the watch to sleep, a question he settled on 2026-09-03, so it told
 * him something he already knew every time he opened the Now tab. The sleep-parsing warnings it
 * carried (medians of 3.7 to 5.3 hours that contradict his own account) are in git history. */

/* THE PLAN, as a week. Lifting titles come from program.json and the slots from conditioning.json,
 * so nothing here is a second copy of either. A day with no work on it is drawn as such rather than
 * omitted, because the gaps are the point of the whole arrangement. */
export function PlanWeek({ week }: { week: TrainingWeek }) {
  return (
    <div className="planweek">
      {week.plan.days.map((d) => (
        <div key={d.weekday} className={`pw-day${d.training ? '' : ' off'}`}>
          <div className="pw-name">{DAY_SHORT[d.weekday]}</div>
          {d.training ? (
            <div className="pw-work">
              {d.liftTitle && <div className="pw-lift">{d.liftTitle}</div>}
              {d.slots.map((s) => (
                <div key={s} className="pw-slot">
                  {SLOT_LABEL[s] ?? s}
                </div>
              ))}
            </div>
          ) : (
            <div className="pw-work">
              <div className="pw-rest">off</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* WHAT ACTUALLY HAPPENED. Fourteen days, newest last, so it reads in the direction the week runs.
 * Every session the watch saw, named and summed, with the run length beside it. A day past the rule
 * carries a marker; a day the mirror has not reached says so instead of showing an empty row that
 * would read as rest. */
export function ActualDays({ week }: { week: TrainingWeek }) {
  const days = week.actual.days.slice(-14);
  return (
    <div className="actual">
      {days.map((d) => {
        const kinds = d.sessions
          .map((s) => `${KIND_LABEL[s.kind] ?? s.kind} ${s.minutes}m`)
          .join(', ');
        return (
          <div
            key={d.date}
            className={`ad-row${d.trained ? ' on' : ''}${d.overRule ? ' over' : ''}${!d.known ? ' unknown' : ''}`}
          >
            <div className="ad-day">
              {DAY_SHORT[d.weekday]} <span className="ad-date">{shortDate(d.date)}</span>
            </div>
            <div className="ad-what">
              {!d.known ? (
                <span className="quiet">no data yet</span>
              ) : d.trained ? (
                kinds
              ) : (
                <span className="quiet">rest</span>
              )}
            </div>
            <div className="ad-run tnum">
              {d.trained ? d.runLength : ''}
              {d.overRule && <span className="ad-flag" aria-label="past the rule">!</span>}
            </div>
          </div>
        );
      })}
      {/* `ex-cue`, not `ex-meta`. Measured on the live page rather than guessed: `.ex-meta` is
          IBM Plex Mono at 12px, which is right for "3 x 8, rest 2 min" and wrong for a sentence.
          Same type split the kitchen settled on 2026-08-15: data stays mono, prose goes sans. */}
      <div className="ad-legend ex-cue">
        Right-hand number: days in a row.
      </div>
    </div>
  );
}
