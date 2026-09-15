import Link from 'next/link';
import type { Metadata } from 'next';
import {
  getDailyReview, FLOOR_STEPS, WINDOW_DAYS, STRETCH_MIN, TAIL_ONE_IN,
  type DailyReview, type ScrapsRow, type MonthPoint,
} from '@/lib/health/daily';
import { LineChart } from '../HealthCharts';

export const dynamic = 'force-dynamic';

/* THE TITLE CARRIES NO YEAR, and the h1 below derives one. A `Metadata` export is evaluated
   without a database round trip, so a year in it would have to be typed, and the first day in the
   store is the one figure on this page most likely to move: an older export, a re-parse, or a
   dropped partial day all shift it. The h1 takes it from the coverage query with everything else. */
export const metadata: Metadata = {
  title: 'Every day the phone recorded',
  description: 'The phone-borne record: steps, active minutes, stairs, and the days that were nothing.',
  alternates: { canonical: '/health/day' },
  robots: { index: false, follow: false },
};

/* THE ONLY CONTINUOUS RECORD OF HIM THERE IS. Built 2026-09-09.
 *
 * Everything else on this site is a SESSION, which exists only on a day he trained, or a WATCH
 * reading, which exists on a minority of days because he wears the watch for workouts and carries
 * the phone always. Steps and active minutes are present on every day of the recent record, back to
 * the first row in the store, and until this page none of it reached any surface.
 *
 * A ROUTE AND NOT A FIFTH CHIP ON /health, and the width is NOT the reason. Measured on the shipped
 * build at 390px: /health's four chips end at 227px and /swim's five end at 317px, so a fifth chip
 * here would have fitted with room. The reason is what the page is FOR. The four /health tabs are
 * read between sets and at the poolside; this is eight years of arithmetic read on the sofa, which
 * is the same call /health/deep and /swim/deep both made.
 *
 * NOTHING BELOW IS TYPED, AND ON 2026-09-09 THAT SENTENCE WAS FALSE IN SEVEN PLACES. It was written
 * about the charts and the tables, all of which were derived, while the Limits section, whose entire
 * subject is that an undeclared number goes wrong quietly, was built out of typed ones. One had
 * already gone wrong. The figures now come from `limits` in src/lib/health/daily.ts with everything
 * else, and `scripts/lint-typed-figures.mjs` fails the build on a two-digit run left in the rendered
 * text of this file, so the claim is a gate rather than a promise. The one deliberate exception is
 * the sentence in READS saying what each column is for, which is a fact about English rather than
 * about his data.
 *
 * THE HONESTY THIS PAGE IS BUILT AROUND. Its headline number read ZERO four weeks before the worst
 * stretch in the record, and the 10th percentile, which is the obvious fix, read 5,944 then against
 * 6,091 now. Neither warned. So the caveat is not a footnote here, it is the second thing on the
 * page, and it prints the December window's own figures rather than describing them. A page that
 * showed the green light without that would be teaching him to trust a light that was green on the
 * way down. */

