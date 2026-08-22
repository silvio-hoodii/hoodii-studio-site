import Link from 'next/link';
import { loadConditioning, loadProgram } from '@/lib/gym/program';
import { getTrainingWeek, KIND_LABEL, SLOT_LABEL, type TrainingWeek } from '@/lib/gym/week';
import {
  loadSwimStandards, getSwimPbs, standingFor, ratedDistances, fmtTime, tierTimeMs,
  type SwimStandards, type DistanceStanding,
} from '@/lib/gym/swim-level';
import type { Cue } from '@/lib/gym/types';

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
  { id: 'swim', label: 'Swim' },
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

/** 2026-08-14 -> "Aug 14". The year is never in question on a 28-day window. */
function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
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

/* WHERE HE IS, AS A SWIMMER. Built 2026-08-22.
 *
 * His ask: "there have to be reference or benchmarks on timings for specific levels. I want to know
 * on what level I am with my current timings." And he called the honest problem before I hit it:
 * real standards exist only at the sharp end, so the lower tiers had to be built.
 *
 * So provenance is rendered, not hidden in a comment. Three of these tiers are published standards
 * for men aged 35 to 39 in a 25 m pool; two are multiples of one of them that I picked; one is not
 * a time at all. Showing which is which is what makes the sourced rows worth anything, and it is
 * the same reason the cue cards on this page print `confidence`. */
