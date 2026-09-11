import Link from 'next/link';
import { loadSwimPlan, loadSwimCoaching, loadSwimTeaching } from '@/lib/swim/content';
import { getSwimBaseline, type SwimBaseline } from '@/lib/swim/db';
import { getSwimYear, LENGTH_MIN_MS, LENGTH_MAX_MS, type SwimYear, type SwimSummary } from '@/lib/swim/deep';
import {
  loadSwimStandards, getSwimPbs, standingFor, ratedDistances, fmtTime, tierTimeMs,
  type SwimStandards, type DistanceStanding,
} from '@/lib/swim/level';
import { getRecentSessions, mmss, type SessionDetail } from '@/lib/gym/session';
import { BarChart } from '../health/HealthCharts';
import BaselineForm from './BaselineForm';
import LastSession from '@/components/training/LastSession';
import { Trace } from '@/components/training/SessionCharts';
import Prose from '@/components/training/Prose';
import Cues from '@/components/training/Cues';
import { shortDate } from '@/lib/format';
import { today } from '@/lib/day';
import type { SwimPlan, SwimCoaching, SwimTeaching, SourceQuote, SwimSource } from '@/lib/swim/types';

export const dynamic = 'force-dynamic';

/* Rebuilt 2026-09-11 on his ask for insight over text: every figure here is derived, and each tab
   pays only for its own reads. Five chips, because a sixth overflows 390px; records and the whole
   record are routes. */
const SUB_TABS = [
  { id: 'now', label: 'Now' },
  { id: 'plan', label: 'Plan' },
  { id: 'how', label: 'How' },
  { id: 'me', label: 'Coach me' },
  { id: 'teach', label: 'Coach them' },
] as const;

/** The distances with a personal best, in the level table. */
const LEVEL_DISTANCES = [100, 200, 400, 1500];

/** A piece this long counts as a long piece on the How and Coach me tabs. */
const LONG_PIECE_M = 300;

/** The distance in plan.json's goal, which the Plan tab counts his swim days against. */
const GOAL_M = 1000;

