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
function Swolf({ points }: { points: SwolfPoint[] }) {
  const s = swolfSummary(points);
  if (!s) return null;
  const { best, latest, bestRecent, recent } = s;
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
      {/* THE DEFINITION WENT, 2026-09-11. He knows what SWOLF is, and said the app kept telling
          him: "you repeat the same thing about what SWOLF is". The split of his own number, under
          the chart, is the part the definition was standing in for. */}
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
        Last 12 months, <span className="tnum">{recent.length}</span> of{' '}
        <span className="tnum">{points.length}</span> sessions.
      </p>
      <p className="ex-cue" style={{ marginTop: 10 }}>
        Last swim <b className="tnum">{latest.swolf}</b>: <span className="tnum">{latest.avgSeconds}</span> s
        and <span className="tnum">{latest.avgStrokes}</span> strokes a length.{' '}
        {off > 0 ? <><span className="tnum">{off}</span> off</> : <>At or better than</>} your 12-month
        best, <span className="tnum">{target.swolf}</span> on {when(target.date)}.
      </p>

      {/* THE SECOND DEFINITION, SAID OUT LOUD. This is the pace column's mistake waiting to happen
          again: two defensible numbers for one name, and nothing on either page admitting the other
          exists. The agreement figure is queried, not claimed. */}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * PERSONAL BESTS, ALL OF THEM. `standingFor()` has returned a full `history` array since the tier
 * table was built and /swim renders only `best`. This is the cheapest thing on the page: the data
 * was already computed and thrown away at the render.
 * ---------------------------------------------------------------------------------------------- */
function Progression({
  standings,
  records,
}: {
  standings: DistanceStanding[];
  records: DeepSwim['distanceRecords'];
}) {
  const withHistory = standings.filter((s) => s.history.length > 1);
  if (!withHistory.length) return null;
  const firstRecord = records[0];
  const latestRecord = records[records.length - 1];

  return (
    <div className="exgroup">
      <div className="exgroup-label">
        How the personal bests got there <span className="tag">(Samsung&rsquo;s own top times)</span>
      </div>
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

      {/* THE FURTHEST YOU HAVE EVER SWUM, and the reason it is computed rather than read.
          Samsung keeps this as `best_records` type 3 and the plan asked whether to import it. The
          answer turned out to be no: its log says 900 m on 2023-09-12 while the sessions hold
          4,500 m on 2023-05-27. Importing it would have understated the record it was meant to
          supply. A running maximum over the sessions is more complete and costs one query. */}
      {records.length > 1 && firstRecord && latestRecord && (
        <details className="exgroup ladder-all">
          <summary className="exgroup-label">
            The furthest you had ever swum{' '}
            {/* NON-BREAKING, like the distance labels above: "(9 times, 5,000" wrapped and left
                "m)" alone on the next line. */}
            <span className="tag">
              ({records.length} times, {latestRecord.metres.toLocaleString('en-CA')}&nbsp;m)
            </span>
          </summary>
          {/* The label stays; the provenance went, 2026-09-09. That these are derived from the
              sessions rather than from Samsung's own record log, which starts too late to hold most
              of them, is true and is why the table can exist at all. It is also plumbing. */}
          <div className="table-scroll">
            <table className="plan-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th className="tnum">Distance</th>
                  <th className="tnum">Beat</th>
                </tr>
              </thead>
              <tbody>
                {[...records].reverse().map((r) => (
                  <tr key={r.date + r.metres}>
                    <td>{when(r.date)}</td>
                    <td className="tnum">{r.metres.toLocaleString('en-CA')}&nbsp;m</td>
                    <td className="tnum">
                      {r.previousMetres > 0
                        ? `${r.previousMetres.toLocaleString('en-CA')} m`
                        : 'first recorded'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
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
  const byPace = [...bands].sort((a, b) => a.medianPaceSeconds - b.medianPaceSeconds);
  const fastest = byPace[0]!;
  const slowest = byPace[byPace.length - 1]!;
  const lightest = bands[0]!;
  const heaviest = bands[bands.length - 1]!;
  /* Only years with a real sample: 2018 holds two swims and 2021 one. */
  const years = d.years.filter((y) => y.swims >= 10);
  const rated = years.filter((y) => y.medianPaceSeconds != null);
  const fastestYear = rated.length
    ? rated.reduce((a, b) => (b.medianPaceSeconds! < a.medianPaceSeconds! ? b : a))
    : null;
  const biggestYear = rated.length ? rated.reduce((a, b) => (b.swims > a.swims ? b : a)) : null;

  return (
    <div className="exgroup">
      <div className="exgroup-label">
        Weight against pace <span className="tag">({d.weightPace.length} swims with both)</span>
      </div>
      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th className="tnum">Weight</th>
              <th className="tnum">Swims</th>
              <th className="tnum">Typical / 100 m</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((b) => (
              <tr key={b.loKg}>
                <td className="tnum">{b.loKg} to {b.hiKg} kg</td>
                <td className="tnum">{b.swims}</td>
                <td className="tnum">{pace(b.medianPaceSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ex-cue" style={{ marginTop: 10 }}>
        Fastest: <b className="tnum">{fastest.loKg} to {fastest.hiKg} kg</b>, at{' '}
        <span className="tnum">{pace(fastest.medianPaceSeconds)}</span>. Slowest:{' '}
        <b className="tnum">{slowest.loKg} to {slowest.hiKg} kg</b>, at{' '}
        <span className="tnum">{pace(slowest.medianPaceSeconds)}</span>.
        {fastest === heaviest && slowest === lightest && (
          <> Your heaviest band is your fastest and your lightest is your slowest.</>
        )}
      </p>
      {/* MEDIANS SINCE 2026-09-11. This table printed a best (a minimum) and an average (a mean)
          per band, and a minimum always picks the one 300 m session of 22 January 2025 that reads
          1:31 per 100 m against 8:31 of wall clock. That one row made 110 to 115 kg the fastest
          band in the sentence here. */}

      <details className="src">
        <summary>Year by year</summary>
        <div className="src-body">
          <div className="table-scroll">
            <table className="plan-table">
              <thead>
                <tr>
                  <th className="tnum">Year</th>
                  <th className="tnum">Swims</th>
                  <th className="tnum">Distance</th>
                  <th className="tnum">Weight</th>
                  <th className="tnum">Typical / 100 m</th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.year}>
                    <td className="tnum">{y.year}</td>
                    <td className="tnum">{y.swims}</td>
                    <td className="tnum">{Math.round(y.metres / 1000)} km</td>
                    <td className="tnum">{y.avgKg ?? '-'}{y.avgKg != null && ' kg'}</td>
                    <td className="tnum">{pace(y.medianPaceSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fastestYear && biggestYear && (
            <p>
              Fastest year <b className="tnum">{fastestYear.year}</b>, at{' '}
              <span className="tnum">{fastestYear.avgKg}</span> kg. Biggest year{' '}
              <b className="tnum">{biggestYear.year}</b>, at{' '}
              <span className="tnum">{biggestYear.avgKg}</span> kg.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * SWIMMING AFTER LIFTING. Association, with the sample sizes on the face of it.
 * ---------------------------------------------------------------------------------------------- */
function AfterLifting({ cohorts }: { cohorts: DeepSwim['proximity'] }) {
  const real = cohorts.filter((c) => c.medianPaceSeconds != null);
  if (real.length < 2) return null;
  const byPace = [...real].sort((a, b) => a.medianPaceSeconds! - b.medianPaceSeconds!);
  const fastest = byPace[0]!;
  const spread = byPace[byPace.length - 1]!.medianPaceSeconds! - fastest.medianPaceSeconds!;
  return (
    <div className="exgroup">
      <div className="exgroup-label">Swimming after lifting</div>
      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th className="wide">When the swim started</th>
              <th className="tnum">Swims</th>
              <th className="tnum">Pace</th>
              <th className="tnum">SWOLF</th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => (
              <tr key={c.label}>
                <td>{c.label}</td>
                <td className="tnum">{c.swims}</td>
                <td className="tnum">{pace(c.medianPaceSeconds)}</td>
                <td className="tnum">{c.medianSwolf ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* "On this sample it looks slightly better" stood here until 2026-09-11, typed, over a table
          whose within-45-minutes row was the slower of the two lifting rows, beside a mean that one
          broken 50 m session had pushed to 4:15. Medians now, and the sentence is the spread. Five
          seconds per 100 m is under one and a half seconds a length. */}
      <p className="ex-cue" style={{ marginTop: 10 }}>
        {spread <= 5 ? (
          <>
            The groups sit within <b className="tnum">{spread}</b> s per 100 m of each other, so
            lifting first does not show in the pace.
          </>
        ) : (
          <>
            Fastest: {fastest.label.toLowerCase()}, by <b className="tnum">{spread}</b> s per 100 m
            over the slowest.
          </>
        )}
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
  const avgRecent = Math.round(recent.reduce((a, b) => a + b.restPct, 0) / recent.length);
  return (
    <details className="exgroup ladder-all">
      <summary className="exgroup-label">
        Work to rest <span className="tag">({avgRecent}% at the wall, last {recent.length} swims)</span>
      </summary>
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
    </details>
  );
}

/* ------------------------------------------------------------------------------------------------
 * THE LAST SESSION, PIECE BY PIECE. The only thing here that needs the per-length rest reading, so
 * it is the only thing gated on the year that reading starts.
 * ---------------------------------------------------------------------------------------------- */
function Pieces({ session }: { session: DeepSwim['lastPieces'] }) {
  if (!session || !session.pieces.length) return null;
  const total = session.pieces.reduce((a, p) => a + p.metres, 0);
  const unbroken = session.pieces.length === 1;
  return (
    <details className="exgroup ladder-all">
      <summary className="exgroup-label">
        The last session, piece by piece{' '}
        <span className="tag">
          ({unbroken ? 'one piece, unbroken' : `${session.pieces.length} pieces`}, {total.toLocaleString('en-CA')} m, {when(session.date)})
        </span>
      </summary>
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
          The six most recent of <span className="tnum">{gaps.length}</span>.
        </p>
      )}
    </details>
  );
}

/* Limits, "Where this data stops", was here until 2026-09-15: what is in the record, what is
 * missing, what was excluded, that the dates are converted from UTC, and that stroke counts are
 * cycles. Method. The derivations and their evidence are in src/lib/swim/deep.ts. */

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
      {/* "Eight years of individual lengths, read" was a typed span beside derived ones, and
          "this is the page for afterwards, not for the pool deck" tells him where he is standing,
          which he knows. The link is the only part that does anything. */}
      <p className="lede"><Link href="/swim">Back to Swim</Link>.</p>

      <Swolf points={d.swolf} />
      <Progression standings={standings} records={d.distanceRecords} />
      <WeightAgainstPace d={d} />
      <AfterLifting cohorts={d.proximity} />
      <WorkToRest d={d} />
      <StrokeMix strokes={d.strokes} />
      <Pieces session={d.lastPieces} />
      <Gaps gaps={d.gaps} />
    </div>
  );
}
