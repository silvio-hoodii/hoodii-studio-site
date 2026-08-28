import Link from 'next/link';
import {
  getBodyCompSeries,
  getBodyCompSummary,
  getLiftingAdherence,
  getSyncLiveness,
  getWatchComposition,
} from '@/lib/health/db';
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
import { daysAgoText } from '@/lib/format';
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
  { id: 'now', label: 'Now' },
  /* 'Weight', NOT 'Body'. The nav chip for this route is already labelled Body, one row above, and
   * two controls a row apart carrying the same word mean two different scopes: the chip is the
   * whole page, the sub-tab is a third of it. Caught by reading the rendered markup rather than the
   * source, which is the only way that kind of collision shows up. It is the same inverted
   * hierarchy GymNav's own comment warned about: "two rows of identical chips meaning two different
   * things, which is the inverted hierarchy that made the blocks unreadable in August." */
  { id: 'weight', label: 'Weight' },
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
  const sub = TABS.find((t) => t.id === sp.s)?.id ?? 'now';

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
  const [bodySummary, comp, watchComp] =
    sub === 'weight'
      ? await Promise.all([getBodyCompSummary(), getBodyCompSeries(120), getWatchComposition(120)])
      : [null, null, null];
  const seriesOf = (key: 'kg' | 'bf_pct' | 'fat_kg' | 'lean_kg') =>
    (comp ?? []).filter((r) => r[key] != null).map((r) => ({ date: r.date, value: r[key] as number }));
  const weightSeries = seriesOf('kg');
  const bfSeries = seriesOf('bf_pct');
  const fatSeries = seriesOf('fat_kg');
  const leanSeries = seriesOf('lean_kg');

  /* WHERE THE WEIGHT WENT, and it is exact arithmetic rather than a model: fat mass plus lean mass
     equals weight to the decimal on every row (29.98 + 73.72 = 103.70, checked). Taken between the
     first and last readings in the window that carry BOTH, so the two deltas always describe the
     same interval as the weight delta does. */
  const split = (() => {
    const both = (comp ?? []).filter((r) => r.fat_kg != null && r.lean_kg != null && r.kg != null);
    const a = both[0];
    const b = both[both.length - 1];
    if (!a || !b || a.date === b.date) return null;
    const dFat = (b.fat_kg as number) - (a.fat_kg as number);
    const dLean = (b.lean_kg as number) - (a.lean_kg as number);
    const dKg = (b.kg as number) - (a.kg as number);
    /* Only stated while the weight is actually moving. A share of a delta near zero is a very large
       percentage of nothing. */
    const fatShare = Math.abs(dKg) > 1 ? Math.round((dFat / dKg) * 100) : null;
    return { from: a.date, to: b.date, dFat, dLean, dKg, fatShare };
  })();
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

          <LastSession s={lastLift} />
          <RecentSessions sessions={recentLifts} kind="strength" />

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
            <p className="ex-cue">
              Read from the watch, which records every session: the gym app only sees sessions
              logged there. <span className="live tnum">{trainedCount}</span> trained,{' '}
              <span className="tnum">{loggedCount}</span> also logged
              {trainedCount > loggedCount ? `, ${trainedCount - loggedCount} trained but unlogged` : ''}.
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
                  lean{split.fatShare != null ? `, so ${Math.abs(split.fatShare)}% of the change was fat` : ''}.
                  Fat mass plus lean mass equals weight exactly, so this is arithmetic rather than a model.
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
