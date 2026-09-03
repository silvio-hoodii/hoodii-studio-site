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

/** "3 days ago", and "today" rather than "0 days ago". */
function agoText(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

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
          {actual.currentRun > 0 && actual.currentRunFrom
            ? `${shortDate(actual.currentRunFrom)} to ${shortDate(lastKnown?.date ?? actual.currentRunFrom)}.`
            : 'Last session was more than a day ago.'}{' '}
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
            Counted to {shortDate(lastKnown.date)}, the last day the watch mirror has reached. Nothing
            after that is known, and it is not being counted as rest.
          </div>
        )}
      </div>
    </div>
  );
}

/* THE CAVEAT THAT OUTRANKS THE RULE. Sleep and HRV are the only measurements that could turn this
 * arithmetic into an observation, and they are too sparse to do it: the watch is worn all day and
 * taken off at night.
 *
 * This is not a footnote. A page that counts sessions and then implies a recovery verdict is
 * inventing a measurement, and the cheapest fix in the whole project is him wearing the watch to
 * bed. So it says that, with the number of days, above the plan.
 *
 * THE WORD "DARK" WAS WRONG AND WAS CORRECTED 2026-09-03. This comment used to say the two feeds
 * "had both been dark for six nights", which was accurate on 2026-08-21 when the rule was built.
 * The 2026-08-26 export holds 24,864 sleep-stage rows and 1,451 HRV rows running to 2026-08-23, so
 * nothing is dark. What is true is that only two nights fall between 2026-08-15 and the 26th, which
 * is too sparse to trend and reaches the same conclusion by a different route. The rendered version
 * of this claim lived in conditioning.json's restRule.theHonestCaveat and was corrected there too;
 * its `$caveatChanged` carries the counts.
 *
 * DO NOT PUT A SLEEP DURATION ON THIS PAGE YET. Those tables have been parsed four ways and every
 * combination returned medians of 3.7 to 5.3 hours with bedtimes between 3 and 8 am, which
 * contradicts his own account. When a parse disagrees with the person who slept, the parse is the
 * suspect. Row counts and date ranges are safe to state; a duration is not, until one night he can
 * confirm from memory has been checked against what the tables say for that night. */
export function RecoveryNotice({ week }: { week: TrainingWeek }) {
  if (!week.recovery.dark) return null;
  const named = week.recovery.metrics.filter((m) => m.lastSeen);
  /* The two metrics almost always stop on the same night, because it is one watch coming off one
     wrist. Printing "hrv Aug 15, sleep Aug 15" made that read as two separate facts. */
  const dates = [...new Set(named.map((m) => m.lastSeen as string))];
  const sameNight = dates.length === 1 && named.length > 1;
  return (
    <div className="stale">
      <span className="k">This is load, not recovery</span>
      {!named.length ? (
        <>No sleep or heart-rate readings have reached this page at all.</>
      ) : sameNight ? (
        <>
          Sleep and heart-rate variability both stop on {shortDate(dates[0] as string)},{' '}
          {agoText(named[0]?.daysSince ?? 0)}. Sessions are still arriving daily, so the watch is on
          all day and off at night.
        </>
      ) : (
        <>
          The last reading was{' '}
          {named
            .map((m) => `${m.metric} on ${shortDate(m.lastSeen as string)}`)
            .join(', ')}
          .
        </>
      )}{' '}
      The count above is arithmetic on sessions. It cannot tell you whether you are recovered, and
      wearing the watch to bed is the only thing that would.
    </div>
  );
}

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
        Right-hand number is how many days in a row that day was. {week.rule.text} Lifting, runs,
        rides and swims all come from the watch, so sessions you never opened the app for still count.
      </div>
    </div>
  );
}
