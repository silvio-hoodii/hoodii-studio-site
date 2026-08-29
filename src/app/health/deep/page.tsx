import Link from 'next/link';
import type { Metadata } from 'next';
import { getYearReview, type YearBody, type YearTraining, type YearStrength, type Pb } from '@/lib/health/year';
import { LineChart } from '../HealthCharts';
import { KIND_LABEL } from '@/lib/gym/week';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'The year so far',
  description: 'Every body and training number for this year, peak weight to today, derived rather than typed.',
  alternates: { canonical: '/health/deep' },
  robots: { index: false, follow: false },
};

/* THE YEAR, IN ONE PAGE. Built 2026-08-28, on his ask: "the main number that I want to see is the
 * difference between the highest weight that I've had this year and the lowest ... I want a big
 * number ... Let's analyze all the other metrics and how the progress has been in just this past
 * year."
 *
 * A ROUTE AND NOT A FIFTH SUB-TAB, the same call /swim/deep made and for the same measured reason:
 * `.subtabs` is a flex row with no wrap and no scroll, /swim's five chips already reach 337px of a
 * 390px screen, and a fifth chip here would be a measurement nobody had taken. The other argument is
 * about what the page is FOR. The four /health tabs are read between sets and at the poolside; this
 * one is a year of arithmetic and is read on the sofa. The headline number lives on the Weight tab
 * where he will meet it, and links here.
 *
 * NOTHING BELOW IS TYPED. Every figure comes out of src/lib/health/year.ts, including the figures
 * about the data's own limits, and the year itself is derived from today's date. That is not
 * tidiness. /swim/deep shipped a sentence its own table disproved and typecheck, lint, build and a
 * full rendered-text dump all passed with it in place; the only reason it was catchable at all was
 * that every number on it was returned rather than written.
 *
 * THE ORDER IS WHAT HE ASKED FOR FIRST. The weight range is the headline because he named it. Then
 * where those kilos came off, then everything else the scale records, then attendance, then the
 * weights on the bar, then the swim. The limits go last and in full, because a page this confident
 * about a year has to say where the year's record actually starts. */

/** "13 Feb 2026". With the year, unlike `shortDate` in lib/format, for the same reason /swim/deep
 *  spells it out: this page reaches back eleven months and "13 Feb" beside "24 Aug" reads as one
 *  season. Noon UTC so a date-only string cannot land on the previous day. */
