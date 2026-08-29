import Link from 'next/link';
import {
  getBodyCompSeries,
  getBodyCompSummary,
  getLiftingAdherence,
  getSyncLiveness,
  getWatchComposition,
} from '@/lib/health/db';
import { getYearBody } from '@/lib/health/year';
import { splitOf, sameSourcePair } from '@/lib/health/split';
import { loadConditioning, loadProgram, loadMovements, splitName } from '@/lib/gym/program';
import { computeCoverage } from '@/lib/gym/coverage.mts';
import { getTrainingWeek } from '@/lib/gym/week';
import { getRecentSessions } from '@/lib/gym/session';
import { AdherenceStrip, LineChart } from './HealthCharts';
import { RunStanding, RecoveryNotice, PlanWeek, ActualDays } from './Week';
import Volume from './Volume';
import LastSession from '@/components/training/LastSession';
import RecentSessions from '@/components/training/RecentSessions';
import Prose from '@/components/training/Prose';
import { daysAgoText, longDate, shortDate } from '@/lib/format';
import { today } from '@/lib/day';

/* THE INDEX. Rebuilt 2026-08-27, Phase C.
 *
 * /health was a dead end: nothing linked to it and it linked to nothing, while /gym/conditioning
 * held a tab called Overview that answered the one question all four disciplines share. The two
 * were the same page in two places, and the half that mattered was three taps inside a route named
 * after the gym.
 *
 * So the Overview tab moved here whole and this became the index the other four hang off. No sixth
 * /training route to hold the shared state: inventing a route for that is precisely how the
 * duplication being removed today got started.
 *
 * FORCE-DYNAMIC, not the thirty-minute ISR it used to run. Two reasons and the first is enough: a
 * page that reads a query parameter cannot be statically rendered anyway. The second is that the
 * streak on the Now tab is the only number on this site that must be true at the moment he looks,
 * and a cached one that is a day stale reads as a rest day he did not take. Body composition, which
 * the ISR window existed for, moves when he steps on a scale and is on its own tab.
 */
export const dynamic = 'force-dynamic';

/* SAME VOCABULARY AS EVERY OTHER TRAINING ROUTE. `now` and `plan` mean here exactly what they mean
 * on /swim, /run and /bike, so the reader learns the split once. `weight` is the one this route has
 * that the disciplines do not, because a body is not a discipline.
 *
 * The tabs exist for the reason all the others do: measured, not guessed. Stacking the Overview
 * tab's nine blocks on top of this page's charts would have been six phone screens, which is the
 * wall the whole redesign is undoing. */
const TABS = [
  /* 'Weight', NOT 'Body'. The nav chip for this route is already labelled Body, one row above, and
   * two controls a row apart carrying the same word mean two different scopes: the chip is the
   * whole page, the sub-tab is a third of it. Caught by reading the rendered markup rather than the
   * source, which is the only way that kind of collision shows up. It is the same inverted
   * hierarchy GymNav's own comment warned about: "two rows of identical chips meaning two different
   * things, which is the inverted hierarchy that made the blocks unreadable in August."
   *
   * IT IS FIRST, AND IT IS THE DEFAULT, since 2026-08-28. His words: "as soon as I go in, it starts
   * talking about 2 days in a row and the length of the sessions. It doesn't make sense. Redesign
   * all that so it leads with the weight." The hub row for this route shows his weight, so the
   * number he taps and the first thing he was shown were about different subjects; that is the
   * failure, not the streak. The streak is a good block and it is one tap away. */
  { id: 'weight', label: 'Weight' },
  { id: 'now', label: 'Now' },
  { id: 'plan', label: 'Plan' },
  /* 'Volume', added 2026-08-27, and it is the answer to a question he asked three times and got a
   * document for three times: "how all those 4 days add up to volume within one period?" Its own
   * tab rather than a block under Plan, because Plan is already four sections and the wall of text
   * is the thing this whole redesign is undoing. Four chips measured at 390px, not estimated. */
  { id: 'volume', label: 'Volume' },
] as const;

