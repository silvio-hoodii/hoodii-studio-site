import Link from 'next/link';
import { loadConditioning, loadProgram } from '@/lib/gym/program';
import { getTrainingWeek, KIND_LABEL, SLOT_LABEL, type TrainingWeek } from '@/lib/gym/week';
import { getLastSession, type SessionKind } from '@/lib/gym/session';
import { redirect } from 'next/navigation';
import LastSession from '@/components/training/LastSession';
import Prose from '@/components/training/Prose';
import Cues from '@/components/training/Cues';
import { shortDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

/* ONE DISCIPLINE PER TAB. Rebuilt 2026-08-16.
 *
 * It was one page, 6,287 pixels tall, which is seven phone screens of unbroken scrolling behind a
 * single heading with no way to jump anywhere. His words: "right now is just walls of text i need
 * actual program separated either in pages or tabs or somethign i dont want to scroll infintely to
 * find buke or run".
 *
 * Tabs as plain links with a query param rather than client state, for the same reasons the kitchen
 * filters are: it works before hydration, it survives a reload at the side of a pool, and
 * /gym/conditioning?p=swim is a thing he can bookmark. The `.tab` styling is the one already used on
 * the workout page, including its 44px tap floor, so the two surfaces do not drift.
 *
 * NOTHING WAS CUT. The reasoning under each plan is why the plan is trusted, and he has never asked
 * for less of it, only for it to stop being in his way. Seven screens became four tabs of one or two.
 */

const TABS = [
  /* Label 'Overview', id still 'week', so every bookmark and every link keeps working. The page's
     own h1 became "The week" on 2026-08-21 when this tab stopped being a list of three conditioning
     plans and started being the whole week, lifting included. Two things both called "the week" on
     one screen is the redundancy that made the old blocks unreadable. */
  { id: 'week', label: 'Overview' },
  { id: 'run', label: 'Run' },
  { id: 'bike', label: 'Bike' },
  /* SWIM LEFT THIS PAGE on 2026-08-26 and is /swim, its own route, holding the tracker AND the
     coaching that used to be four sub-tabs in here. It is still training and it still counts toward
     the streak on the Overview tab: src/lib/gym/week.ts reads the watch mirror, not this list. What
     changed is where you go to read about it. A ?p=swim link redirects, see the page component. */
] as const;
type TabId = (typeof TABS)[number]['id'];

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
function RunStanding({ week }: { week: TrainingWeek }) {
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
 * arithmetic into an observation, and on the day the rule was built they had both been dark for six
 * nights while exercise data arrived daily: the watch is worn all day and taken off at night.
 *
 * This is not a footnote. A page that counts sessions and then implies a recovery verdict is
 * inventing a measurement, and the cheapest fix in the whole project is him wearing the watch to
 * bed. So it says that, with the number of days, above the plan. */
function RecoveryNotice({ week }: { week: TrainingWeek }) {
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
function PlanWeek({ week }: { week: TrainingWeek }) {
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
function ActualDays({ week }: { week: TrainingWeek }) {
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
        Right-hand number is how many days in a row that day was. {week.rule.text} Lifting and swims
        come from the watch, so sessions you never opened the app for still count.
      </div>
    </div>
  );
}



/* A SECOND LEVEL OF NAVIGATION, added 2026-08-22.
 *
 * The tabs fixed one wall in August and grew another: the swim tab reached 7.9 phone screens, and
 * he said it again, twice. "If I go to the stream section, it's like infinite scroll... right now if
 * I go to the water, I have to scroll a lot", and "everything else feels like it's just slop that
 * it's sitting there without any real reason."
 *
 * The content is not slop, but its ARRANGEMENT was: one page held what he is doing today, the plan
 * for the next ten weeks, and how to hold his hand in the water, with no way to ask for one without
 * the other two. Three different questions asked at three different moments, stacked vertically.
 *
 * So each discipline splits three ways, and the split is by WHEN YOU ASK:
 *   Now   what is true about me today. Changes on its own.
 *   Plan  what to do over the coming weeks. Changes when the programme changes.
 *   How   how to actually do it. Barely changes at all.
 *
 * Plain links with a query param, same as the tabs above them and for the same reasons: it works
 * before hydration, it survives a reload at the poolside, and every view is a URL he can bookmark.
 * Nothing is deleted, which matters: he has never asked for less content, only for it to stop being
 * in his way. */
const SUB_TABS: Record<string, { id: string; label: string }[]> = {
  run: [
    { id: 'now', label: 'Now' },
    { id: 'plan', label: 'Plan' },
    { id: 'how', label: 'How' },
  ],
  bike: [
    { id: 'now', label: 'Now' },
    { id: 'plan', label: 'Plan' },
    { id: 'how', label: 'How' },
  ],
};

function SubNav({ tab, sub }: { tab: string; sub: string }) {
  const items = SUB_TABS[tab];
  if (!items) return null;
  return (
    <div className="subtabs">
      {items.map((t) => (
        <Link
          key={t.id}
          href={`/gym/conditioning?p=${tab}&s=${t.id}`}
          className={`subtab${sub === t.id ? ' on' : ''}`}
          aria-current={sub === t.id ? 'page' : undefined}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}


export default async function ConditioningPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; s?: string }>;
}) {
  const sp = await searchParams;
  /* EVERY OLD SWIM BOOKMARK STILL LANDS SOMEWHERE. ?p=swim was a real URL for ten days and he was
     told to bookmark it at the poolside; the sub-tab carries across because /swim uses the same
     `?s=` parameter names. A redirect rather than a rendered "this moved" panel: he does not need
     to be told his bookmark is old, he needs the page. */
  if (sp.p === 'swim') redirect(sp.s ? `/swim?s=${sp.s}` : '/swim');
  const tab: TabId = (TABS.find((t) => t.id === sp.p)?.id ?? 'week') as TabId;
  /* Falls back to the FIRST sub-tab of whatever discipline this is, so a bare ?p=run link from
     anywhere still lands somewhere sensible rather than blank. */
  const subs = SUB_TABS[tab];
  const sub = subs?.find((x) => x.id === sp.s)?.id ?? subs?.[0]?.id ?? '';
  /* The week query only runs for the tab that shows it. The two plan tabs are static content and
     had no database dependency before today; giving them one so the overview could share a fetch
     would put a Neon round trip in front of a page he opens at the side of a treadmill. */
  const [c, program] = await Promise.all([loadConditioning(), loadProgram()]);
  const week = tab === 'week' ? await getTrainingWeek(program, c) : null;
  /* One session read, only for the discipline actually open, and only on its Now tab. */
  const KIND_FOR_TAB: Record<string, SessionKind> = { run: 'treadmill', bike: 'cycling', week: 'strength' };
  const lastSession = sub === 'now' || tab === 'week'
    ? await getLastSession(KIND_FOR_TAB[tab] ?? 'strength')
    : null;

  return (
    <div className="wrap">
      <h1>The week</h1>

      {/* Immediately under the title, because the whole complaint was having to scroll to reach a
          discipline. Nothing else comes before these. */}
      <div className="tabs">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === 'week' ? '/gym/conditioning' : `/gym/conditioning?p=${t.id}`}
            className={`tab${tab === t.id ? ' on' : ''}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <SubNav tab={tab} sub={sub} />

      {tab === 'week' && week && (
        <>
          <p className="lede">
            Lifting, swim, run and bike in one place, and how many days in a row you have trained.
          </p>

          <RunStanding week={week} />
          <RecoveryNotice week={week} />

          <div className="exgroup">
            <div className="exgroup-label">
              The plan <span className="tag">({week.plan.trainingDays} days, longest run {week.plan.longestRun})</span>
            </div>
            <PlanWeek week={week} />
            <p className="ex-cue" style={{ marginTop: 10 }}>
              Cardio sits on days that are already training days, so it adds work without adding a
              day. That is what leaves Wednesday and the weekend clear.
            </p>
          </div>

          <LastSession s={lastSession} />

          <div className="exgroup">
            <div className="exgroup-label">What actually happened</div>
            <ActualDays week={week} />
          </div>

          {/* WHY FOUR THINGS AND NOT ONE. He asked twice and it had never been answered anywhere he
              could see: "If this translates into the swimming, how does the running on the bike
              complement that?" The answer was already sourced in the evidence file and had simply
              never reached a page, which is the same reason he said the programme reads as
              arbitrary. Behind a tap because it is read once and then believed, not consulted. */}
          {c.week?.howItFits && (
            <details className="exgroup ladder-all">
              <summary className="exgroup-label">
                {c.week.howItFits.title} <span className="tag">({c.week.howItFits.points.length})</span>
              </summary>
              <p className="ex-cue">{c.week.howItFits.lead}</p>
              <div className="exlist">
                {c.week.howItFits.points.map((pt) => (
                  <div className="ex" key={pt.claim}>
                    <div className="ex-name">{pt.claim}</div>
                    <div className="ex-cue">{pt.detail}</div>
                    <div className="ex-cue quiet-inline">{pt.source}</div>
                  </div>
                ))}
              </div>
              <p className="ex-cue">{c.week.howItFits.sourceNote}</p>
            </details>
          )}

          <div className="exgroup">
            <div className="exgroup-label">The rest rule</div>
            <div className="exlist">
              {/* Both of these are sentences, so both are sans. `.ex-meta` is mono for set-and-rep
                  data and `.quiet` is mono too, and either one turns a paragraph into what looks
                  like machine output. */}
              <div className="ex">
                <div className="ex-name">{week.rule.text}</div>
                <div className="ex-cue">{c.week?.restRule?.whenItFires}</div>
                <div className="ex-cue">{c.week?.restRule?.theHonestCaveat}</div>
              </div>
            </div>
            {/* `.wk` lifts the tap target to 44px. Bare `.src` summaries are 32px on purpose across
                this site, which is fine for the tertiary "where this came from" citations under a
                cue, but this one is the main way to read why the rule has the shape it has. */}
            <details className="src wk">
              <summary>What counts as a training day, and why a rule instead of a fixed day off</summary>
              <div className="src-body">
                <Prose text={c.week?.restRule?.whatCountsAsTraining ?? ''} />
                <Prose text={c.week?.restRule?.whyThisShape ?? ''} />
              </div>
            </details>
          </div>

          <div className="exgroup">
            <div className="exgroup-label">When things happen</div>
            <div className="exlist">
              <div className="ex">
                <div className="ex-name">{c.slots.morning.name}</div>
                <div className="ex-cue">{c.slots.morning.what}</div>
              </div>
              <div className="ex">
                <div className="ex-name">{c.slots.evening.name}</div>
                <div className="ex-cue">{c.slots.evening.what}</div>
              </div>
              <div className="ex">
                <div className="ex-name">Pool times</div>
                <div className="ex-cue">
                  {Object.entries(c.slots.poolTimes)
                    .filter(([k]) => !k.startsWith('$'))
                    .map(([, v]) => v)
                    .join(' · ')}
                </div>
              </div>
            </div>
          </div>

          {/* One line each, then out. The detail is a tap away and does not belong here. */}
          <div className="exgroup">
            <div className="exgroup-label">The plans</div>
            <div className="exlist">
              <Link className="ex" href="/gym/conditioning?p=run">
                <div className="ex-name">{c.run.title} &rarr;</div>
                <div className="ex-meta">{c.run.surface} · {c.run.sessionsPerWeek}x a week · {c.run.weeks.length}-week build</div>
              </Link>
              <Link className="ex" href="/gym/conditioning?p=bike">
                <div className="ex-name">{c.bike.title} &rarr;</div>
                <div className="ex-meta">{c.bike.sessionsPerWeek}x a week · {c.bike.protocol.totalMinutes} min · {c.bike.protocol.name}</div>
              </Link>
              {/* OFF THIS PAGE, and that is the point of the row rather than a wart on it. Swim is
                  a route now, so the third plan is a link OUT of the gym rather than a fourth tab
                  along the top. The week above still counts his swims: this list is about where to
                  go to read a plan, not about what counts as training. */}
              <Link className="ex" href="/swim">
                <div className="ex-name">Swim &rarr;</div>
                <div className="ex-meta">its own page now, with the tier ladder and the coaching</div>
              </Link>
            </div>
          </div>
        </>
      )}

      {tab === 'run' && sub === 'now' && <LastSession s={lastSession} />}
      {tab === 'bike' && sub === 'now' && <LastSession s={lastSession} />}

      {tab === 'run' && sub === 'plan' && (
        <div className="exgroup">
          <div className="exgroup-label">
            {c.run.title} <span className="tag">({c.run.surface}, {c.run.sessionsPerWeek}x/week)</span>
          </div>
          <Prose text={c.run.why} />
          <div className="exlist">
            <div className="ex">
              <div className="ex-name">How hard</div>
              <div className="ex-cue">{c.run.howHard.primary}</div>
              <div className="ex-cue">{c.run.howHard.startingSpeed}</div>
              <div className="ex-cue">{c.run.howHard.secondary}</div>
            </div>
            {/* THE BELT, IN BOTH UNITS. Above the table on purpose: the two numbers he dials in are
                the first thing he needs standing at the treadmill, and the unit test is what stops
                the whole table being read wrong. */}
            <div className="ex">
              <div className="ex-name">The belt</div>
              <div className="ex-meta">
                Run at <b className="nowrap">{c.run.beltSettings.run}</b> Walk at{' '}
                <b className="nowrap">{c.run.beltSettings.walk}</b>
              </div>
              <div className="ex-cue">{c.run.beltSettings.theUnitTest}</div>
              <div className="ex-cue quiet">{c.run.beltSettings.whyBothUnits}</div>
            </div>
          </div>
          <Prose text={c.run.whyTheClockNotTheConsole} />
          <div className="table-scroll">
            <table className="plan-table">
              <thead>
                {/* THREE COLUMNS, not four. A fourth for the console reading was measured at 390px
                    on 2026-08-21 and crushed the session column so hard that week 1's note wrapped
                    one word per line. The console figure is a confirmation he reads AFTER the run,
                    so it belongs under the session as a quiet line, not in a column of its own. */}
                <tr>
                  <th className="tnum">Week</th>
                  {/* "On the clock" leads, because the clock IS the prescription now. */}
                  <th className="wide">On the clock</th>
                  <th className="tnum">Total</th>
                </tr>
              </thead>
              <tbody>
                {c.run.weeks.map((w) => (
                  <tr key={w.week}>
                    <td className="tnum">{w.week}</td>
                    <td>
                      {w.session}
                      <div className="quiet">
                        Console should read {w.consoleCheck}, {w.runKm} km of it running.
                      </div>
                      {w.note && <div className="quiet">{w.note}</div>}
                    </td>
                    <td className="tnum">{w.clockTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="rules">
            {c.run.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'bike' && sub === 'plan' && (
        <div className="exgroup">
          <div className="exgroup-label">
            {c.bike.title} <span className="tag">({c.bike.sessionsPerWeek}x/week, {c.bike.protocol.totalMinutes} min)</span>
          </div>
          <Prose text={c.bike.why} />
          <div className="exlist">
            <div className="ex">
              <div className="ex-name">{c.bike.protocol.name}</div>
              <div className="ex-meta">{c.bike.protocol.structure}</div>
              <div className="ex-cue">{c.bike.protocol.shortVersion}</div>
              <div className="ex-cue quiet">{c.bike.protocol.evidenceNote}</div>
            </div>
            <div className="ex">
              <div className="ex-name">How hard</div>
              <div className="ex-cue">{c.bike.howHard.hardPiece}</div>
              <div className="ex-cue">{c.bike.howHard.heartRate}</div>
              <div className="ex-cue">{c.bike.howHard.easyPiece}</div>
            </div>
          </div>
          <ul className="rules">
            {c.bike.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}


      {tab === 'run' && sub === 'how' && (
        <div className="exgroup">
          <div className="exgroup-label">How to run</div>
          <Cues cues={c.run.cues ?? []} note={c.run.cuesNote} />
        </div>
      )}

      {tab === 'bike' && sub === 'how' && (
        <div className="exgroup">
          <div className="exgroup-label">How to ride</div>
          <Cues cues={c.bike.cues ?? []} note={c.bike.cuesNote} />
        </div>
      )}

    </div>
  );
}