function SubNav({ sub }: { sub: string }) {
  return (
    <div className="subtabs">
      {SUB_TABS.map((t) => (
        <Link
          key={t.id}
          href={t.id === 'now' ? '/swim' : `/swim?s=${t.id}`}
          className={`subtab${sub === t.id ? ' on' : ''}`}
          aria-current={sub === t.id ? 'page' : undefined}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Swimming pace per 100 m, rest excluded. */
function per100(seconds: number, metres: number): string {
  return metres > 0 ? mmss(seconds / (metres / 100)) : '-';
}

const newestFirst = (a: { date: string }, b: { date: string }) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

/** "Your number plus 100 m" becomes "500 m" once a number exists. The relative wording stays in the data. */
function resolvePiece(piece: string, base: number | null): string {
  if (!base) return piece;
  return piece
    .replace(/your number plus (\d+) m/gi, (_m, n) => `${base + Number(n)} m`)
    // Floored at 100 m: a small number once made the week 7 to 8 rung resolve to 0 m.
    .replace(/your number minus (\d+) m/gi, (_m, n) => `${Math.max(100, base - Number(n))} m`)
    .replace(/your number/gi, `${base} m`);
}

interface Rung {
  week: number;
  weeks: string;
  piece: string;
  rest: string;
}

/** The ladder row he is on, counted in weeks from the day his number was set. */
function currentRung(plan: SwimPlan, baseline: SwimBaseline | null): Rung | null {
  if (!baseline) return null;
  const days = Math.floor((Date.parse(today()) - Date.parse(baseline.measuredOn)) / 86_400_000);
  const week = Math.max(1, Math.floor(days / 7) + 1);
  for (const r of plan.structure.ladder) {
    const m = /^(\d+)\s*(?:to\s*(\d+)|on)$/i.exec(r.weeks.trim());
    if (!m) continue;
    const lo = Number(m[1]);
    const hi = m[2] ? Number(m[2]) : Number.POSITIVE_INFINITY;
    if (week >= lo && week <= hi) {
      return { week, weeks: r.weeks, piece: resolvePiece(r.piece, baseline.metres), rest: r.rest };
    }
  }
  return null;
}

function lastSwimLine(s: SwimSummary | null): string | null {
  if (!s) return null;
  if (s.stops === 0) return `${s.metres.toLocaleString('en-CA')} m in one piece, no stops.`;
  return `Longest piece ${s.longestM} m. ${s.stops} ${s.stops === 1 ? 'stop' : 'stops'}, ${mmss(s.stoppedS)} standing in all.`;
}

/* ---------------------------------------------------------------------------------------------- */

function LastSwims({ rows }: { rows: SwimSummary[] }) {
  if (!rows.length) return null;
  return (
    <div className="table-scroll">
      <table className="plan-table">
        <thead>
          <tr>
            <th>Date</th>
            <th className="tnum">Swum</th>
            <th className="tnum">Longest</th>
            <th className="tnum">Stops</th>
            <th className="tnum">Pace/100</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.uuid}>
              <td>{shortDate(r.date)}</td>
              <td className="tnum">{r.metres.toLocaleString('en-CA')} m</td>
              <td className="tnum">{r.longestM} m</td>
              <td className="tnum">{r.stops}</td>
              <td className="tnum">{per100(r.swimS, r.metres)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Toward1000({ year, baseline, plan }: { year: SwimYear; baseline: SwimBaseline | null; plan: SwimPlan }) {
  const s = year.summaries;
  if (!s.length) return null;
  const last = s.slice(-10);
  const before = s.slice(-20, -10);
  const top = year.pieces[0] ?? null;
  const rung = currentRung(plan, baseline);
  const typical = (xs: number[]) => {
    const m = median(xs);
    return m == null ? null : Math.round(m);
  };
  const lastLongest = typical(last.map((x) => x.longestM));
  const lastStops = typical(last.map((x) => x.stops));
  const prevLongest = typical(before.map((x) => x.longestM));
  const prevStops = typical(before.map((x) => x.stops));
  const bestRecent = Math.max(...last.map((x) => x.longestM));
  return (
    <div className="exgroup">
      <div className="exgroup-label">Toward 1,000 m unbroken</div>
      {rung && baseline && (
        <p className="ex-cue" style={{ marginTop: 0 }}>
          <b>This week: {rung.piece}</b>, rest {rung.rest}. Week {rung.week} of the ladder from your
          number, {baseline.metres} m, set {shortDate(baseline.measuredOn)}.
        </p>
      )}
      <div className="stats">
        {top && (
          <div>
            <div className="stat-k">Longest this year</div>
            <div className="stat-v">{top.metres}<span className="stat-u">m</span></div>
            <div className="stat-d">{shortDate(top.date)}, in {mmss(top.seconds)}</div>
          </div>
        )}
        <div>
          <div className="stat-k">Best, last {last.length}</div>
          <div className="stat-v">{bestRecent}<span className="stat-u">m</span></div>
          <div className="stat-d">longest piece</div>
        </div>
        {lastStops != null && (
          <div>
            <div className="stat-k">Stops a swim</div>
            <div className="stat-v">{lastStops}</div>
            <div className="stat-d">typical, last {last.length}</div>
          </div>
        )}
      </div>
      <p className="ex-meta" style={{ marginTop: 14 }}>
        Longest unbroken piece, every swim in {today().slice(0, 4)}
      </p>
      <BarChart points={s.map((x) => ({ date: x.date, value: x.longestM }))} unit="m" />
      {lastLongest != null && lastStops != null && prevLongest != null && prevStops != null && (
        <p className="ex-cue" style={{ marginTop: 10 }}>
          Your last {last.length} swims: a typical longest piece of <b>{lastLongest} m</b> and{' '}
          <b>{lastStops} stops</b>. The {before.length} before: {prevLongest} m and {prevStops}.
        </p>
      )}
      <LastSwims rows={[...last].reverse()} />
    </div>
  );
}

function SwimLevel({ standards, standings }: { standards: SwimStandards; standings: DistanceStanding[] }) {
  const mine = new Map(standings.filter((x) => x.best).map((x) => [x.distanceM, x]));
  const dists = LEVEL_DISTANCES.filter((d) => mine.has(d));
  if (!dists.length) return null;
  const tiers = standards.tiers.filter((t) => dists.some((d) => tierTimeMs(t, d, standards.tiers) != null));
  const closest = [...mine.values()]
    .filter((x) => x.next && x.best)
    .sort((a, b) => a.next!.gapMs / a.best!.durationMs - b.next!.gapMs / b.best!.durationMs)[0];
  const bests = dists.map((d) => mine.get(d)!.best!);
  return (
    <div className="exgroup">
      <div className="exgroup-label">
        Your level <span className="tag">(men {standards.meta.ageGroup}, 25 m pool)</span>
      </div>
      {closest?.next && closest.best && (
        <p className="ex-cue" style={{ marginTop: 0 }}>
          Closest to moving up: <b>{closest.next.name} at {closest.distanceM.toLocaleString('en-CA')} m</b>,{' '}
          {(closest.next.gapMs / 1000).toFixed(1)} s away, which is{' '}
          {(closest.next.gapMs / 1000 / (closest.distanceM / 100)).toFixed(1)} s per 100 m.
        </p>
      )}
      <div className="table-scroll">
        <table className="plan-table level-table">
          <thead>
            <tr>
              <th>Level</th>
              {dists.map((d) => (
                <th className="tnum" key={d}>{d.toLocaleString('en-CA')} m</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t.id}>
                <td>{t.name}{t.provenance === 'constructed' ? '*' : ''}</td>
                {dists.map((d) => {
                  const ms = tierTimeMs(t, d, standards.tiers);
                  const met = mine.get(d)?.tierId === t.id;
                  return (
                    <td key={d} className={`tnum${met ? ' met' : ''}`}>{ms != null ? fmtTime(ms) : '-'}</td>
                  );
                })}
              </tr>
            ))}
            <tr className="you">
              <td>You</td>
              {bests.map((b) => (
                <td className="tnum" key={b.distanceM}>{fmtTime(b.durationMs)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="ex-meta">
        Underlined: the level each best reaches. Set{' '}
        {bests.map((b) => `${shortDate(b.achievedOn)} (${b.distanceM.toLocaleString('en-CA')} m)`).join(', ')}.
        Levels are race times, one swim with no stops. *Our own rung, the rest are published.
      </p>
      <details className="src">
        <summary>Where the levels come from</summary>
        <div className="src-body">
          {standards.sources.map((src) => (
            <p key={src.id}>
              <a href={src.url} target="_blank" rel="noreferrer">{src.label}</a>
            </p>
          ))}
        </div>
      </details>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */

/** Swim days, oldest first. A morning and an evening swim on one date are one day's distance. */
function swimDays(s: SwimSummary[]): { date: string; metres: number; longestM: number }[] {
  const byDay = new Map<string, { date: string; metres: number; longestM: number }>();
  for (const x of s) {
    const d = byDay.get(x.date) ?? { date: x.date, metres: 0, longestM: 0 };
    d.metres += x.metres;
    d.longestM = Math.max(d.longestM, x.longestM);
    byDay.set(x.date, d);
  }
  return [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function PlanTab({ plan, baseline, year }: { plan: SwimPlan; baseline: SwimBaseline | null; year: SwimYear | null }) {
  const rung = currentRung(plan, baseline);
  /* Derived since 2026-09-11. The typed line said "about 1,000 m every time" while three of his
     last ten swims were under 1,000 m. */
  const days = year ? swimDays(year.summaries).slice(-10) : [];
  const reached = days.filter((d) => d.metres >= GOAL_M).length;
  const longest = Math.max(0, ...days.map((d) => d.longestM));
  return (
    <div className="exgroup">
      <div className="exgroup-label">
        {plan.title} <span className="tag">({plan.sessionsPerWeek})</span>
      </div>
      <div className="exlist">
        <div className="ex">
          <div className="ex-name">{plan.theGoal.target}</div>
          <div className="ex-cue">{plan.theGoal.whatThatActuallyIs}</div>
          {days.length > 0 && (
            <div className="ex-cue">
              {reached} of your last {days.length} swim days reached {GOAL_M.toLocaleString('en-CA')} m.
              The longest piece in any of them: {longest} m.
            </div>
          )}
        </div>
      </div>
      {rung && baseline && (
        <p className="ex-cue">
          <b>This week: {rung.piece}</b>, rest {rung.rest}. Your number is {baseline.metres} m, set{' '}
          {shortDate(baseline.measuredOn)}.
        </p>
      )}
      <p className="lede">{plan.structure.note}</p>
      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th className="tnum">Weeks</th>
              <th className="wide">Continuity piece</th>
              <th>Rest</th>
            </tr>
          </thead>
          <tbody>
            {plan.structure.ladder.map((s) => {
              const on = rung?.weeks === s.weeks;
              return (
                <tr key={s.weeks} className={on ? 'now' : undefined}>
                  <td className="tnum">{s.weeks}{on ? ', now' : ''}</td>
                  <td>
                    {resolvePiece(s.piece, baseline?.metres ?? null)}
                    {s.note && <div className="quiet">{s.note}</div>}
                  </td>
                  <td>{s.rest}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details className="src wk">
        <summary>{plan.structure.calibration.name}</summary>
        <div className="src-body">
          <p>{plan.structure.calibration.what}</p>
          <p><b>The test.</b> {plan.structure.calibration.test}</p>
          <BaselineForm current={baseline} />
        </div>
      </details>
    </div>
  );
}

/** Every length time of a session, inside the plausible band the rest of /swim uses. */
function lengthSeconds(s: SessionDetail): number[] {
  return (s.series.lengths ?? []).map((l) => l.s).filter((x) => x * 1000 >= LENGTH_MIN_MS && x * 1000 <= LENGTH_MAX_MS);
}

function HowTab({ plan, year, recent }: { plan: SwimPlan; year: SwimYear; recent: SessionDetail[] }) {
  const long = year.pieces.filter((p) => p.metres >= LONG_PIECE_M).sort(newestFirst).slice(0, 3);
  const last = recent[0] ?? null;
  /* The pace cue's arithmetic, done: his last middle length plus the plan's seconds. The cue told
     him to work this out at the pool. */
  const mid = last ? median(lengthSeconds(last)) : null;
  const usual = median(recent.flatMap(lengthSeconds));
  const add = plan.theOneTechniqueChange.addSeconds;
  return (
    <div className="exgroup">
      <div className="exgroup-label">Swimming the continuity piece</div>
      <div className="exlist">
        <div className="ex">
          <div className="ex-name">Pace</div>
          <div className="ex-cue">{plan.theOneTechniqueChange.what} {plan.theOneTechniqueChange.why}</div>
          {last && mid != null && (
            <div className="ex-cue">
              <b>Target: {(mid + add).toFixed(1)} s a length.</b> Your middle length on{' '}
              {shortDate(last.date)} was {mid.toFixed(1)} s, plus {add}.
            </div>
          )}
          {long.length > 0 && usual != null && (
            <div className="ex-cue">
              Your usual length over the last {recent.length} swims: {usual.toFixed(1)} s. Your last
              pieces of {LONG_PIECE_M} m or more:{' '}
              {long.map((p) => `${p.metres} m at ${(p.seconds / p.lengths).toFixed(1)} s on ${shortDate(p.date)}`).join('; ')}.
            </div>
          )}
        </div>
        <div className="ex">
          <div className="ex-name">Pull buoy</div>
          <div className="ex-cue">{plan.pullBuoyRule}</div>
        </div>
      </div>
      <Cues cues={plan.cues ?? []} note={plan.cuesNote} heading="In the water" intro="" />
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */

/** The source's own sentences under a cue, then the pages they came from. */
function Quotes({ quotes, sources }: { quotes: SourceQuote[]; sources: Map<string, SwimSource> }) {
  if (!quotes.length) return null;
  const pages = [...new Set(quotes.map((q) => q.source))]
    .map((id) => sources.get(id))
    .filter((x): x is SwimSource => x != null);
  return (
    <div className="stale cue-quote">
      <span className="k">Their words</span>
      {quotes.map((q) => (
        <p className="ex-cue" key={q.text}>&ldquo;{q.text}&rdquo;</p>
      ))}
      {pages.map((src) => (
        <a key={src.id} className="tier-src" href={src.url} target="_blank" rel="noreferrer">{src.label}</a>
      ))}
    </div>
  );
}

/** Mean heart rate over each length of a swim, one value per length.
 *
 *  The stored trace is thinned to about 120 points across the whole recording (see
 *  HealthOS/server/import-session-detail.mjs), so a length holds a few of them. They are spread over
 *  the lengths-plus-rest timeline rather than the session clock, because the rest carries the watch
 *  pauses and the session clock does not. Good for the shape of a piece, not for a single number. */
function hrPerLength(s: SessionDetail): number[] {
  const L = s.series.lengths ?? [];
  const hr = s.series.hr ?? [];
  if (!L.length || !hr.length) return [];
  const span = Math.max((s.minutes ?? 0) * 60, L.reduce((a, l) => a + l.s + (l.rest || 0), 0));
  const step = span / hr.length;
  let t = 0;
  let prev = 0;
  return L.map((l) => {
    const a = Math.floor(t / step);
    const b = Math.max(a + 1, Math.floor((t + l.s) / step));
    t += l.s + (l.rest || 0);
    const seg = hr.slice(a, b).filter((x) => x > 0);
    prev = seg.length ? Math.round(mean(seg)) : prev;
    return prev;
  });
}

/** A heart rate this far under the swim's own peak, at the end of a piece, says the heart was not
 *  what ended it. 15 bpm is well outside the wobble of a few wrist readings per length. */
const HR_HEADROOM = 15;

function CoachMe({ c, year, recent }: { c: SwimCoaching; year: SwimYear; recent: SessionDetail[] }) {
  const sources = new Map(c.sources.map((s) => [s.id, s]));
  const byUuid = new Map(recent.map((s) => [s.uuid, s]));
  const usual = median(recent.map((s) => s.avgCycles).filter((x): x is number => x != null));
  const long = year.pieces
    .filter((p) => p.metres >= LONG_PIECE_M && (byUuid.get(p.uuid)?.series.lengths?.length ?? 0) >= p.lastIndex)
    .sort(newestFirst)
    .slice(0, 2);
  return (
    <>
      <div className="exgroup">
        <div className="exgroup-label">What your swims say</div>
        {usual != null && (
          <p className="ex-cue" style={{ marginTop: 0 }}>
            Your usual stroke count is <b>{usual.toFixed(1)} cycles a length</b>, over your last{' '}
            {recent.length} swims.
          </p>
        )}
        {long.map((p) => {
          const s = byUuid.get(p.uuid) as SessionDetail;
          const cycles = (s.series.lengths ?? []).slice(p.firstIndex - 1, p.lastIndex).map((l) => l.c);
          const hr = hrPerLength(s).slice(p.firstIndex - 1, p.lastIndex);
          const tail = cycles.slice(-4);
          const head = cycles.slice(0, -4);
          const hrEnd = hr.length >= 4 ? Math.round(mean(hr.slice(-4))) : null;
          const said = c.yourWords?.find((w) => w.date === p.date && w.metres === p.metres);
          return (
            <div key={`${p.uuid}-${p.firstIndex}`}>
              <Trace
                values={cycles}
                label={`${p.metres} m on ${shortDate(p.date)}, strokes per length`}
                unit="cycles"
                over="that piece"
              />
              {head.length > 0 && (
                <p className="ex-cue">
                  Last {tail.length} lengths: {mean(tail).toFixed(1)} cycles, against {mean(head).toFixed(1)} before.{' '}
                  {mean(tail) - mean(head) >= 0.5 ? 'The count climbed before the piece ended.' : 'The count held to the end.'}
                </p>
              )}
              {hr.length > 0 && <Trace values={hr} label="Heart rate per length" unit="bpm" over="that piece" />}
              {hrEnd != null && s.maxHr != null && (
                <p className="ex-cue">
                  Last 4 lengths: {hrEnd} bpm. This swim&rsquo;s peak: {s.maxHr} bpm.
                  {s.maxHr - hrEnd >= HR_HEADROOM ? ' Your heart was well under its peak when the piece ended.' : ''}
                </p>
              )}
              {said && (
                <p className="ex-cue"><b>You, {shortDate(said.on)}:</b> {said.said}</p>
              )}
            </div>
          );
        })}
        {long.length > 0 && (
          <p className="ex-meta">
            Heart rate is the watch on your wrist, in water, a few readings per length. Read the shape,
            not the exact number.
          </p>
        )}
      </div>
      {c.groups.map((g) => (
        <div className="exgroup" key={g.id}>
          <div className="exgroup-label">{g.name}</div>
          <div className="cuelist">
            {g.items.map((k) => (
              <details className="cue" key={k.id}>
                <summary><span className="cue-name">{k.name}</span></summary>
                <div className="cue-body">
                  <div className="ex-cue"><b>Do.</b> {k.do}</div>
                  {/* "Ask yourself" since 2026-09-11, and the cards were rewritten as questions with
                      it: "what questions should I ask myself ... while I swim". A test you run on
                      yourself mid-length is the only kind of feedback he has in the water. */}
                  <div className="ex-meta cue-test"><b>Ask yourself.</b> {k.check}</div>
                  <Quotes quotes={k.quotes} sources={sources} />
                </div>
              </details>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function CoachThem({ t }: { t: SwimTeaching }) {
  const sources = new Map(t.sources.map((s) => [s.id, s]));
  return (
    <>
      <div className="exgroup">
        <div className="stale">
          <span className="k">{t.beforeYouStart.title}</span>
          <Prose text={t.beforeYouStart.body} />
        </div>
      </div>
      {t.groups.map((g) => (
        <div className="exgroup" key={g.id}>
          <div className="exgroup-label">{g.name}</div>
          <div className="cuelist">
            {g.items.map((it) => (
              <details className="cue" key={it.id}>
                <summary><span className="cue-name">{it.see}</span></summary>
                <div className="cue-body">
                  <div className="ex-cue"><b>Say.</b> {it.say}</div>
                  {it.show && <div className="ex-cue"><b>Show.</b> {it.show}</div>}
                  <div className="ex-meta cue-test"><b>Watch for.</b> {it.watch}</div>
                  <Quotes quotes={it.quotes} sources={sources} />
                </div>
              </details>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/* ---------------------------------------------------------------------------------------------- */

export default async function SwimPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const sp = await searchParams;
  const sub = SUB_TABS.find((x) => x.id === sp.s)?.id ?? 'now';

  const [plan, year, baseline, teaching, coaching, recent, standards, pbs] = await Promise.all([
    loadSwimPlan(),
    sub === 'teach' ? null : getSwimYear(),
    sub === 'now' || sub === 'plan' ? getSwimBaseline() : null,
    sub === 'teach' ? loadSwimTeaching() : null,
    sub === 'me' ? loadSwimCoaching() : null,
    sub === 'now' ? getRecentSessions('swimming', 1)
      : sub === 'me' || sub === 'how' ? getRecentSessions('swimming', 10) : null,
    sub === 'now' ? loadSwimStandards() : null,
    sub === 'now' ? getSwimPbs() : null,
  ]);
  const lastSession = sub === 'now' ? (recent?.[0] ?? null) : null;
  const lastSummary = lastSession && year
    ? (year.summaries.find((x) => x.uuid === lastSession.uuid) ?? null)
    : null;

  return (
    <div className="wrap">
      <h1>Swim</h1>

      <SubNav sub={sub} />

      {sub === 'now' && year && standards && pbs && (
        <>
          <LastSession s={lastSession} insight={lastSwimLine(lastSummary)} />
          <Toward1000 year={year} baseline={baseline} plan={plan} />
          <SwimLevel
            standards={standards}
            standings={ratedDistances(standards).map((d) => standingFor(d, pbs, standards))}
          />
          <p className="ex-cue" style={{ marginTop: 18 }}>
            <Link href="/swim/records">Records</Link>: every distance this year, the 1,000 included.
          </p>
          <p className="ex-cue">
            <Link href="/swim/deep">The whole record</Link>: every length on file.
          </p>
        </>
      )}

      {sub === 'plan' && <PlanTab plan={plan} baseline={baseline} year={year} />}
      {sub === 'how' && year && <HowTab plan={plan} year={year} recent={recent ?? []} />}
      {sub === 'me' && coaching && year && <CoachMe c={coaching} year={year} recent={recent ?? []} />}
      {sub === 'teach' && teaching && <CoachThem t={teaching} />}
    </div>
  );
}
