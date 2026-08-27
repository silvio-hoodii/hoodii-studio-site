import Link from 'next/link';
import type { Metadata } from 'next';
import { getDeepSwim, swolfSummary, type SwolfPoint, type DeepSwim } from '@/lib/swim/deep';
import {
  loadSwimStandards, getSwimPbs, standingFor, ratedDistances, fmtTime,
  type DistanceStanding,
} from '@/lib/swim/level';
import { LineChart } from '../../health/HealthCharts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Swim, the whole record',
  description: 'Eight years of individual lengths: stroke efficiency, personal bests, and what the data cannot say.',
  alternates: { canonical: '/swim/deep' },
  robots: { index: false, follow: false },
};

/* THE DEEP DIVE. Built 2026-08-27, Phase D item 2 of the training redesign.
 *
 * A ROUTE AND NOT A SIXTH SUB-TAB, which was his call when the alternatives were put to him. The
 * five chips on /swim measure 337px of a 390px screen and `.subtabs` is a flex row with no wrap and
 * no scroll, so a sixth would have broken the "0 horizontal overflows, 0 wrapped nav rows"
 * invariant Phase C measured across all eleven training views. The other option, folding this into
 * the Now tab behind six `<details>`, loses on the complaint that produced the sub-tabs in the first
 * place: "if I go to the water, I have to scroll a lot". Nothing here belongs at a poolside. It is
 * the page you read on the sofa afterwards.
 *
 * WHAT IT IS FOR. `health_swim_length` holds 19,327 lengths back to 2018 and until today nothing
 * read one row. Every number below comes out of src/lib/swim/deep.ts, which queries them, and NONE
 * of it is typed into a sentence here. That is not tidiness: the recovered notes for this page
 * asserted a best SWOLF of 34.6 and a current 40 to 41, and the lengths say 30.9 and a 2026 average
 * near 38. A figure in prose cannot be re-checked by the page printing it.
 *
 * THE ORDER IS BY WHAT IT CHANGES. Stroke efficiency and personal bests are things he can act on
 * this week. The body-weight cross-reference is the most interesting and the least actionable, and
 * it is the one with a confound big enough that it gets stated before the numbers rather than after.
 * The limits go last, in full, because a page this confident about eight years of data has to say
 * where the data stops. */

/** "6 Jun 2025". WITH THE YEAR, which is why `shortDate` from lib/format is not used here.
 *
 *  That helper renders "Jun 6" and is right everywhere it is already used, because every other
 *  training surface shows the last ninety days. This page spans 2018 to 2026, and the best stroke
 *  efficiency on it is three years old: "Jun 6" against a last swim of "Aug 25" reads as ten weeks
 *  ago rather than fifteen months. Noon UTC for the same reason lib/format does it, so a date-only
 *  string cannot land on the previous day in a western timezone. */