function when(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function monthLabel(ym: string): string {
  return new Date(`${ym}-01T12:00:00Z`).toLocaleDateString('en-CA', {
    month: 'short',
    timeZone: 'UTC',
  });
}

const signed = (n: number, decimals = 1) => `${n > 0 ? '+' : ''}${n.toFixed(decimals)}`;

/** Milliseconds to "1:38.71". Hundredths kept, unlike the pace helpers elsewhere: a personal best is
 *  a stopwatch reading and the watch awards it to the hundredth, so rounding it away would make two
 *  bests that differ look identical. */
function stopwatch(ms: number): string {
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return m > 0 ? `${m}:${s.toFixed(2).padStart(5, '0')}` : `${s.toFixed(2)}s`;
}

/** Minutes to "209 h", "30 h 50" or "40 min". Hours, because 12,540 minutes is not a quantity anyone
 *  can feel. The two special cases are not tidiness: the first draft printed the single 40-minute
 *  run of the year as "0 h 40" and the yearly total as "209 h 00", and both were caught by reading
 *  the rendered page rather than the function. */
function hours(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------------------------------------
 * THE HEADLINE. The one number he asked for, and the only thing on this site set at this size.
 * ---------------------------------------------------------------------------------------------- */
function Headline({ body }: { body: YearBody }) {
  return (
    <div className="yearline">
      <div className="yearline-n tnum">{signed(body.deltaKg)}<span className="yearline-u">kg</span></div>
      <div className="yearline-body">
        <div className="yearline-rule">
          Highest to lowest weight recorded in {body.year}.
        </div>
        <p className="ex-cue">
          <span className="tnum">{body.peak.kg.toFixed(1)} kg</span> on {when(body.peak.date)}, the
          heaviest reading of the year, down to{' '}
          <span className="tnum">{body.low.kg.toFixed(1)} kg</span> on {when(body.low.date)}.
          That is <span className="tnum">{body.spanDays}</span> days and{' '}
          <span className="tnum">{signed(body.kgPerWeek, 2)} kg</span> a week.
          {body.lowIsLatest
            ? ' The lowest reading is also the most recent one, so this is where you are now.'
            : ` The most recent reading is ${body.latest.kg.toFixed(1)} kg on ${when(body.latest.date)}, so the low is behind you rather than current.`}
        </p>
        {/* SAID ONLY WHEN IT IS TRUE, and it is false today. The two instruments disagree about
            weight by at most 0.05 kg (derived in year.ts, printed under the split below), which is
            nothing against a change this size, so crossing them here is fine and the fat/lean split
            two blocks down still refuses to. Stating that difference is what stops the split's
            same-instrument rule reading as an inconsistency. */}
        {body.peakLowMixedSource && (
          <p className="ex-cue">
            Those two readings came off different machines, the{' '}
            {body.peak.source.toLowerCase()} and the {body.low.source.toLowerCase()}. For weight that
            is safe: across the {body.instrument.days} days carrying both, the two never disagreed by
            more than <span className="tnum">{body.instrument.worstKg?.toFixed(2)} kg</span>. For fat
            and lean it is not, which is why the split below uses one machine at both ends.
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * WHERE IT CAME OFF
 * ---------------------------------------------------------------------------------------------- */
function TheLine({ body }: { body: YearBody }) {
  if (body.weightSeries.length < 2) return null;
  return (
    <div className="section">
      <div className="section-head"><h2>The line it took</h2></div>
      <div className="pair">
        <figure className="chartfig">
          <figcaption className="chart-cap">
            Weight, kg, {when(body.recordStarts)} to {when(body.latest.date)}
          </figcaption>
          <LineChart points={body.weightSeries} unit="kg" decimals={1} />
        </figure>
        {body.fatSeries.length > 1 && (
          <figure className="chartfig">
            <figcaption className="chart-cap">
              Fat mass, kg, same readings
            </figcaption>
            <LineChart points={body.fatSeries} unit="kg" decimals={1} />
          </figure>
        )}
      </div>
      <p className="ex-cue">
        {/* The window is in the caption and derived from the series itself, because the Weight tab
            drew a 120-day picture beside a 34-day trend line and named neither, which is 09-health
            P3-3. A chart that does not say what it spans is a chart the reader has to guess at. */}
        Each point is a weigh-in, {body.readings} of them this year. The gaps between them are not
        flat stretches, they are days nobody stepped on the scale.
      </p>
    </div>
  );
}

function WhereItWent({ body }: { body: YearBody }) {
  const { split, splitFrom, splitTo, instrument } = body;
  if (!split || !splitFrom || !splitTo) return null;

  return (
    <div className="exgroup">
      <div className="exgroup-label">
        Where it came off <span className="tag">({when(splitFrom.date)} to {when(splitTo.date)})</span>
      </div>
      <div className="exlist">
        <div className="ex" data-slot="year-split">
          <div className="ex-name">
            Weight <span className="live tnum">{signed(split.dKg)} kg</span>,{' '}
            fat mass <span className="tnum">{signed(split.dFat)} kg</span>,{' '}
            lean mass <span className="tnum">{signed(split.dLean)} kg</span>
            {/* The share is printed only when it IS a share. src/lib/health/split.ts carries the
                whole argument: the same clause used to print 119% over the window the Weight tab
                displays, and 233% over one in 2025, because a ratio of two deltas stops being a
                share the moment lean mass moves the other way. */}
            {split.fatShare != null && (
              <>, so <span className="tnum">{split.fatShare}%</span> of it was fat</>
            )}
            {split.fatShare == null && split.leanOpposed && ', so more than all of the loss came off fat'}
            .
          </div>
          <div className="ex-cue">
            Both endpoints are {splitFrom.source.toLowerCase()} readings, on purpose. The two
            instruments agree about weight to{' '}
            <span className="tnum">{instrument.worstKg?.toFixed(2)} kg</span> at worst across the{' '}
            <span className="tnum">{instrument.days}</span> days that carry both, and disagree about
            fat mass by up to <span className="tnum">{instrument.worstFatKg?.toFixed(2)} kg</span>.
            A change of one or two kilos read across two instruments is mostly the difference between
            the instruments, so this split never mixes them.
          </div>
        </div>
      </div>
      <p className="ex-cue">
        Neither the fat line nor the lean line is measured. Body fat percent is the only reading the
        scale takes, and fat mass and lean mass are both computed from it, so they always add up to
        the weight. That reading moves with how hydrated you were that morning. If the weights on the
        bar went up over the same months, the muscle did not leave.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * EVERYTHING ELSE THE SCALE RECORDS
 * ---------------------------------------------------------------------------------------------- */
function Measurements({ body }: { body: YearBody }) {
  if (!body.metrics.length) return null;
  return (
    <div className="exgroup">
      <div className="exgroup-label">
        Every other measurement <span className="tag">({body.metrics.length})</span>
      </div>
      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th>Measurement</th>
              <th className="tnum">{when(body.peak.date)}</th>
              <th className="tnum">{when(body.latest.date)}</th>
              <th className="tnum">Change</th>
            </tr>
          </thead>
          <tbody>
            {body.metrics.map((m) => (
              <tr key={m.key}>
                <td>
                  {m.label}
                  {m.unit && <span className="quiet"> {m.unit}</span>}
                </td>
                <td className="tnum">{m.from.toFixed(m.decimals)}</td>
                <td className="tnum">{m.to.toFixed(m.decimals)}</td>
                <td className="tnum">{signed(m.delta, m.decimals)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ex-cue">
        Peak reading to newest reading, so every row covers the same two days as the headline.
        Nothing here is coloured: this is a cut, so weight and fat falling is the plan and lean mass
        and muscle falling is the cost of it, and one colour cannot mean both.
        Skeletal muscle, body water and resting burn are recorded on watch readings only, so a row
        is blank rather than guessed at if either end came off the scale.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * ATTENDANCE
 * ---------------------------------------------------------------------------------------------- */
function Training({ training, year }: { training: YearTraining; year: number }) {
  const { disciplines, months, longestGap, lastYear } = training;

  /* THE WATCH'S VOCABULARY IS NOT A PERSON'S, and `KIND_LABEL` already translates it everywhere else
     on this site, so it is imported rather than restated. But it is not injective here: `treadmill`
     and `running` both read "run", and two rows of one table both labelled "run" is worse than the
     raw string. So the raw kind is shown only on the rows whose label is shared, and which rows
     those are is DERIVED from the data rather than listed, because a hand-kept list of collisions
     goes stale the first time a new kind arrives. */
  const labelOf = (kind: string) => KIND_LABEL[kind] ?? kind;
  const labelCounts = new Map<string, number>();
  for (const d of disciplines) labelCounts.set(labelOf(d.kind), (labelCounts.get(labelOf(d.kind)) ?? 0) + 1);

  return (
    <div className="exgroup">
      <div className="exgroup-label">
        What you actually did <span className="tag">({training.days} days)</span>
      </div>

      <div className="stats">
        <div>
          <div className="stat-k">Training days</div>
          <div className="stat-v tnum">{training.days}</div>
          <div className="stat-d">since {when(training.firstDay)}</div>
        </div>
        <div>
          <div className="stat-k">Sessions</div>
          <div className="stat-v tnum">{training.sessions}</div>
          <div className="stat-d">{(training.sessions / (training.days || 1)).toFixed(2)} a day</div>
        </div>
        <div>
          <div className="stat-k">Time</div>
          <div className="stat-v tnum">{hours(training.minutes)}</div>
          <div className="stat-d">{Math.round(training.minutes / (training.days || 1))} min a training day</div>
        </div>
      </div>

      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th>Discipline</th>
              <th className="tnum">Sessions</th>
              <th className="tnum">Days</th>
              <th className="tnum">Time</th>
              <th className="tnum">Last</th>
            </tr>
          </thead>
          <tbody>
            {disciplines.map((d) => (
              <tr key={d.kind}>
                <td>
                  {labelOf(d.kind)}
                  {(labelCounts.get(labelOf(d.kind)) ?? 0) > 1 && <div className="quiet">{d.kind}</div>}
                </td>
                <td className="tnum">{d.sessions}</td>
                <td className="tnum">{d.days}</td>
                <td className="tnum">{hours(d.minutes)}</td>
                <td className="tnum">{when(d.last)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ex-cue">
        Read straight off the watch, so a session you never opened an app for still counts. The four
        activities are not equal in what they record: swimming carries a heart rate per second and a
        row per length, the treadmill carries cadence, lifting and the bike carry a heart rate and
        nothing else. Counting the days treats them the same because attendance is the same;
        nothing else on this site does.
      </p>

      <div className="exgroup-label" style={{ marginTop: 22 }}>
        By month <span className="tag">({months.length})</span>
      </div>
      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th>Month</th>
              <th className="tnum">Days trained</th>
              <th className="tnum">Sessions</th>
              <th className="tnum">Time</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <td>{monthLabel(m.month)}</td>
                <td className="tnum">{m.days}</td>
                <td className="tnum">{m.sessions}</td>
                <td className="tnum">{hours(m.minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {longestGap && (
        <p className="ex-cue">
          The longest break inside the year was{' '}
          <span className="tnum">{longestGap.days}</span> days, between {when(longestGap.from)} and{' '}
          {when(longestGap.to)}. It is measured from your first session of the year rather than from
          January the first, because the weeks before that first session are missing from the export
          as surely as they are missing from your training, and from here the two look identical.
        </p>
      )}
      {lastYear && (
        <p className="ex-cue">
          For scale, {year - 1} in full: <span className="tnum">{lastYear.days}</span> training days,{' '}
          <span className="tnum">{lastYear.sessions}</span> sessions,{' '}
          <span className="tnum">{hours(lastYear.minutes)}</span>. That is a whole year against a part
          of one, so it is a size and not a verdict.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * THE WEIGHTS ON THE BAR
 * ---------------------------------------------------------------------------------------------- */
function Strength({ strength }: { strength: YearStrength }) {
  const { lifts, logStart } = strength;
  if (!logStart) return null;
  const up = lifts.filter((l) => l.delta > 0).length;
  const flat = lifts.filter((l) => l.delta === 0).length;
  const down = lifts.filter((l) => l.delta < 0).length;

  return (
    <div className="exgroup">
      <div className="exgroup-label">
        What went up <span className="tag">({up} up, {flat} flat, {down} down)</span>
      </div>
      <p className="ex-cue">
        This is the only section that is not the year. The watch has seen every session; the gym app
        only holds what you typed into it, and its first set this year is {when(logStart)}. So this
        is <span className="tnum">{strength.sets}</span> sets across{' '}
        <span className="tnum">{strength.days}</span> logged days, and the months before that are
        real training with no weights against them.
      </p>
      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th>Lift</th>
              <th className="tnum">Days</th>
              <th className="tnum">First</th>
              <th className="tnum">Latest</th>
              <th className="tnum">Change</th>
            </tr>
          </thead>
          <tbody>
            {lifts.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.name}
                  {l.assistance && <div className="quiet">counterweight, so less is progress</div>}
                </td>
                <td className="tnum">{l.sessions}</td>
                <td className="tnum">{l.firstTop} lb</td>
                <td className="tnum">{l.lastTop} lb</td>
                <td className="tnum">{signed(l.delta, 0)} lb</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ex-cue">
        Heaviest set of the first logged day against the heaviest set of the latest, for every lift
        logged on two or more days.{' '}
        <span className="tnum">{strength.singleSessionLifts}</span> more were logged on exactly one
        day, which is a weight and not a trajectory, so they are counted here and not listed.
        Bodyweight sets and any set typed in from memory are left out: a line drawn through a
        recalled number is a line drawn through a guess. A lift that has not moved is the finding
        rather than the absence of one, so the flat rows stay in.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * THE POOL
 * ---------------------------------------------------------------------------------------------- */
function Swim({ pbs, year }: { pbs: Pb[]; year: number }) {
  if (!pbs.length) return null;
  const beaten = pbs.filter((p) => p.improvedMs != null).length;
  return (
    <div className="exgroup">
      <div className="exgroup-label">
        Personal bests set in {year} <span className="tag">({beaten} of {pbs.length} beat what stood before)</span>
      </div>
      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th className="tnum">Distance</th>
              <th className="tnum">Best in {year}</th>
              <th className="tnum">On</th>
              <th className="tnum">Previous</th>
              <th className="tnum">Taken off</th>
            </tr>
          </thead>
          <tbody>
            {pbs.map((p) => (
              <tr key={p.distanceM}>
                <td className="tnum">{p.distanceM} m</td>
                <td className="tnum">{stopwatch(p.thisYearMs)}</td>
                <td className="tnum">{when(p.onDate)}</td>
                <td className="tnum">
                  {p.beforeMs != null ? stopwatch(p.beforeMs) : 'none on record'}
                  {p.beforeDate && <div className="quiet">{when(p.beforeDate)}</div>}
                </td>
                <td className="tnum">
                  {p.improvedMs != null ? stopwatch(p.improvedMs) : 'nothing'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ex-cue">
        These are the bests the watch itself awarded, not times computed from the lengths. The watch
        stores a numeric type rather than a distance, and the mapping onto 100, 200, 400 and 1500 is
        worked out on every import by requiring the pace per 100 m to rise with distance, so a
        firmware renumbering fails the import instead of quietly relabelling your bests.{' '}
        <Link href="/swim/deep">The whole swimming record</Link> has the stroke efficiency, the pace
        against body weight and the season gaps.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * WHAT THIS PAGE CANNOT SAY
 * ---------------------------------------------------------------------------------------------- */
function Limits({ body, training, year }: { body: YearBody | null; training: YearTraining; year: number }) {
  return (
    <details className="exgroup ladder-all">
      <summary className="exgroup-label">What this page cannot say</summary>
      <ul className="rules">
        {body && (
          <li>
            <strong>{body.peak.kg.toFixed(1)} kg is the heaviest reading of {year}, not the heaviest
            you were.</strong> The first weigh-in of the year is {when(body.recordStarts)}, so
            January and most of February have no reading at all. Whatever the scale would have said
            in that stretch is not in this database and nothing here should be read as a claim
            about it.
          </li>
        )}
        {body && (
          <li>
            <strong>{body.readings} readings across the whole year.</strong> The lines are the shape
            of those readings joined up, not a weight for every day, and one dry morning moves a
            point by more than a week of eating does.
          </li>
        )}
        <li>
          <strong>Training days stop at {training.horizon ? when(training.horizon) : 'no date at all'}.</strong>{' '}
          That is as far as the watch export has reached, so anything after it is unknown rather
          than a rest day, and every count above covers only the days it reached.
        </li>
        <li>
          <strong>Nothing here measures effort.</strong> A 40-minute session and a 40-minute session
          are the same row whether one of them was hard. The watch records a heart rate on a lift
          and nothing else, and it cannot judge a lift.
        </li>
        <li>
          <strong>Every number on this page is queried when you open it.</strong> None of it is typed
          into a sentence, which is the only reason any of it can be checked. If a figure here
          disagrees with another page, one of the two is reading a different window, and the window
          is stated in both places.
        </li>
      </ul>
    </details>
  );
}

export default async function HealthDeepPage() {
  const review = await getYearReview();
  const { body, training, strength, swimPbs, year } = review;

  return (
    <div className="wrap">
      <Link href="/health?s=weight" className="eyebrow">&larr; Body and the week</Link>
      <h1>The year so far</h1>
      <p className="lede">
        Everything {year} has on record about your body and your training, from the heaviest reading
        of the year to the newest one. Read on the sofa, not at the rack.
      </p>

      {body ? (
        <>
          <Headline body={body} />
          <TheLine body={body} />
          <WhereItWent body={body} />
          <Measurements body={body} />
        </>
      ) : (
        <p className="empty">
          Fewer than two weigh-ins on record for {year}, so there is no range to draw yet.
        </p>
      )}

      <Training training={training} year={year} />
      <Strength strength={strength} />
      <Swim pbs={swimPbs} year={year} />
      <Limits body={body} training={training} year={year} />
    </div>
  );
}