function SwimLevel({ standards, standings }: { standards: SwimStandards; standings: DistanceStanding[] }) {
  const withPb = standings.filter((s) => s.best);
  if (!withPb.length) return null;
  const tierName = (id: string | null) => standards.tiers.find((t) => t.id === id)?.name ?? null;
  /* The distance he is CLOSEST to levelling up in, proportionally. An absolute gap is misleading:
     18 s off at 100 m and 141 s off at 1500 m sound like the 100 is closer, and it is the furthest. */
  const closest = [...withPb]
    .filter((s) => s.next && s.best)
    .sort((a, b) => (a.next!.gapMs / a.best!.durationMs) - (b.next!.gapMs / b.best!.durationMs))[0];

  return (
    <>
      <div className="exgroup">
        <div className="exgroup-label">
          Where you are <span className="tag">(men {standards.meta.ageGroup}, {standards.meta.course} 25 m, freestyle)</span>
        </div>
        <div className="table-scroll">
          <table className="plan-table">
            <thead>
              <tr>
                <th>Distance</th>
                <th className="tnum">Your best</th>
                <th>Level</th>
                <th className="tnum">Next level</th>
              </tr>
            </thead>
            <tbody>
              {withPb.map((s) => (
                <tr key={s.distanceM}>
                  <td className="tnum">{s.distanceM} m</td>
                  <td className="tnum">
                    {fmtTime(s.best!.durationMs)}
                    <span className="quiet-inline"> {s.best!.achievedOn}</span>
                  </td>
                  <td>{tierName(s.tierId) ?? 'below the table'}</td>
                  <td className="tnum">
                    {s.next
                      ? <>{fmtTime(s.next.timeMs)} <span className="quiet-inline">for {s.next.name}</span></>
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {closest && (
          <p className="ex-cue" style={{ marginTop: 10 }}>
            The level you are closest to is <b>{closest.next!.name} at {closest.distanceM} m</b>:{' '}
            {(100 * closest.next!.gapMs / closest.best!.durationMs).toFixed(0)}% faster, which is{' '}
            {(closest.next!.gapMs / 1000 / (closest.distanceM / 100)).toFixed(1)} seconds per 100 m.
          </p>
        )}
      </div>

      <div className="exgroup">
        <div className="exgroup-label">What the levels are</div>
        <div className="tierlist">
          {standards.tiers.map((t) => {
            const src = standards.sources.find((x) => x.id === t.sourceId);
            const at100 = tierTimeMs(t, 100, standards.tiers);
            return (
              <div className="tier" key={t.id}>
                <div className="tier-head">
                  <span className="tier-name">{t.name}</span>
                  {/* "/100 m" read as a PACE. It is the tier's time FOR the 100, which is a different number
                      and the one place on this page a reader could quietly take away the wrong figure. */}
                  {at100 != null && <span className="tier-time tnum">{fmtTime(at100)} <span className="quiet-inline">at 100 m</span></span>}
                  <span className={`prov ${t.provenance}`}>
                    {t.provenance === 'sourced' ? 'sourced'
                      : t.provenance === 'sourced-other-course' ? 'sourced, other course'
                      : t.provenance === 'constructed' ? 'our number'
                      : 'not a time'}
                  </span>
                </div>
                <div className="ex-cue">{t.what}</div>
                {/* A real tap target. These were 15px tall on the first build, which is a third of
                    the 44px floor this repo enforces, on the one control that lets him check a
                    number I am asking him to trust. */}
                {src && (
                  <a className="tier-src" href={src.url} target="_blank" rel="noreferrer">
                    {src.label}
                  </a>
                )}
              </div>
            );
          })}
        </div>
        <p className="ex-cue" style={{ marginTop: 10 }}>
          Three of these are published standards for men your age. Two are multiples of the
          qualifying time that I chose, and they are labelled that way so you know which numbers to
          argue with.
        </p>
      </div>

      <div className="exgroup">
        <div className="exgroup-label">What the shape of it says</div>
        <Prose text={standards.profileNote} />
        <details className="src wk">
          <summary>Why there is no 25 m or 50 m here</summary>
          <div className="src-body">
            Samsung records no personal best under 100 m. Deriving one from single lengths does not
            survive the data: the fastest length ever recorded is 9.03 s, which is faster than a
            world-record 25 m split, and filtering the sensor miscounts moves the answer from
            14.42 s to 18.55 s depending on where the threshold goes. A number that swings four
            seconds on a threshold somebody picked is not a personal best. Swim a timed 25 and 50
            from a push and they become real.
          </div>
        </details>
      </div>
    </>
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

/** Prose fields arrive as a string or an array of lines, because JSON has no multi-line string and
 *  these paragraphs carry the reasoning the whole plan rests on. An empty entry is a blank line. */
function Prose({ text }: { text: string | string[] }) {
  const paras = (Array.isArray(text) ? text.join('\n') : text).split(/\n\s*\n|\n(?=\s*$)/);
  return (
    <>
      {paras
        .map((p) => p.replace(/\n/g, ' ').trim())
        .filter(Boolean)
        .map((p, i) => (
          <p className="lede" key={i}>
            {p}
          </p>
        ))}
    </>
  );
}

/* THE CUES. Added 2026-08-16: "also cues and techinique remember that ive never run or bike".
 *
 * The plan told him how hard and how long and never how, which is a gap when the athlete has never
 * done the sport. Each cue is a TEST WITH A BINARY RESULT, per the same house rule the kitchen runs
 * on: a doneness cue must be something he performs, never a sense he has to have.
 *
 * `confidence` is rendered, not hidden. "convention" means good coaching practice with no study
 * behind it, and saying so is the point: a plan that labels its guesses can be trusted about the
 * rest. The citation sits behind a tap because he needs the cue at the gym and the source only when
 * he doubts it. */
function Cues({ cues, note }: { cues: Cue[]; note?: string | null }) {
  if (!cues?.length) return null;
  return (
    <>
      <div className="exgroup-label" style={{ marginTop: 22 }}>
        How to actually do it <span className="tag">({cues.length})</span>
      </div>
      <p className="lede" style={{ marginBottom: 6 }}>
        Each one is a test you perform, not a feeling you have to have. Tap to open.
      </p>
      {/* COLLAPSED BY DEFAULT, and measured before and after rather than guessed. Rendering all
          seven open took the Run tab to 8,536 px, which is TALLER than the 6,287 px page he
          complained about in the first place. Fixing one wall of text by building a bigger one is
          not a fix. Collapsed, the seven names are a scannable checklist and each opens on its own,
          which is also how he would use them at the gym. */}
      <div className="cuelist">
        {cues.map((c) => (
          <details className="cue" key={c.name}>
            <summary>
              <span className="cue-name">{c.name}</span>
              <span className={`conf ${c.confidence}`}>{c.confidence}</span>
            </summary>
            <div className="cue-body">
              <div className="ex-cue">{c.cue}</div>
              <div className="ex-meta cue-test"><b>The test.</b> {c.test}</div>
              {c.why && <div className="ex-cue quiet">{c.why}</div>}
              {c.grounding && (
                <details className="src">
                  <summary>{c.confidence === 'convention' ? 'No study behind this' : 'Where this comes from'}</summary>
                  <div className="src-body">
                    {c.grounding}
                    {c.url && (
                      <>
                        {' '}
                        <a href={c.url} target="_blank" rel="noreferrer">open the source</a>
                      </>
                    )}
                  </div>
                </details>
              )}
            </div>
          </details>
        ))}
      </div>
      {note && (
        <details className="src">
          <summary>What was thrown out, and why</summary>
          <div className="src-body" style={{ whiteSpace: 'pre-line' }}>{note}</div>
        </details>
      )}
    </>
  );
}

export default async function ConditioningPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const sp = await searchParams;
  const tab: TabId = (TABS.find((t) => t.id === sp.p)?.id ?? 'week') as TabId;
  /* The week query only runs for the tab that shows it. The three plan tabs are static content and
     had no database dependency before today; giving them one so the overview could share a fetch
     would put a Neon round trip in front of a page he opens at the side of a pool. */
  const [c, program] = await Promise.all([loadConditioning(), loadProgram()]);
  const week = tab === 'week' ? await getTrainingWeek(program, c) : null;
  /* Same reasoning as the week query: only the swim tab pays for the personal-best read. */
  const swim = tab === 'swim' ? await (async () => {
    const [standards, pbs] = await Promise.all([loadSwimStandards(), getSwimPbs()]);
    return { standards, standings: ratedDistances(standards).map((d) => standingFor(d, pbs, standards)) };
  })() : null;

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

          <div className="exgroup">
            <div className="exgroup-label">What actually happened</div>
            <ActualDays week={week} />
          </div>

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
            <div className="exgroup-label">The three plans</div>
            <div className="exlist">
              <Link className="ex" href="/gym/conditioning?p=run">
                <div className="ex-name">{c.run.title} &rarr;</div>
                <div className="ex-meta">{c.run.surface} · {c.run.sessionsPerWeek}x a week · {c.run.weeks.length}-week build</div>
              </Link>
              <Link className="ex" href="/gym/conditioning?p=bike">
                <div className="ex-name">{c.bike.title} &rarr;</div>
                <div className="ex-meta">{c.bike.sessionsPerWeek}x a week · {c.bike.protocol.totalMinutes} min · {c.bike.protocol.name}</div>
              </Link>
              <Link className="ex" href="/gym/conditioning?p=swim">
                <div className="ex-name">{c.swim.title} &rarr;</div>
                <div className="ex-meta">{c.swim.sessionsPerWeek} · target {c.swim.theGoal.target}</div>
              </Link>
            </div>
          </div>
        </>
      )}

      {tab === 'run' && (
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
          <Cues cues={c.run.cues ?? []} note={c.run.cuesNote} />
        </div>
      )}

      {tab === 'bike' && (
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
          <Cues cues={c.bike.cues ?? []} note={c.bike.cuesNote} />
        </div>
      )}

      {tab === 'swim' && swim && <SwimLevel standards={swim.standards} standings={swim.standings} />}

      {tab === 'swim' && (
        <div className="exgroup">
          <div className="exgroup-label">
            {c.swim.title} <span className="tag">({c.swim.sessionsPerWeek})</span>
          </div>
          <div className="exlist">
            {/* WALKED, NOT NAMED. Until 2026-08-21 this block read three baseline fields by name and
                summarised them in one line, and two false claims lived in those slots for weeks:
                "600 m on 2026-06-27" (right distance, wrong date) and a best continuous effort of
                "around 3 minutes" when the lap data says 11:36. The data had to fit the sentence.
                Now each fact carries its own label and the page cannot outgrow what the laps say. */}
            <div className="ex">
              <div className="ex-name">Where you are</div>
              {c.swim.baseline
                .filter((f) => !f.secondary)
                .map((f) => (
                  <div className="ex-cue" key={f.label}>
                    <b>{f.label}.</b> {f.value}
                  </div>
                ))}
              {/* The backing numbers go behind a tap. Adding five labelled facts took this tab to
                  5,821px on a 390px screen, which is the seven-screen scroll the tabs were built to
                  kill. The data keeps every fact; the page shows the ones that change what he does. */}
              {c.swim.baseline.some((f) => f.secondary) && (
                <details className="src">
                  <summary>The rest of the numbers</summary>
                  <div className="src-body">
                    {c.swim.baseline
                      .filter((f) => f.secondary)
                      .map((f) => (
                        <p key={f.label}>
                          <b>{f.label}.</b> {f.value}
                        </p>
                      ))}
                  </div>
                </details>
              )}
            </div>
            <div className="ex">
              <div className="ex-name">{c.swim.theGoal.target}</div>
              <div className="ex-cue">{c.swim.theGoal.whatThatActuallyIs}</div>
              <div className="ex-cue">{c.swim.theGoal.whyItIsAchievable}</div>
            </div>
            <div className="ex">
              <div className="ex-name">The one change: go slower</div>
              <div className="ex-meta">{c.swim.theOneTechniqueChange.what}</div>
              <div className="ex-cue">{c.swim.theOneTechniqueChange.why}</div>
              <div className="ex-cue">{c.swim.theOneTechniqueChange.howToKnow}</div>
            </div>
          </div>

          <p className="lede">{c.swim.structure.note}</p>

          {/* THE CALIBRATION SWIM SITS ABOVE THE TABLE, because every row in the table is measured
              from the number it returns and the table is unreadable without it. It is not styled as
              a row of the ladder: it is a gate on the ladder. */}
          <div className="exlist">
            <div className="ex">
              <div className="ex-name">{c.swim.structure.calibration.name}</div>
              <div className="ex-meta">{c.swim.structure.calibration.what}</div>
              <div className="ex-meta cue-test">
                <b>The test.</b> {c.swim.structure.calibration.test}
              </div>
              {/* The reasoning is why he trusts it, and it is also 90 words he does not need at the
                  poolside. Same treatment the cues get. */}
              <details className="src">
                <summary>Why there is no number written here</summary>
                <div className="src-body">{c.swim.structure.calibration.why}</div>
              </details>
            </div>
          </div>

          <div className="table-scroll">
            <table className="plan-table">
              <thead>
                <tr>
                  <th className="tnum">Weeks</th>
                  <th className="wide">Continuity piece</th>
                  {/* NOT .tnum: the last two rows say "then easy swimming" and "the whole thing,
                      unbroken", and nowrap on prose forced the table to scroll sideways. */}
                  <th>Rest</th>
                </tr>
              </thead>
              <tbody>
                {c.swim.structure.ladder.map((s) => (
                  <tr key={s.weeks}>
                    <td className="tnum">{s.weeks}</td>
                    {/* NOT .nowrap any more. The rungs stopped being "2 x 400 m" on 2026-08-21 and
                        became sentences relative to his measured number, and nowrap on a sentence is
                        how you force a phone to scroll sideways. */}
                    <td>
                      {s.piece}
                      {s.note && <div className="quiet">{s.note}</div>}
                    </td>
                    <td>{s.rest}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="exlist">
            <div className="ex">
              <div className="ex-name">Paddles</div>
              <div className="ex-meta">{c.swim.paddleRule.rule}</div>
              <Prose text={c.swim.paddleRule.why} />
            </div>
            <div className="ex">
              <div className="ex-name">Pull buoy</div>
              <div className="ex-cue">{c.swim.pullBuoyRule}</div>
            </div>
            <div className="ex">
              <div className="ex-name">Drills</div>
              <div className="ex-cue">{c.swim.onDrills}</div>
            </div>
          </div>
          <Cues cues={c.swim.cues ?? []} note={c.swim.cuesNote} />
        </div>
      )}
    </div>
  );
}