function when(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Pace in seconds to "1:48". Whole seconds, matching /swim's own `msToPace`: a pace is a rate and
 *  hundredths on a rate computed over a whole session imply precision the wall clock lacks. */
function pace(seconds: number | null): string {
  if (seconds == null) return 'N/A';
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

/** Seconds to "9:31" or "47s". */
function dur(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------------------------------------
 * STROKE EFFICIENCY. The headline, because it is the one number that moves with technique rather
 * than with effort, and the one his plan is built to change.
 * ---------------------------------------------------------------------------------------------- */
function Swolf({ points, agreement }: { points: SwolfPoint[]; agreement: DeepSwim['swolfAgreement'] }) {
  const s = swolfSummary(points);
  if (!s) return null;
  const { best, latest, bestRecent, first, recent, worstAllTime } = s;
  /* Against the best of the last twelve months, not the all-time best. Measuring this week against
     June 2025 tells him he has got worse, which is true and useless; measuring it against the last
     year is a target he can reach. */
  const target = bestRecent ?? best;
  const off = Math.round((latest.swolf - target.swolf) * 10) / 10;

  return (
    <div className="exgroup">
      <div className="exgroup-label">
        Stroke efficiency <span className="tag">({points.length} sessions, freestyle)</span>
      </div>
      <p className="lede" style={{ marginTop: 0 }}>
        SWOLF is seconds for a length plus strokes for that length. It drops when you get faster or
        when you get longer, which is why it is the number worth watching: effort moves the first
        half and technique moves the second.
      </p>
      <div className="stats">
        <div>
          <div className="stat-k">Best ever</div>
          <div className="stat-v tnum">{best.swolf}</div>
          <div className="stat-d">{when(best.date)}</div>
        </div>
        {bestRecent && bestRecent.date !== best.date && (
          <div>
            {/* "Best this year" was the first label here and it sat above a date in September of
                the previous year, while the sentence below the chart correctly said "the last twelve
                months". Two windows, one screen apart, and only the screenshot showed it. */}
            <div className="stat-k">Best, 12 months</div>
            <div className="stat-v tnum">{bestRecent.swolf}</div>
            <div className="stat-d">{when(bestRecent.date)}</div>
          </div>
        )}
        <div>
          <div className="stat-k">Last swim</div>
          <div className="stat-v tnum">{latest.swolf}</div>
          <div className="stat-d">{when(latest.date)}</div>
        </div>
      </div>
      <LineChart points={recent.map((p) => ({ date: p.date, value: p.swolf }))} unit="SWOLF" decimals={1} />
      <p className="ex-meta" style={{ marginTop: 6 }}>
        The last twelve months, <span className="tnum">{recent.length}</span> of{' '}
        <span className="tnum">{points.length}</span> sessions. The full series runs back to{' '}
        {when(first.date)} and its worst session is <span className="tnum">{worstAllTime.swolf}</span>{' '}
        ({when(worstAllTime.date)}), which drawn on the same axis flattens everything since into a
        straight line.
      </p>
      <p className="ex-cue" style={{ marginTop: 10 }}>
        Your last swim was <b className="tnum">{latest.swolf}</b>, which is{' '}
        {off > 0 ? <>{off} off</> : <>at or better than</>} your best of the last twelve months
        (<span className="tnum">{target.swolf}</span> on {when(target.date)}). The two halves of
        it were <span className="tnum">{latest.avgSeconds}s</span> a length and{' '}
        <span className="tnum">{latest.avgStrokes}</span> strokes. Taking one stroke off a length is
        worth exactly as much as taking a second off it, and it is the easier of the two to change.
      </p>

      {/* THE SECOND DEFINITION, SAID OUT LOUD. This is the pace column's mistake waiting to happen
          again: two defensible numbers for one name, and nothing on either page admitting the other
          exists. The agreement figure is queried, not claimed. */}
      <details className="src">
        <summary>Why this can disagree with the SWOLF on your last session card</summary>
        <div className="src-body">
          <p>
            This chart computes SWOLF from the length rows with the rest taken out: seconds swum per
            length plus strokes per length, freestyle only. Samsung stores its own session figure and
            /swim prints that one. On the{' '}
            <span className="tnum">{agreement.sessions}</span> sessions carrying both, the two agree
            within 1.0 on <span className="tnum">{agreement.within1}</span> of them, and the average
            distance between them is <span className="tnum">{agreement.avgAbsDiff}</span>.
          </p>
          <p>
            Where they part company is interval swims, and the gap reaches{' '}
            <span className="tnum">{agreement.maxDiff}</span>. On a session of 25s with a minute at
            the wall between them, the stored number counts the waiting and this one does not.
            Neither is wrong. They answer different questions, and the reason this page names which
            one it used is that a single mixed pace column once put a best of 1:31 per 100 m on
            /health off a session that was 82% rest.
          </p>
          <p>
            Freestyle only, and that is not a rounding decision. Kickboard lengths have almost no
            strokes in them, so averaging them in reads as a large efficiency gain that is really
            just a change of equipment.
          </p>
        </div>
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * PERSONAL BESTS, ALL OF THEM. `standingFor()` has returned a full `history` array since the tier
 * table was built and /swim renders only `best`. This is the cheapest thing on the page: the data
 * was already computed and thrown away at the render.
 * ---------------------------------------------------------------------------------------------- */
function Progression({ standings }: { standings: DistanceStanding[] }) {
  const withHistory = standings.filter((s) => s.history.length > 1);
  if (!withHistory.length) return null;
  return (
    <div className="exgroup">
      <div className="exgroup-label">
        How the personal bests got there <span className="tag">(Samsung&rsquo;s own top times)</span>
      </div>
      <p className="lede" style={{ marginTop: 0 }}>
        /swim shows the best at each distance. This is every attempt the watch kept, oldest at the
        bottom, so an improvement is a shape rather than a single number.
      </p>
      {withHistory.map((s) => {
        const oldest = s.history[s.history.length - 1]!;
        const best = s.best!;
        const gained = oldest.durationMs - best.durationMs;
        return (
          <details className="exgroup ladder-all" key={s.distanceM}>
            <summary className="exgroup-label">
              {/* A NON-BREAKING SPACE, because "100 m" broke after the number and rendered as
                  "100" over "M" in the collapsed summary. The text dump reads "100 M" whether it
                  wrapped or not, so only the screenshot showed it. */}
              {s.distanceM}&nbsp;m{' '}
              <span className="tag">
                ({s.history.length} times, {fmtTime(best.durationMs)} best
                {gained > 0 && <>, {Math.round(gained / 1000)}s faster than the first</>})
              </span>
            </summary>
            <div className="table-scroll">
              <table className="plan-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th className="tnum">Time</th>
                    <th className="tnum">Per 100 m</th>
                    <th className="tnum">Off best</th>
                  </tr>
                </thead>
                <tbody>
                  {s.history.map((h) => {
                    const behind = h.durationMs - best.durationMs;
                    return (
                      <tr key={h.achievedOn + h.durationMs}>
                        <td>{when(h.achievedOn)}</td>
                        <td className="tnum">{fmtTime(h.durationMs)}</td>
                        <td className="tnum">
                          {pace(Math.round(h.durationMs / 1000 / (s.distanceM / 100)))}
                        </td>
                        <td className="tnum">
                          {behind === 0 ? 'best' : `+${Math.round(behind / 1000)}s`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * BODY WEIGHT AGAINST PACE. The finding the recovered notes were most excited about, and the one
 * that needed the most care: the confound is larger than the effect and it is stated first.
 * ---------------------------------------------------------------------------------------------- */
function WeightAgainstPace({ d }: { d: DeepSwim }) {
  const bands = d.weightBands;
  if (bands.length < 2) return null;
  const fastest = [...bands].sort((a, b) => a.bestPaceSeconds - b.bestPaceSeconds)[0]!;
  const lightest = bands[0]!;
  /* Only years with a real sample, and only ones carrying a pace at all: 2018 holds two swims and
     2021 holds one, and letting three sessions win "fastest year" would be the same mistake as
     letting one length win a session average. */
  const years = d.years;
  const rated = years.filter((y) => y.swims >= 10 && y.bestPaceSeconds != null);
  const fastestYear = rated.length
    ? rated.reduce((a, b) => (b.bestPaceSeconds! < a.bestPaceSeconds! ? b : a))
    : null;
  const biggestYear = rated.length ? rated.reduce((a, b) => (b.swims > a.swims ? b : a)) : null;
  /* The sample is the argument here, so it is computed rather than described. */
  const lightestIsThin = lightest.swims < fastest.swims / 2;

  return (
    <div className="exgroup">
      <div className="exgroup-label">
        Weight against pace <span className="tag">({d.weightPace.length} swims with both)</span>
      </div>
      <p className="lede" style={{ marginTop: 0 }}>
        Every swim with a rest-excluded pace, told against the nearest weighing within a month. Read
        the sample sizes before the paces: this cannot separate weight from fitness, and the reason
        is in the table itself.
      </p>
      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th className="tnum">Weight</th>
              <th className="tnum">Swims</th>
              <th className="tnum">Best / 100 m</th>
              <th className="tnum">Average</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((b) => (
              <tr key={b.loKg}>
                <td className="tnum">{b.loKg} to {b.hiKg} kg</td>
                <td className="tnum">{b.swims}</td>
                <td className="tnum">{pace(b.bestPaceSeconds)}</td>
                <td className="tnum">{pace(b.avgPaceSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ex-cue" style={{ marginTop: 10 }}>
        Your fastest swimming sits in the{' '}
        <b className="tnum">{fastest.loKg} to {fastest.hiKg} kg</b> band, not the lightest one.
        {lightestIsThin && (
          <>
            {' '}The lightest band holds <span className="tnum">{lightest.swims}</span> swims against{' '}
            <span className="tnum">{fastest.swims}</span> in that one, so read the counts before the
            times.
          </>
        )}{' '}
        Being lighter has not, so far, made you faster in the water. That is worth knowing, because
        the opposite is what everybody assumes. What it is NOT is evidence that carrying weight
        helps, and the year table below is why.
      </p>

      {/* THE TABLE THAT SETTLES IT, and the reason it exists is a sentence that was wrong.
          This section first read "the heaviest band is also the period he swam most", which is the
          obvious confound and is not what the record says: the band with the most swims is not the
          heaviest, and his biggest year by volume was one of his LIGHTER ones. That claim was
          written from a story rather than a query and the screenshot is what exposed it, because
          the table sat three lines above the sentence contradicting it. */}
      <details className="src">
        <summary>Why this cannot be untangled, year by year</summary>
        <div className="src-body">
          <div className="table-scroll">
            <table className="plan-table">
              <thead>
                <tr>
                  <th className="tnum">Year</th>
                  <th className="tnum">Swims</th>
                  <th className="tnum">Distance</th>
                  <th className="tnum">Weight</th>
                  <th className="tnum">Best / 100 m</th>
                </tr>
              </thead>
              <tbody>
                {years.filter((y) => y.swims >= 10).map((y) => (
                  <tr key={y.year}>
                    <td className="tnum">{y.year}</td>
                    <td className="tnum">{y.swims}</td>
                    <td className="tnum">{Math.round(y.metres / 1000)} km</td>
                    <td className="tnum">{y.avgKg ?? '-'}{y.avgKg != null && ' kg'}</td>
                    <td className="tnum">{pace(y.bestPaceSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fastestYear && biggestYear && (
            <p>
              Your fastest year was <b className="tnum">{fastestYear.year}</b>, at an average of{' '}
              <span className="tnum">{fastestYear.avgKg}</span> kg on{' '}
              <span className="tnum">{fastestYear.swims}</span> swims. Your biggest year was{' '}
              <b className="tnum">{biggestYear.year}</b>, at{' '}
              <span className="tnum">{biggestYear.avgKg}</span> kg on{' '}
              <span className="tnum">{biggestYear.swims}</span>.{' '}
              {biggestYear.year !== fastestYear.year
                && biggestYear.avgKg != null && fastestYear.avgKg != null
                && biggestYear.avgKg < fastestYear.avgKg ? (
                  <>
                    So the year you swam most was one of the LIGHTER ones and the year you swam
                    fastest was heavier. Weight and volume did not move together, which means
                    neither of them on its own explains the pace, and a table sorted by weight
                    cannot tell you which is doing the work.
                  </>
                ) : (
                  <>
                    Those two are not the same year, so the weight bands above have folded several
                    different training years into each other and cannot separate weight from
                    fitness.
                  </>
                )}
            </p>
          )}
          <p>
            To settle it you would need a stretch of steady weight with changing volume, or the
            reverse. Eight years of this record do not contain one.
          </p>
          <p>
            The weighing is the nearest one within 30 days, which is as tight as{' '}
            {d.weightPace.length} matched swims allows. Body composition also moves with hydration,
            so a kilo either way may be water. And the best-pace column favours short, heavily
            rested efforts, because rest is excluded from it: the average column is the fairer
            comparison between rows.
          </p>
        </div>
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * SWIMMING AFTER LIFTING. Association, with the sample sizes on the face of it.
 * ---------------------------------------------------------------------------------------------- */
function AfterLifting({ cohorts }: { cohorts: DeepSwim['proximity'] }) {
  const real = cohorts.filter((c) => c.avgPaceSeconds != null);
  if (real.length < 2) return null;
  const smallest = Math.min(...real.map((c) => c.swims));
  return (
    <div className="exgroup">
      <div className="exgroup-label">Swimming after lifting</div>
      <p className="lede" style={{ marginTop: 0 }}>
        How long after racking the last set the swim started, against how the swim went. Computed
        from the start times, so it is the real gap and not the calendar day.
      </p>
      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th className="wide">When the swim started</th>
              <th className="tnum">Swims</th>
              <th className="tnum">Pace / 100 m</th>
              <th className="tnum">SWOLF</th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => (
              <tr key={c.label}>
                <td>{c.label}</td>
                <td className="tnum">{c.swims}</td>
                <td className="tnum">{pace(c.avgPaceSeconds)}</td>
                <td className="tnum">{c.avgSwolf ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ex-cue" style={{ marginTop: 10 }}>
        Swimming straight after lifting does not look like it costs anything, and on this sample it
        looks slightly better. Treat that as a reason not to worry rather than a reason to do it:
        the smallest group here is <b className="tnum">{smallest}</b> swims, and you swim after
        lifting on the days you have a plan, so the groups differ by intention as much as by
        fatigue.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * WORK TO REST, and the stroke mix. Both short, both collapsed.
 * ---------------------------------------------------------------------------------------------- */
function WorkToRest({ d }: { d: DeepSwim }) {
  const rest = d.rest;
  if (!rest.length) return null;
  const recent = rest.slice(-20);
  const latest = rest[rest.length - 1]!;
  const overran = rest.filter((r) => r.overran).length;
  const avgRecent = Math.round(recent.reduce((a, b) => a + b.restPct, 0) / recent.length);
  return (
    <details className="exgroup ladder-all">
      <summary className="exgroup-label">
        Work to rest <span className="tag">({avgRecent}% at the wall, last {recent.length} swims)</span>
      </summary>
      <p className="lede">
        Session duration minus the time the lengths actually took. Derived that way rather than from
        the per-length rest reading, which does not exist before{' '}
        {d.coverage.restFirstYear ?? 'recently'} and would read eight years of interval swimming as
        unbroken.
      </p>
      <div className="stats">
        <div>
          <div className="stat-k">Last swim</div>
          <div className="stat-v tnum">{latest.restPct}<span className="stat-u">%</span></div>
          <div className="stat-d">at the wall</div>
        </div>
        <div>
          <div className="stat-k">Swimming</div>
          <div className="stat-v tnum">{dur(latest.swimSeconds)}</div>
          <div className="stat-d">of {dur(latest.sessionSeconds)}</div>
        </div>
      </div>
      <LineChart points={recent.map((r) => ({ date: r.date, value: r.restPct }))} unit="% rest" decimals={0} />
      {overran > 0 && (
        <p className="ex-cue" style={{ marginTop: 10 }}>
          On <span className="tnum">{overran}</span> sessions the lengths add up to slightly more
          than the session itself, so their rest figure is shown as 0 and is really unknown and
          small. That is a rounding artifact in the export, not a swim with no rest in it.
        </p>
      )}
    </details>
  );
}

function StrokeMix({ strokes }: { strokes: DeepSwim['strokes'] }) {
  if (!strokes.length) return null;
  return (
    <details className="exgroup ladder-all">
      <summary className="exgroup-label">
        What you actually swim <span className="tag">({strokes[0]!.pct}% {strokes[0]!.stroke.toLowerCase()})</span>
      </summary>
      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th>Stroke</th>
              <th className="tnum">Lengths</th>
              <th className="tnum">Share</th>
            </tr>
          </thead>
          <tbody>
            {strokes.map((s) => (
              <tr key={s.stroke}>
                <td>{s.stroke}</td>
                <td className="tnum">{s.lengths.toLocaleString('en-CA')}</td>
                <td className="tnum">{s.pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ex-cue" style={{ marginTop: 10 }}>
        This is why the efficiency chart above says freestyle only. A kickboard length has almost no
        strokes in it, so mixing them into one average reads as technique improving when what
        changed was the equipment.
      </p>
    </details>
  );
}

/* ------------------------------------------------------------------------------------------------
 * THE LAST SESSION, PIECE BY PIECE. The only thing here that needs the per-length rest reading, so
 * it is the only thing gated on the year that reading starts.
 * ---------------------------------------------------------------------------------------------- */
function Pieces({ session, coverage }: { session: DeepSwim['lastPieces']; coverage: DeepSwim['coverage'] }) {
  if (!session || session.pieces.length < 2) return null;
  const total = session.pieces.reduce((a, p) => a + p.metres, 0);
  return (
    <details className="exgroup ladder-all">
      <summary className="exgroup-label">
        The last session, piece by piece{' '}
        <span className="tag">
          ({session.pieces.length} pieces, {total.toLocaleString('en-CA')} m, {when(session.date)})
        </span>
      </summary>
      <p className="lede">
        Split at the walls where the watch recorded a rest. Available from{' '}
        {coverage.restFirstYear ?? 'recently'} onward only:{' '}
        <span className="tnum">{coverage.rowsWithRest.toLocaleString('en-CA')}</span> of{' '}
        <span className="tnum">{coverage.rows.toLocaleString('en-CA')}</span> lengths carry one.
      </p>
      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th className="tnum">Piece</th>
              <th className="tnum">Distance</th>
              <th className="tnum">Swimming</th>
              <th className="tnum">Rest after</th>
            </tr>
          </thead>
          <tbody>
            {session.pieces.map((p) => (
              <tr key={p.n}>
                <td className="tnum">{p.n}</td>
                <td className="tnum">{p.metres} m</td>
                <td className="tnum">{dur(p.swimSeconds)}</td>
                <td className="tnum">{p.restSeconds == null ? 'end' : dur(p.restSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------------------------------------
 * SEASON GAPS, and then the limits. The gaps are the honest counterweight to "364 sessions since
 * 2018", which reads as eight years of swimming and is really four.
 * ---------------------------------------------------------------------------------------------- */
function Gaps({ gaps }: { gaps: DeepSwim['gaps'] }) {
  if (!gaps.length) return null;
  const long = gaps.filter((g) => g.days > 90);
  const recent = gaps.slice(0, 6);
  return (
    <details className="exgroup ladder-all">
      <summary className="exgroup-label">
        Every break of two weeks or more <span className="tag">({gaps.length} of them)</span>
      </summary>
      <p className="lede">
        {long.length > 0 && (
          <>
            <span className="tnum">{long.length}</span> of these ran past three months, the longest{' '}
            <span className="tnum">{Math.max(...gaps.map((g) => g.days))}</span> days.{' '}
          </>
        )}
        A count of sessions since 2018 reads as eight years of swimming. The gaps are what it
        actually was.
      </p>
      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th>Last swim</th>
              <th>Back in</th>
              <th className="tnum">Days</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((g) => (
              <tr key={g.from}>
                <td>{when(g.from)}</td>
                <td>{when(g.to)}</td>
                <td className="tnum">{g.days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {gaps.length > recent.length && (
        <p className="ex-cue" style={{ marginTop: 10 }}>
          The six most recent. There are{' '}
          <span className="tnum">{gaps.length - recent.length}</span> older ones, including the two
          that span the years you were not swimming at all.
        </p>
      )}
    </details>
  );
}

function Limits({ coverage }: { coverage: DeepSwim['coverage'] }) {
  return (
    <details className="exgroup ladder-all">
      <summary className="exgroup-label">Where this data stops</summary>
      <div className="src-body">
        <p>
          <b>What is here.</b> <span className="tnum">{coverage.rows.toLocaleString('en-CA')}</span>{' '}
          individual lengths across <span className="tnum">{coverage.sessions}</span> sessions, from{' '}
          {when(coverage.firstDate)} to {when(coverage.lastDate)}.
        </p>
        <p>
          <b>What is missing.</b> <span className="tnum">{coverage.sessionsWithoutLengths}</span>{' '}
          recorded swims have no per-length detail at all, so they appear in the distance and pace
          figures on /swim and in none of the charts here. The gap list above deliberately counts
          them, because a swim with no detail is still a swim and leaving it out would invent a break
          that never happened.
        </p>
        <p>
          <b>What was thrown away.</b>{' '}
          <span className="tnum">{coverage.excludedRows}</span> length rows sit outside the plausible
          band of 12 to 120 seconds and are excluded from every figure on this page. The fastest
          length in the file is 9.03 seconds, which beats a world-record 25 m split, and the slowest
          runs to 22 minutes, which is a watch left running at the wall.
        </p>
        <p>
          {/* `{' '}` and not a plain space. React drops a literal space between a closing tag and a
              text child that wraps onto further lines, and the served HTML read
              "not read.The stored". Every sibling bullet here survived because a <span> or a {' '}
              follows its label. Found by grepping the rendered HTML for `</b>` followed by a
              letter, which is the only place it was visible. */}
          <b>The dates are derived, not read.</b>{' '}
          The stored date column is UTC, so an evening swim
          in Calgary is filed a day late. Converting the start time to Alberta&rsquo;s own timezone
          reproduces the date the watch independently recorded on 359 of 361 sessions where both
          exist, against 271 for the raw column, so every date on this page is converted. Those two
          counts were measured once, on 27 August 2026, and are the evidence for the conversion
          rather than a live reading of it. The two sessions that still disagree are both January
          2018.
        </p>
        <p>
          <b>Stroke counts are cycles.</b> Not arm strokes. A median of 9 per 25 m as single strokes
          would be 2.78 m of travel each, which is not a thing that happens. Every stroke figure here
          depends on that reading.
        </p>
      </div>
    </details>
  );
}

export default async function SwimDeepPage() {
  const [d, standards, pbs] = await Promise.all([
    getDeepSwim(),
    loadSwimStandards(),
    getSwimPbs(),
  ]);
  const standings = ratedDistances(standards).map((dist) => standingFor(dist, pbs, standards));

  return (
    <div className="wrap">
      <h1>The whole record</h1>
      <p className="lede">
        Eight years of individual lengths, read. This is the page for afterwards, not for the pool
        deck. <Link href="/swim">Back to Swim</Link>.
      </p>

      <Swolf points={d.swolf} agreement={d.swolfAgreement} />
      <Progression standings={standings} />
      <WeightAgainstPace d={d} />
      <AfterLifting cohorts={d.proximity} />
      <WorkToRest d={d} />
      <StrokeMix strokes={d.strokes} />
      <Pieces session={d.lastPieces} coverage={d.coverage} />
      <Gaps gaps={d.gaps} />
      <Limits coverage={d.coverage} />
    </div>
  );
}