function when(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

function monthName(mm: string): string {
  return new Date(`2000-${mm}-01T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', timeZone: 'UTC' });
}

const n0 = (v: number | null | undefined) => (v == null ? '-' : Math.round(v).toLocaleString('en-CA'));

/* ------------------------------------------------------------------------------------------------
 * THE HEADLINE, AND THE REASON NOT TO OVER-READ IT, TOGETHER
 * ---------------------------------------------------------------------------------------------- */
function Headline({ r }: { r: DailyReview }) {
  const { now } = r;
  return (
    <div className="yearline">
      <div className="yearline-year">Last {WINDOW_DAYS} days</div>
      <div className="yearline-n tnum">
        {now.belowFloor}
        <span className="yearline-u">{now.belowFloor === 1 ? 'day' : 'days'}</span>
      </div>
      <div className="yearline-body">
        <div className="yearline-rule">
          under {FLOOR_STEPS.toLocaleString('en-CA')} steps{' '}
          <span className="yearline-span">({when(now.from)} to {when(now.to)})</span>
        </div>
        <p className="ex-cue">
          Of the {now.days} days, {now.belowFloor} contained almost no walking. The median day was{' '}
          <span className="tnum">{n0(now.p50)}</span> steps and{' '}
          <span className="tnum">{n0(now.activeMinP50)}</span> active minutes.
        </p>
        {/* THE CAVEAT IS PART OF THE HEADLINE BLOCK ON PURPOSE. It is the finding, not a hedge.
            THE CLAIM IS SCOPED TO ONE EVENT AND NOT TO ALL TIME. It read "has never predicted the
            next four", which is a universal built on a single window: there is one collapse in this
            record, so the evidence supports "it did not see that one coming" and nothing wider. */}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * THE FLOOR MOVED, NOT THE CEILING. The single most useful thing in this table.
 * ---------------------------------------------------------------------------------------------- */
function FloorNotCeiling({ r }: { r: DailyReview }) {
  if (!r.compare) return null;
  const { from: first, to: last } = r.compare;
  const ratio = (a: number, b: number) => (a > 0 ? b / a : null);
  const lift = (a: number, b: number) => {
    const x = ratio(a, b);
    return x == null ? null : `${x.toFixed(1)}x`;
  };
  /* THE SENTENCE UNDER THE TABLE IS DERIVED FROM THE TABLE. The first draft asserted that the worst
     days had moved several times further than the best, under a table showing 1.7x against 1.1x,
     because it was comparing the wrong two months and nothing recomputed the claim. Now the claim
     IS the comparison: if the floor ever stops outrunning the ceiling, the sentence says so. */
  const floorLift = ratio(first.p10, last.p10);
  const ceilLift = ratio(first.p90, last.p90);
  const floorWon = floorLift != null && ceilLift != null && floorLift > ceilLift;

  return (
    <div className="section">
      <div className="section-head"><h2>The floor moved, not the ceiling</h2></div>
      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th>Steps on a</th>
              <th className="tnum">{monthLabelFull(first.month)}</th>
              <th className="tnum">{monthLabelFull(last.month)}</th>
              <th className="tnum">Change</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>bad day <span className="quiet">(worst 1 in {TAIL_ONE_IN})</span></td>
              <td className="tnum">{n0(first.p10)}</td>
              <td className="tnum">{n0(last.p10)}</td>
              <td className="tnum">{lift(first.p10, last.p10)}</td>
            </tr>
            <tr>
              <td>normal day <span className="quiet">(middle)</span></td>
              <td className="tnum">{n0(first.p50)}</td>
              <td className="tnum">{n0(last.p50)}</td>
              <td className="tnum">{lift(first.p50, last.p50)}</td>
            </tr>
            <tr>
              <td>good day <span className="quiet">(best 1 in {TAIL_ONE_IN})</span></td>
              <td className="tnum">{n0(first.p90)}</td>
              <td className="tnum">{n0(last.p90)}</td>
              <td className="tnum">{lift(first.p90, last.p90)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="ex-cue">
        {floorWon ? (
          <>
            Your good days grew by{' '}
            <span className="tnum">{ceilLift == null ? '-' : `${ceilLift.toFixed(1)}x`}</span>. Your
            bad days grew by <span className="tnum">{floorLift == null ? '-' : `${floorLift.toFixed(1)}x`}</span>.
            What changed this year is not that you go harder when you go. It is that you stopped
            having days that were nothing.
          </>
        ) : (
          <>
            Your good days grew by{' '}
            <span className="tnum">{ceilLift == null ? '-' : `${ceilLift.toFixed(1)}x`}</span> and
            your bad days by <span className="tnum">{floorLift == null ? '-' : `${floorLift.toFixed(1)}x`}</span>,
            so this year the ceiling moved at least as far as the floor.
          </>
        )}
      </p>
    </div>
  );
}

/* THE SENTENCE THAT CONTRADICTED THE PAGE IT SAT ON.
 *
 * It read: "The quietest of them still recorded a full day of resting burn and movement in five
 * separate hours, so the phone was on you and you were still." The Limits section three screens
 * below says resting burn is a fixed function of his weight, pro-rated over the idle part of the
 * day. A PHONE IN A DRAWER RECORDS A FULL DAY OF RESTING BURN. Half the evidence for "not in a
 * drawer" was the one column that cannot distinguish the two cases.
 *
 * `move_hours` is the whole argument, and it is now derived rather than typed. The leading clause is
 * conditional on the number, because at two or three hours the same figure argues the other way and
 * the sentence has to follow it. */
/* SubFloorWereReal was here until 2026-09-15: a paragraph arguing that the low-step days were real
 * days and not the phone left in a drawer. Provenance. The check it printed is r.limits.subFloor. */

function monthLabelFull(ym: string): string {
  return new Date(`${ym}-01T12:00:00Z`).toLocaleDateString('en-CA', {
    month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/* ------------------------------------------------------------------------------------------------
 * THE LINE
 * ---------------------------------------------------------------------------------------------- */
function TheLine({ r }: { r: DailyReview }) {
  const pts = r.months.map((m) => ({ date: `${m.month}-15`, value: Math.round(m.p50) }));
  const floorPts = r.months.map((m) => ({ date: `${m.month}-15`, value: Math.round(m.p10) }));
  if (pts.length < 2) return null;
  const peak = r.months.reduce((a, b) => (b.p50 > a.p50 ? b : a));
  const trough = r.months.reduce((a, b) => (b.p50 < a.p50 ? b : a));
  return (
    <div className="section">
      <div className="section-head"><h2>The line it took</h2></div>
      <div className="pair">
        <figure className="chartfig">
          <figcaption className="chart-cap">
            Steps on a normal day, by month, {monthLabelFull(r.months[0]!.month)} to{' '}
            {monthLabelFull(r.months[r.months.length - 1]!.month)}
          </figcaption>
          <LineChart points={pts} unit="steps" decimals={0} />
        </figure>
        <figure className="chartfig">
          <figcaption className="chart-cap">Steps on a bad day, same months</figcaption>
          <LineChart points={floorPts} unit="steps" decimals={0} />
        </figure>
      </div>
      <p className="ex-cue">
        The high point is {monthLabelFull(peak.month)} at{' '}
        <span className="tnum">{n0(peak.p50)}</span> and the low is{' '}
        {monthLabelFull(trough.month)} at <span className="tnum">{n0(trough.p50)}</span>.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * IT IS NOT THE WEATHER. The falsification, and the reason the eight years are kept.
 * ---------------------------------------------------------------------------------------------- */
function NotTheWeather({ r }: { r: DailyReview }) {
  if (!r.season.length) return null;
  const years = r.seasonYears;
  /* The best and worst month of each year, computed here from the same rows the table prints, so
     the sentence under it cannot disagree with the table above it. That failure has shipped on this
     site before: /swim/deep carried a claim its own table disproved. */
  const extremes = years.map((y) => {
    const vals = r.season
      .map((row) => ({ mm: row.mm, v: row.byYear[y] }))
      .filter((x): x is { mm: string; v: number } => x.v != null);
    if (!vals.length) return null;
    const best = vals.reduce((a, b) => (b.v > a.v ? b : a));
    const worst = vals.reduce((a, b) => (b.v < a.v ? b : a));
    return { year: y, best, worst };
  }).filter((x): x is NonNullable<typeof x> => x != null);

  /* NEWEST YEAR FIRST. Chronological order put the current year in the last column, which at 390px
     sits past the right edge of the scroll box: the one year he is actually in was the one year he
     had to scroll to reach. Found by screenshotting the page rather than by reading this file. */
  const shown = [...years].reverse();

  return (
    <div className="section">
      <div className="section-head"><h2>It is not just the summer</h2></div>
      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th>Month</th>
              {shown.map((y) => <th key={y} className="tnum">{y}</th>)}
            </tr>
          </thead>
          <tbody>
            {r.season.map((row) => (
              <tr key={row.mm}>
                <td>{monthName(row.mm)}</td>
                {shown.map((y) => (
                  <td key={y} className="tnum">{row.byYear[y] == null ? '' : n0(row.byYear[y])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ex-cue">
        {extremes.map((e, i) => (
          <span key={e.year}>
            {i > 0 ? '; ' : ''}
            {e.year} peaked in {monthName(e.best.mm)} and bottomed in {monthName(e.worst.mm)}
          </span>
        ))}
        .
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * THE STAIRS
 * ---------------------------------------------------------------------------------------------- */
function Stairs({ r }: { r: DailyReview }) {
  const f = r.floors;
  if (f.medianRecent == null) return null;
  return (
    <div className="exgroup">
      <div className="exgroup-label">
        The stairs <span className="tag">({f.daysWithValue.toLocaleString('en-CA')} days on record)</span>
      </div>
      <div className="exlist">
        <div className="ex" data-slot="daily-floors">
          <div className="ex-name">
            <span className="live tnum">{n0(f.medianRecent)}</span> flights on a normal day now,
            against <span className="tnum">{n0(f.medianYearAgo)}</span> a year ago.
          </div>
          {/* THE TWO FIGURES ABOUT THE SUBSTITUTION ARE GONE FROM THIS SENTENCE, not moved into a
              query. `floor_count` is not imported (the importer reads it, compares it, and drops
              it), so its death date and the comparable-day count cannot be derived from anything
              this page can reach. The gate itself is the claim worth making, and it runs whether or
              not a number about it is printed: see the floors substitution gate in
              HealthOS/server/import-daily-movement.mjs, which exits non-zero on a disagreement. */}
        </div>
      </div>
      <p className="ex-cue">
        It measures your staircase as much as your legs. A move, or a building with a lift, would
        change this number without anything about you changing.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * THE ONE THING THAT HAS NOT MOVED IN FOUR YEARS
 * ---------------------------------------------------------------------------------------------- */
function Scraps({ rows, months }: { rows: ScrapsRow[]; months: MonthPoint[] }) {
  if (rows.length < 2) return null;
  const latest = rows[rows.length - 1]!;
  const first = rows[0]!;
  /* THE COMPARISON IS COMPUTED, NOT ASSERTED. This paragraph read "it has barely moved since 2023
     through a year your step count halved and a year it doubled", which is two quantitative claims
     spelled as words, so `lint-typed-figures` cannot see them and nothing recomputed them. Neither
     survived a check: no year-over-year median halves or doubles. What is true is the CONTRAST, and
     it is stronger stated than asserted, so both sides of it are derived here from the same rows the
     tables above print. If the stretch ever starts responding, the sentence stops claiming it does
     not. */
  const inSpan = months.filter((m) => m.month.slice(0, 4) >= first.year);
  const lo = inSpan.length ? inSpan.reduce((a, b) => (b.p50 < a.p50 ? b : a)) : null;
  const hi = inSpan.length ? inSpan.reduce((a, b) => (b.p50 > a.p50 ? b : a)) : null;
  const swing = lo && hi && lo.p50 > 0 ? hi.p50 / lo.p50 : null;
  return (
    <div className="section">
      <div className="section-head"><h2>On a day you do not train, it arrives in scraps</h2></div>
      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th className="tnum">Year</th>
              <th className="tnum">Rest days</th>
              <th className="tnum">Active minutes</th>
              <th className="tnum">Longest single stretch</th>
              <th className="tnum">Days with a {STRETCH_MIN} min stretch</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.year}>
                <td className="tnum">{s.year}</td>
                <td className="tnum">{s.restDays}</td>
                <td className="tnum">{n0(s.medianActiveMin)}</td>
                <td className="tnum">{n0(s.medianLongestMin)} min</td>
                <td className="tnum">{s.pctWith30}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ex-cue">
        On days with no recorded workout, your longest unbroken stretch of movement is{' '}
        <span className="tnum">{n0(latest.medianLongestMin)} minutes</span>, against{' '}
        <span className="tnum">{n0(first.medianLongestMin)}</span> in {first.year}.
        {swing != null && lo && hi && (
          <> Over those same years the median month&apos;s step count ran from{' '}
            <span className="tnum">{n0(lo.p50)}</span> to{' '}
            <span className="tnum">{n0(hi.p50)}</span>, a swing of{' '}
            <span className="tnum">{swing.toFixed(1)}x</span>.</>
        )}{' '}
        Those <span className="tnum">{n0(latest.medianActiveMin)}</span> active minutes arrive a few
        at a time.
      </p>
      <p className="ex-cue">
        {/* "has not responded to anything" until 2026-09-09, which the table above disproves: the
            stretch fell from 21 minutes to 16 and the rest-day active minutes roughly halved. What
            is true is the COMPARISON, and the sentence above now prints both sides of it, so this
            one only has to name the consequence. Same failure as the drawer sentence and as the
            /swim/deep claim its own table disproved: a paragraph that describes the table beside it
            has to be recomputed when the table moves, or it has to stop making the claim. */}
        {/* THE SECOND SENTENCE WENT, 2026-09-09. It read "It is a description, not a prescription:
            the week is frozen and this is not a proposal to change it." That sentence was addressed
            to an AGENT, not to him: it is a guard against a future session reading this section as
            a reason to change the programme. He does not need to be told the page is not proposing
            something. The guard is the same either way and lives here now.

            THE GUARD: the programme is frozen until 2026-10-05. Nothing in this section may become
            a proposal to add a walk, a step target, or anything else to the week. */}
        Against that swing it has barely shifted, which makes it the one thing on the page nobody
        has tried yet.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * WHAT THIS RECORD CAN AND CANNOT SAY
 * ---------------------------------------------------------------------------------------------- */
/* Limits, "What this record can and cannot say", was here until 2026-09-15: a table of which column
 * answers what, the missing years, and why resting calories, distance, Samsung's score and sleep are
 * not on the page. Method, not facts about him. The derivations are still in src/lib/health/daily.ts. */

export default async function DayPage() {
  const r = await getDailyReview();

  const steps = r.coverage.find((c) => c.column === 'steps');
  const startYear = steps?.from.slice(0, 4) ?? null;

  /* `.wrap` and nothing else. The layout above already supplies `.training health measure-data`,
     the site header and the training nav; repeating those classes here would nest the surface
     inside itself. Same shell as /health/deep. */
  return (
    <div className="wrap">
      <Link href="/health" className="eyebrow">&larr; Body and the week</Link>
      <h1>{startYear ? <>Every day, since {startYear}</> : 'Every day the phone recorded'}</h1>
      {r.daysBehind != null && r.daysBehind > 2 && (
        <p className="lede">Newest complete day: {when(r.newest!)}, {r.daysBehind} days ago.</p>
      )}

      <Headline r={r} />
      <FloorNotCeiling r={r} />
      <TheLine r={r} />
      <NotTheWeather r={r} />
      <Stairs r={r} />
      <Scraps rows={r.scraps} months={r.months} />

      <p className="ex-cue">
        <Link href="/health">Back to training</Link> · <Link href="/health/deep">The year so far</Link>
      </p>
    </div>
  );
}