function SubNav({ sub }: { sub: string }) {
  return (
    <div className="subtabs">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={`/health?s=${t.id}`}
          className={`subtab${sub === t.id ? ' on' : ''}`}
          aria-current={sub === t.id ? 'page' : undefined}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

function trendLine(t: { fromDate: string; spanDays: number; kg: number; perWeek: number } | null): string {
  if (!t) return 'not enough history';
  const sign = (n: number) => (n > 0 ? '+' : '');
  return `vs ${t.fromDate} (${t.spanDays} d): ${sign(t.kg)}${t.kg} kg, ${sign(t.perWeek)}${t.perWeek} kg/wk`;
}

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const sp = await searchParams;
  /* THE DEFAULT IS THE FIRST TAB, read off TABS rather than typed. It was the literal 'now', so
     reordering the array would have moved the chips and left the landing tab where it was, which is
     the kind of half-change that ships looking correct. One declaration, two behaviours. */
  const sub = TABS.find((t) => t.id === sp.s)?.id ?? (TABS[0] as (typeof TABS)[number]).id;

  /* One query per thing the OPEN tab actually draws. The body charts are four reads and the week is
     a session scan; running both on every tap would put work in front of a page he opens between
     sets. The sync liveness row is the exception and runs everywhere, because "the mirror stopped"
     invalidates whichever tab he is looking at. */
  const sync = await getSyncLiveness();
  const needWeek = sub === 'now' || sub === 'plan';
  const [conditioning, program] = needWeek
    ? await Promise.all([loadConditioning(), loadProgram()])
    : [null, null];
  const week = conditioning && program ? await getTrainingWeek(program, conditioning) : null;

  /* THE VOLUME TAB READS TWO JSON FILES OFF DISK AND NOTHING ELSE. No Neon round trip, because this
     is what the PROGRAMME asks of him rather than what he did, and the arithmetic is the same code
     scripts/gym-coverage.mjs runs. Two implementations of one computation drift silently, and this
     is a number he will quote back. */
  const volume = sub === 'volume' ? await (async () => {
    const [prog, movements] = await Promise.all([loadProgram(), loadMovements()]);
    const coverage = computeCoverage(prog, movements);
    return {
      coverage,
      dayLabels: coverage.dayOrder.map((k) => {
        const d = prog.days[k as keyof typeof prog.days];
        return d ? splitName(d) : k;
      }),
    };
  })() : null;
  const recentLifts = sub === 'now' ? await getRecentSessions('strength', 10) : [];
  const lastLift = recentLifts[0] ?? null;

  /* ONE read of the series, four charts off it. It used to call getBodyCompSeries TWICE for two
     charts, which was two identical round trips to Neon, and `fat_kg` and `lean_kg` were already in
     every row it fetched and had never been drawn. Counting round trips rather than work is the
     lesson /reading/shelf paid for: this site's entire external-API bill is Neon. */
  const [bodySummary, comp, watchComp, yearBody] =
    sub === 'weight'
      ? await Promise.all([
          getBodyCompSummary(),
          getBodyCompSeries(120),
          getWatchComposition(120),
          /* THE YEAR, ON THE TAB HE OPENS. He asked for it by name on 2026-08-28: "the main number
             that I want to see is the difference between the highest weight that I've had this year
             and the lowest." It is computed by the same function /health/deep uses, not by a second
             copy here, so the two pages cannot print different answers. */
          getYearBody(),
        ])
      : [null, null, null, null];
  const seriesOf = (key: 'kg' | 'bf_pct' | 'fat_kg' | 'lean_kg') =>
    (comp ?? []).filter((r) => r[key] != null).map((r) => ({ date: r.date, value: r[key] as number }));
  const weightSeries = seriesOf('kg');
  const bfSeries = seriesOf('bf_pct');
  const fatSeries = seriesOf('fat_kg');
  const leanSeries = seriesOf('lean_kg');

  /* WHERE THE WEIGHT WENT, and BOTH RULES IT OBEYS NOW LIVE IN src/lib/health/split.ts, because
     /health/deep computes the same thing and a second copy is how a fix reaches one surface and not
     the other. The two incidents behind them, in full, are in that file's header. In short:

     THE PERCENTAGE WAS BUILT TO BREAK ON GOOD NEWS. It was `Math.round((dFat / dKg) * 100)` rendered
     through `Math.abs()`, and it passes 100 or goes negative the moment LEAN MASS MOVES THE OTHER
     WAY FROM WEIGHT, which is exactly the outcome cutting while lifting is meant to produce. 23 of
     the 148 windows this page has drawn print an impossible share, including 233%, and the 34-day
     trend this same tab displays yields 119% right now. So a share is printed only when it IS one.

     AND THE TWO ENDPOINTS MUST COME OFF THE SAME MACHINE. `both[0]` and `both.at(-1)` took whatever
     was at the edges of the window, and the Scale and the Watch disagree about fat mass by up to
     2.45 kg on the same day (09-health P2-3). `sameSourcePair` walks inward until they match, so the
     interval can shorten, which is why the rendered sentence names the two dates it actually used
     rather than the window it asked for. */
  const pair = comp ? sameSourcePair(comp.filter((r) => r.kg != null)) : null;
  const split = pair
    ? (() => {
        const [a, b] = pair;
        if (a.date === b.date) return null;
        const s = splitOf(
          { kg: a.kg as number, fat_kg: a.fat_kg, lean_kg: a.lean_kg },
          { kg: b.kg as number, fat_kg: b.fat_kg, lean_kg: b.lean_kg },
        );
        return s ? { ...s, from: a.date, to: b.date, source: a.source } : null;
      })()
    : null;
  /* ATTENDANCE IS TRAINING, NOT BODY COMPOSITION, so it is read on the Now tab. It sat next to the
     weight charts for as long as /health was only about weight, and the tab split is what made that
     visible: nothing about a 30-cell trained/rested strip answers "what is my body doing". */
  const adherence = sub === 'now' ? await getLiftingAdherence(30) : null;

  const days = adherence?.days ?? [];
  const trainedCount = days.filter((d) => d.trained).length;
  const loggedCount = days.filter((d) => d.trained && d.logged).length;
  /* Counting a day the export never reached as a rest day is the same lie the strip used to draw. */
  const unknownDays = days.filter((d) => !d.known).length;
  const horizon = adherence?.horizon;

  return (
    <div className="wrap">
      <h1>Body and the week</h1>

      <SubNav sub={sub} />

      {/* Two different things can be wrong here and they used to share one sentence.
        *
        * The MIRROR can stop being written, which is a broken pipeline and nothing on this page can
        * be trusted to be current. Or he can simply not have stepped on the scale, which is not a
        * fault at all and the numbers below are still the last true ones. A page that says "stale"
        * for both is doing what /music's collector alarm exists to prevent: letting a dead job look
        * like a quiet week. The sync writes a row every run now, so this can tell them apart.
        *
        * On EVERY tab, because a mirror that stopped invalidates the streak as surely as it
        * invalidates the weight. */}
      {sync.stale && (
        <div className="stale">
          <span className="k">Not syncing</span>
          {sync.lastOkAt
            ? `The mirror behind this page last updated ${daysAgoText(Math.floor((sync.hoursSince ?? 0) / 24))}.`
            : 'The mirror behind this page has never recorded a successful update.'}{' '}
          Everything below is whatever it held at that point, whether or not the laptop has newer
          numbers. Run <code>node content/health/sync.mjs</code> in hoodii-studio-site.
          {sync.lastError && <span className="why">{sync.lastError}</span>}
        </div>
      )}

      {sub === 'now' && week && (
        <>
          <p className="lede">
            Lifting, swimming, running and riding in one count, and how many days in a row you have
            trained. Read from the watch, so a session you never opened an app for still counts.
          </p>

          <RunStanding week={week} />
          <RecoveryNotice week={week} />

          <LastSession s={lastLift} noun="lift" />
          <RecentSessions sessions={recentLifts} kind="strength" nounPlural="lifts" />

          <div className="exgroup">
            <div className="exgroup-label">What actually happened</div>
            <ActualDays week={week} />
          </div>

          {/* THE SAME QUESTION AT A DIFFERENT RESOLUTION, so it is behind a tap rather than under
              the list. The fortnight above names every session and its length. This is a month at a
              glance, and it is the only thing anywhere that separates "trained" from "also logged
              it in the app". Both visible at once is two lists of days stacked, which is the wall
              this redesign exists to remove.

              It used to sit beside the weight charts, and the tab split is what made that look
              wrong: nothing about a trained-or-rested strip answers "what is my body doing". */}
          <details className="exgroup ladder-all">
            <summary className="exgroup-label">
              Attendance, last 30 days <span className="tag">({trainedCount} trained)</span>
            </summary>
            {/* THE TWO HALVES MEASURE DIFFERENT THINGS AND THE CAPTION HAS TO SAY SO.
                Until 2026-08-28 the strip queried lifting only under this exact sentence about the
                watch recording every session, so a day he swam drew as an empty cell labelled "rest".
                Three days in the live window: a 40-minute run and 59 minutes of swimming across two
                other days. "What actually happened", one scroll up, showed all three as trained
                (09-health P1-3). `trained` is any discipline now; `logged` is still lifting only,
                because a missing LOG means missing weights and that gap is the useful one. */}
            <p className="ex-cue">
              Trained is any discipline the watch saw, lifting or swimming or running or riding.
              Logged is lifting typed into the gym app, which is the only place the weights exist.{' '}
              <span className="live tnum">{trainedCount}</span> trained,{' '}
              <span className="tnum">{loggedCount}</span> with the lifting logged
              {trainedCount > loggedCount
                ? `, so ${trainedCount - loggedCount} day${trainedCount - loggedCount === 1 ? '' : 's'} have no weights against them`
                : ''}.
              {unknownDays > 0 && (
                <>
                  {' '}The watch export stops at {horizon ?? 'no date at all'}, so{' '}
                  <span className="tnum">{unknownDays}</span> day{unknownDays === 1 ? '' : 's'} in this
                  window are unknown rather than rest, and those counts cover only the days it reached.
                </>
              )}
            </p>
            <AdherenceStrip days={days} today={today()} />
          </details>
        </>
      )}

      {sub === 'weight' && (
        <>
          {!sync.stale && bodySummary?.stale && (
            <div className="stale">
              <span className="k">No recent measurement</span>
              The sync is running, so this is current: the last time you weighed in was{' '}
              {daysAgoText(bodySummary.daysSinceLatest ?? 0)}, on {bodySummary.latest?.date}. Nothing
              below has moved since then, and the days after it are not rest days, they are days this
              page knows nothing about.
            </div>
          )}

          {/* THE YEAR FIRST, ABOVE THE LAST WEIGH-IN. Both are true and they answer different
              questions: the tile below says where he is, this says how far he has come, and he asked
              for the second one. Above rather than below because a change of this size read after
              three charts is a footnote. Everything in it is derived in src/lib/health/year.ts and
              the working is one tap away rather than stacked here, which is the same split the
              Attendance block already makes. */}
          {yearBody && (
            <div className="yearline">
              <div className="yearline-n tnum">
                {yearBody.deltaKg > 0 ? '+' : ''}{yearBody.deltaKg.toFixed(1)}
                <span className="yearline-u">kg</span>
              </div>
              <div className="yearline-body">
                {/* THE BOLD LINE IS THE DATE RANGE AND NOTHING ELSE, on his instruction, 2026-08-28:
                    "I want the title or the bold text to be the dates ... Without the need for the
                    initial or final weight, I just need the difference between those two points and
                    the dates and that's it. I'm going to screenshot that."

                    So the two lines above and below it are a complete claim on their own: a number
                    and the window it covers. Everything else on this block is context for the page
                    rather than for the picture, and it stays because he said it was fine, not
                    because the headline needs it.

                    Both dates are DERIVED from the readings, so the line cannot drift from the
                    number over it: the next weigh-in moves both together or neither. */}
                <div className="yearline-rule">
                  {longDate(yearBody.peak.date)} to {longDate(yearBody.low.date)}
                </div>
                {/* THE DATES ARE NOT REPEATED HERE. They are the bold line directly above, and
                    printing them again three lines later is the kind of small redundancy he reads
                    as the page not knowing what it is saying. The weights keep their order instead,
                    which is what "down to" means.

                    THE CAVEAT IS TWO DIFFERENT SENTENCES because the peak and the first reading of
                    the year are the same day today and will not always be. While they are the same,
                    the honest thing to say is that the record simply starts there and January is
                    absent; once a heavier reading appears after the first one, that stops being
                    true and the sentence has to change with it. Derived, not chosen. */}
                <p className="ex-cue" style={{ marginTop: 0 }}>
                  <span className="tnum">{yearBody.peak.kg.toFixed(1)} kg</span> down to{' '}
                  <span className="tnum">{yearBody.low.kg.toFixed(1)} kg</span>, which is{' '}
                  <span className="tnum">{yearBody.spanDays}</span> days at{' '}
                  <span className="tnum">
                    {yearBody.kgPerWeek > 0 ? '+' : ''}{yearBody.kgPerWeek.toFixed(2)} kg
                  </span>{' '}
                  a week.{' '}
                  {yearBody.peak.date === yearBody.recordStarts
                    ? `That first date is also the first weigh-in of ${yearBody.year}, so it is where the record starts rather than a peak you climbed to, and whatever you weighed in January is not in this database at all.`
                    : `The first weigh-in of ${yearBody.year} is ${shortDate(yearBody.recordStarts)}, so that is the heaviest reading on record rather than the heaviest you were.`}
                </p>
                <Link href="/health/deep" className="deeplink">
                  The whole year, every measurement &rarr;
                </Link>
              </div>
            </div>
          )}

          <div className="section">
            <div className="section-head"><h2>Weight &amp; body fat</h2></div>
            {bodySummary?.latest ? (
              <>
                <div className="stats">
                  <div>
                    <div className="stat-k">Weight</div>
                    <div className="stat-v">
                      {bodySummary.latest.kg?.toFixed(1)}<span className="stat-u">kg</span>
                    </div>
                    {/* `down` IS EARNED, NOT ASSUMED. It was hardcoded, and `.health .stat-d.down`
                        is `--signal`, the one chromatic colour this site reserves for a value that
                        is true and good right now. He is cutting, so a fall is the good direction
                        and a +0.4 kg/wk regain would have rendered in the same colour as progress.
                        A colour that means "good" whichever way the number moves means nothing.
                        08-ux-ui and 05-small-apps H2. */}
                    <div className={`stat-d${(bodySummary.trend30?.kg ?? 0) < 0 ? ' down' : ''}`}>
                      {trendLine(bodySummary.trend30)}
                    </div>
                  </div>
                  {bodySummary.latest.bf_pct != null && (
                    <div>
                      <div className="stat-k">Body fat</div>
                      <div className="stat-v">
                        {bodySummary.latest.bf_pct.toFixed(1)}<span className="stat-u">%</span>
                      </div>
                      <div className="stat-d">{bodySummary.latest.date}</div>
                    </div>
                  )}
                </div>
                {/* Side by side above 1024, stacked below it, from one grid. The captions arrive with
                    the pairing and are not decoration: stacked, the two charts were told apart by the
                    unit on a single endpoint label, and read side by side that stops being enough. */}
                <div className="pair">
                  <figure className="chartfig">
                    <figcaption className="chart-cap">Weight, kg</figcaption>
                    <LineChart points={weightSeries ?? []} unit="kg" decimals={1} />
                  </figure>
                  {(bfSeries?.length ?? 0) > 1 && (
                    <figure className="chartfig">
                      <figcaption className="chart-cap">Body fat, %</figcaption>
                      <LineChart points={bfSeries ?? []} unit="%" decimals={1} />
                    </figure>
                  )}
                </div>
              </>
            ) : (
              <p className="empty">No body composition data yet.</p>
            )}
          </div>

          {/* SIX OF EIGHT COLUMNS WERE MIRRORED AND NEVER DRAWN. fat_kg and lean_kg were already in
              every row getBodyCompSeries fetched; skeletal muscle, water and BMR needed a
              watch-only read, because a scale reading does not carry them at all.

              Lean mass is not decoration. HealthOS computes the protein target FROM it, so it has
              been load-bearing and invisible at the same time. The target itself stays in
              HealthOS/CURRENT.md: this draws the shape, it does not restate the number. */}
          {fatSeries.length > 1 && leanSeries.length > 1 && (
            <div className="section">
              <div className="section-head"><h2>Where the weight went</h2></div>
              {split && (
                <p className="lede" style={{ marginTop: 0, marginBottom: 14 }}>
                  {/* "your weight", not "the scale". This page names Scale and Watch as different
                      sources two sections down, and both endpoints of this delta are usually Watch
                      readings. Saying "the scale" on the one page that draws that distinction is
                      the kind of small wrongness that teaches a reader the labels do not mean
                      anything. */}
                  Between {split.from} and {split.to} your weight moved{' '}
                  <span className="live tnum">{split.dKg > 0 ? '+' : ''}{split.dKg.toFixed(1)} kg</span>:{' '}
                  <span className="tnum">{split.dFat > 0 ? '+' : ''}{split.dFat.toFixed(1)}</span> of that
                  was fat and <span className="tnum">{split.dLean > 0 ? '+' : ''}{split.dLean.toFixed(1)}</span> was
                  lean
                  {split.fatShare != null && `, so ${split.fatShare}% of the change was fat`}
                  {/* The case the percentage could not express, and it is the good one. Said in words
                      because "119% of the change was fat" is what the arithmetic produced here and it
                      is not a sentence about anything. */}
                  {split.fatShare == null && split.leanOpposed && split.dKg < 0
                    && `, so all of the loss was fat and the lean line ${split.dLean > 0 ? 'went up' : 'held'}`}
                  {split.fatShare == null && split.leanOpposed && split.dKg > 0
                    && `, so the gain was not fat and the fat line ${split.dFat < 0 ? 'went down' : 'held'}`}
                  .{' '}
                  {/* THE ENDPOINTS' INSTRUMENT, NAMED. Both ends are the same machine by
                      construction now, and the section two below draws the Scale/Watch distinction,
                      so leaving the reader to assume which one this was is the small wrongness that
                      teaches them the labels mean nothing. */}
                  Both readings are {split.source.toLowerCase()} readings.{' '}
                  {/* THE OLD SENTENCE HERE WAS A TAUTOLOGY SOLD AS A CHECK. It read "fat mass plus
                      lean mass equals weight exactly, so this is arithmetic rather than a model", and
                      that identity holds because the columns are DEFINED that way: `fat_kg` is
                      `kg * bf_pct / 100` on 196 of 197 rows and `lean_kg` is `kg - fat_kg` on all 197
                      (09-health P1-2). One measurement restated twice cannot disagree with itself, so
                      the agreement was evidence of nothing, and the caveat two paragraphs below
                      already says both lines are inferred from a bioimpedance reading. A reassurance
                      that cannot fail is worse than none: it invites trust the numbers have not
                      earned. */}
                  {/* "the same reading", NOT "the same scale reading". The clause above now names
                      the instrument, and on a watch pair the two sentences contradicted each other
                      one line apart. Caught by reading the rendered page, which is the only thing
                      that ever catches this class. */}
                  Both figures come from that same reading, so they add up by construction rather
                  than by agreement.
                </p>
              )}
              <div className="pair">
                <figure className="chartfig">
                  <figcaption className="chart-cap">Fat mass, kg</figcaption>
                  <LineChart points={fatSeries} unit="kg" decimals={1} />
                </figure>
                <figure className="chartfig">
                  <figcaption className="chart-cap">Lean mass, kg</figcaption>
                  <LineChart points={leanSeries} unit="kg" decimals={1} />
                </figure>
              </div>
              {/* THE CAVEAT THAT OUTRANKS THE SPLIT. Neither of those two lines is measured. Both
                  are inferred from a bioimpedance reading, a small current through the body, and
                  that reading moves with hydration. A kilo off the lean line across a few weeks is
                  as likely to be water as muscle, and the set log is the better witness. */}
              <p className="ex-cue">
                Neither line is measured directly. Both are inferred from a bioimpedance reading, a
                small current passed through the body, and that reading moves with how hydrated you
                were that morning. Treat a kilo of lean movement over a few weeks as possibly water.
                If the weights on the bar went up over the same period, the muscle did not leave.
              </p>
            </div>
          )}

          {/* WATCH ONLY, and the section says so rather than letting a line quietly skip scale days. */}
          {(watchComp?.length ?? 0) > 1 && (
            <div className="section">
              <div className="section-head"><h2>What only the watch sees</h2></div>
              <p className="lede" style={{ marginTop: 0, marginBottom: 14 }}>
                Skeletal muscle and total body water are recorded on watch readings and not on scale
                readings, so these two are drawn from{' '}
                <span className="tnum">{watchComp?.length}</span> watch readings alone and the scale
                days are absent rather than guessed at.
                {watchComp?.at(-1)?.bmr_cal != null && (
                  <>
                    {' '}Resting burn on the newest of them was{' '}
                    <span className="tnum">{watchComp?.at(-1)?.bmr_cal}</span> cal a day.
                  </>
                )}
              </p>
              <div className="pair">
                <figure className="chartfig">
                  <figcaption className="chart-cap">Skeletal muscle, kg</figcaption>
                  <LineChart
                    points={(watchComp ?? [])
                      .filter((r) => r.skm_kg != null)
                      .map((r) => ({ date: r.date, value: r.skm_kg as number }))}
                    unit="kg"
                    decimals={1}
                  />
                </figure>
                <figure className="chartfig">
                  <figcaption className="chart-cap">Total body water, kg</figcaption>
                  <LineChart
                    points={(watchComp ?? [])
                      .filter((r) => r.water_kg != null)
                      .map((r) => ({ date: r.date, value: r.water_kg as number }))}
                    unit="kg"
                    decimals={1}
                  />
                </figure>
              </div>
            </div>
          )}
        </>
      )}

      {sub === 'volume' && volume && (
        <Volume coverage={volume.coverage} dayLabels={volume.dayLabels} />
      )}

      {sub === 'plan' && week && conditioning && (
        <>
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

          {/* WHY FOUR THINGS AND NOT ONE. He asked twice and it had never been answered anywhere he
              could see: "If this translates into the swimming, how does the running on the bike
              complement that?" The answer was already sourced in the evidence file and had simply
              never reached a page, which is the same reason he said the programme reads as
              arbitrary. Behind a tap because it is read once and then believed, not consulted. */}
          {conditioning.week?.howItFits && (
            <details className="exgroup ladder-all">
              <summary className="exgroup-label">
                {conditioning.week.howItFits.title}{' '}
                <span className="tag">({conditioning.week.howItFits.points.length})</span>
              </summary>
              <p className="ex-cue">{conditioning.week.howItFits.lead}</p>
              <div className="exlist">
                {conditioning.week.howItFits.points.map((pt) => (
                  <div className="ex" key={pt.claim}>
                    <div className="ex-name">{pt.claim}</div>
                    <div className="ex-cue">{pt.detail}</div>
                    <div className="ex-cue quiet-inline">{pt.source}</div>
                  </div>
                ))}
              </div>
              <p className="ex-cue">{conditioning.week.howItFits.sourceNote}</p>
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
                <div className="ex-cue">{conditioning.week?.restRule?.whenItFires}</div>
                <div className="ex-cue">{conditioning.week?.restRule?.theHonestCaveat}</div>
              </div>
            </div>
            {/* `.wk` lifts the tap target to 44px. Bare `.src` summaries are 32px on purpose across
                this site, which is fine for the tertiary "where this came from" citations under a
                cue, but this one is the main way to read why the rule has the shape it has. */}
            <details className="src wk">
              <summary>What counts as a training day, and why a rule instead of a fixed day off</summary>
              <div className="src-body">
                <Prose text={conditioning.week?.restRule?.whatCountsAsTraining ?? ''} />
                <Prose text={conditioning.week?.restRule?.whyThisShape ?? ''} />
              </div>
            </details>
          </div>

          <div className="exgroup">
            <div className="exgroup-label">When things happen</div>
            <div className="exlist">
              <div className="ex">
                <div className="ex-name">{conditioning.slots.morning.name}</div>
                <div className="ex-cue">{conditioning.slots.morning.what}</div>
              </div>
              <div className="ex">
                <div className="ex-name">{conditioning.slots.evening.name}</div>
                <div className="ex-cue">{conditioning.slots.evening.what}</div>
              </div>
              <div className="ex">
                <div className="ex-name">Pool times</div>
                <div className="ex-cue">
                  {Object.entries(conditioning.slots.poolTimes)
                    .filter(([k]) => !k.startsWith('$'))
                    .map(([, v]) => v)
                    .join(' · ')}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
