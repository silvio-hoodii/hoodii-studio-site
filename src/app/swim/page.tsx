import Link from 'next/link';
import { loadSwimPlan, loadSwimCoaching, loadSwimTeaching } from '@/lib/swim/content';
import { getSwimBaseline, type SwimBaseline } from '@/lib/swim/db';
import { getSwimYear, getLadderSwims, LENGTH_MIN_MS, LENGTH_MAX_MS, type SwimYear, type SwimSummary } from '@/lib/swim/deep';
import { ladderPosition, type LadderSwim } from '@/lib/swim/ladder';
import {
  loadSwimStandards, getSwimPbs, standingFor, ratedDistances, fmtTime, tierTimeMs,
  type SwimStandards, type DistanceStanding,
} from '@/lib/swim/level';
import { getRecentSessions, mmss, type SessionDetail } from '@/lib/gym/session';
import { BarChart } from '../health/HealthCharts';
import BaselineForm from './BaselineForm';
import LastSession from '@/components/training/LastSession';
import SubNav from '@/components/training/SubNav';
import { median } from '@/lib/health/fmt';
import { Trace } from '@/components/training/SessionCharts';
import Prose from '@/components/training/Prose';
import Cues from '@/components/training/Cues';
import Readout from '@/components/Readout';
import { shortDate } from '@/lib/format';
import { today } from '@/lib/day';
import type { SwimPlan, SwimCoaching, SwimTeaching, SwimLadderStep } from '@/lib/swim/types';

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

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Swimming pace per 100 m, rest excluded. */
function per100(seconds: number, metres: number): string {
  return metres > 0 ? mmss(seconds / (metres / 100)) : '-';
}

const newestFirst = (a: { date: string }, b: { date: string }) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

/* THE RUNG HE IS ON, off his laps since 2026-10-04 (src/lib/swim/ladder.ts). Until then this counted
   weeks from the day his number was set and moved him up every fortnight whatever he swam; he met
   the asked piece in 1 of 18 swims and it kept climbing. */
interface Rung {
  /** 0-based; equals the rung count when the last rung is done. */
  index: number;
  total: number;
  step: SwimLadderStep | null;
  met: number;
  need: number;
}

function currentRung(plan: SwimPlan, swims: LadderSwim[]): Rung {
  const L = plan.structure.ladder;
  const p = ladderPosition(L, swims, plan.structure.ladderFrom, plan.structure.advanceAfter);
  return { index: p.index, total: L.length, step: L[p.index] ?? null, met: p.met, need: p.need };
}

/** One line: the rung, and how many of his swims have met it. */
function RungLine({ rung }: { rung: Rung }) {
  if (!rung.step) {
    return <p className="ex-cue"><b>Ladder done:</b> 1,000 m without stopping, in {rung.need} swims.</p>;
  }
  return (
    <p className="ex-cue">
      <b>Now: {rung.step.piece}</b>{rung.step.standS != null && <>, stop {rung.step.rest}</>}. Rung {rung.index + 1} of{' '}
      {rung.total}. Swims that met it: {rung.met} of {rung.need}.
    </p>
  );
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

/* The last ten swims as bars, oldest first, since 2026-09-27: the distance swum as the bar and the
   longest unbroken piece inside it in full ink, so how much of each swim was one piece is the
   picture. Tap a bar for the date, the metres, the piece and the stops. The table stays, folded. */
function SwimBars({ rows }: { rows: SwimSummary[] }) {
  if (rows.length < 2) return null;
  const max = Math.max(1, ...rows.map((r) => r.metres));
  const n = rows.length;
  const W = 340;
  const H = 96;
  const gap = 6;
  const bw = (W - gap * (n - 1)) / n;
  const hOf = (m: number) => Math.max(2, (m / max) * (H - 14));
  return (
    <figure className="swimbars">
      <Readout>
      <svg viewBox={`0 0 ${W} ${H + 16}`} role="img"
        aria-label={`The last ${n} swims: metres swum, with the longest unbroken piece of each drawn inside`}>
        {rows.map((r, i) => {
          const x = i * (bw + gap);
          const h = hOf(r.metres);
          const hp = hOf(r.longestM);
          const last = i === n - 1;
          return (
            <g key={r.uuid} data-r={`${shortDate(r.date)}, ${r.metres.toLocaleString('en-CA')} m, longest piece ${r.longestM} m, ${r.stops} ${r.stops === 1 ? 'stop' : 'stops'}`}>
              <rect x={x} y={0} width={bw} height={H} fill="transparent" />
              <rect className="vbar swum" style={{ ['--i' as string]: i }} x={x} y={H - h} width={bw} height={h} rx="1.5" />
              <rect className={`vbar piece${last ? ' now' : ''}`} style={{ ['--i' as string]: i }} x={x} y={H - hp} width={bw} height={hp} rx="1.5" />
              <text x={x + bw / 2} y={H - h - 4} textAnchor="middle" className="sv">{r.metres}</text>
            </g>
          );
        })}
        <text x={0} y={H + 13} className="sd">{shortDate(rows[0]!.date)}</text>
        <text x={W} y={H + 13} textAnchor="end" className="sd">{shortDate(rows[n - 1]!.date)}</text>
      </svg>
      </Readout>
      <figcaption>
        <span><i className="k-swum" />swum, m</span>
        <span><i className="k-piece" />longest unbroken piece</span>
      </figcaption>
    </figure>
  );
}

function Toward1000({ year, ladder, plan }: { year: SwimYear; ladder: LadderSwim[]; plan: SwimPlan }) {
  const s = year.summaries;
  if (!s.length) return null;
  const last = s.slice(-10);
  const before = s.slice(-20, -10);
  const top = year.pieces[0] ?? null;
  const rung = currentRung(plan, ladder);
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
      <RungLine rung={rung} />
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
      <div className="two">
        <div>
          <p className="ex-meta" style={{ marginTop: 14 }}>
            Longest unbroken piece, every swim in {today().slice(0, 4)}
          </p>
          <BarChart points={s.map((x) => ({ date: x.date, value: x.longestM }))} unit="m" />
        </div>
        <div>
          <p className="ex-meta" style={{ marginTop: 14 }}>The last {last.length} swims</p>
          <SwimBars rows={last} />
        </div>
      </div>
      {lastLongest != null && lastStops != null && prevLongest != null && prevStops != null && (
        <p className="ex-cue" style={{ marginTop: 10 }}>
          Your last {last.length} swims: a typical longest piece of <b>{lastLongest} m</b> and{' '}
          <b>{lastStops} stops</b>. The {before.length} before: {prevLongest} m and {prevStops}.
        </p>
      )}
      <details className="fold">
        <summary>The last {last.length}, as a table</summary>
        <LastSwims rows={[...last].reverse()} />
      </details>
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
                <td>{t.name}</td>
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
      {/* Underlined is the only thing this table needs said. Until 2026-09-15 it also printed the
          dates of each best, "Levels are race times, one swim with no stops", a note that the
          Fitness rung is our own, and a list of where the levels come from. The no-stops sentence
          was wrong beside his row: the 1,500 m best on May 22 cannot be unbroken when the longest
          unbroken piece that day was 600 m. The sources are still in content/swim. */}
      <p className="ex-meta">Underlined: the level each best reaches.</p>
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

/* The ladder as a staircase, since 2026-09-27 ("more graphic stuff instead of just walls of text").
 * One step per rung, height = the continuity piece, the rung he is on in --signal (true right now),
 * the 1,000 m goal as a dashed line and his real longest unbroken piece of the last ten swim days as
 * a solid one, so the gap between the plan and the pool is the picture.
 *
 * The step height is the rung's firstM since 2026-10-04; it was parsed out of the rung's sentence before. */

function LadderTrack({ steps, longest }: { steps: { label: string; metres: number | null; on: boolean }[]; longest: number }) {
  if (!steps.some((s) => s.metres)) return null;
  const W = 340;
  const H = 150;
  const top = 1100;
  const y = (m: number) => H - (m / top) * (H - 10);
  const n = steps.length;
  const bw = W / n;
  return (
    <figure className="ladder-track">
      <Readout>
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img"
        aria-label={`The ladder from ${steps[0]?.metres ?? ''} m to ${GOAL_M} m; your longest recent piece is ${longest} m`}>
        {steps.map((st, i) => st.metres ? (
          <g key={st.label} data-r={`rung ${st.label}: first piece ${st.metres.toLocaleString('en-CA')} m${st.on ? ', now' : ''}`}>
            <rect x={i * bw + 2} y={0} width={bw - 4} height={H} fill="transparent" />
            <rect x={i * bw + 2} y={y(st.metres)} width={bw - 4} height={H - y(st.metres)} rx="1.5"
              className={`vbar ${st.on ? 'on' : 'off'}`} style={{ ['--i' as string]: i }} />
            <text x={i * bw + bw / 2} y={y(st.metres) - 4} textAnchor="middle" className="lv">{st.metres}</text>
            <text x={i * bw + bw / 2} y={H + 13} textAnchor="middle" className="lw">{st.label}</text>
          </g>
        ) : null)}
        <line x1="0" x2={W} y1={y(GOAL_M)} y2={y(GOAL_M)} className="goal" />
        {longest > 0 && <line x1="0" x2={W} y1={y(longest)} y2={y(longest)} className="you" />}
      </svg>
      </Readout>
      <figcaption>
        <span><i className="k-goal" />goal {GOAL_M.toLocaleString('en-CA')} m</span>
        {longest > 0 && <span><i className="k-you" />your longest lately {longest} m</span>}
        <span className="lwk">rungs</span>
      </figcaption>
    </figure>
  );
}

function PlanTab({ plan, baseline, year, ladder }: { plan: SwimPlan; baseline: SwimBaseline | null; year: SwimYear | null; ladder: LadderSwim[] }) {
  const rung = currentRung(plan, ladder);
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
      <RungLine rung={rung} />
      <p className="lede">{plan.structure.note}</p>
      <LadderTrack
        steps={plan.structure.ladder.map((st, i) => ({
          label: String(i + 1),
          metres: st.firstM,
          on: i === rung.index,
        }))}
        longest={longest}
      />
      <details className="fold">
        <summary>The ladder, rung by rung</summary>
      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th className="tnum">Rung</th>
              <th className="wide">Continuity piece</th>
              <th>Stop</th>
            </tr>
          </thead>
          <tbody>
            {plan.structure.ladder.map((s, i) => {
              const on = i === rung.index;
              return (
                <tr key={i} className={on ? 'now' : undefined}>
                  <td className="tnum">{i + 1}{on ? ', now' : ''}</td>
                  <td>
                    {s.piece}
                    {s.note && <div className="quiet">{s.note}</div>}
                  </td>
                  <td>{s.rest}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </details>
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
          <div className="ex-cue">{plan.theOneTechniqueChange.what}</div>
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
      <Cues cues={plan.cues ?? []} heading="In the water" />
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */

/* THE SOURCE QUOTES NO LONGER RENDER under the coaching cards, since 2026-09-15. Every card on
 * Coach me and Coach them carried a "Their words" block and a link to the page they came from. The
 * quotes are still in content/swim, still checked word for word against the captured pages by
 * validate.mjs, and still the reason a card says what it says. They are the research record, not
 * the page. See AGENTS.md, "Page text". */

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

  const planP = loadSwimPlan();
  const [plan, year, baseline, teaching, coaching, recent, standards, pbs, ladder] = await Promise.all([
    planP,
    sub === 'teach' ? null : getSwimYear(),
    sub === 'plan' ? getSwimBaseline() : null,
    sub === 'teach' ? loadSwimTeaching() : null,
    sub === 'me' ? loadSwimCoaching() : null,
    sub === 'now' ? getRecentSessions('swimming', 1)
      : sub === 'me' || sub === 'how' ? getRecentSessions('swimming', 10) : null,
    sub === 'now' ? loadSwimStandards() : null,
    sub === 'now' ? getSwimPbs() : null,
    sub === 'now' || sub === 'plan' ? planP.then((p) => getLadderSwims(p.structure.ladderFrom)) : null,
  ]);
  const lastSession = sub === 'now' ? (recent?.[0] ?? null) : null;
  const lastSummary = lastSession && year
    ? (year.summaries.find((x) => x.uuid === lastSession.uuid) ?? null)
    : null;

  return (
    <div className="wrap">
      <h1>Swim</h1>

      <SubNav base="/swim" tabs={SUB_TABS} sub={sub} bare="now" />

      {sub === 'now' && year && standards && pbs && (
        <>
          <LastSession s={lastSession} insight={lastSwimLine(lastSummary)} />
          <Toward1000 year={year} ladder={ladder ?? []} plan={plan} />
          <SwimLevel
            standards={standards}
            standings={ratedDistances(standards).map((d) => standingFor(d, pbs, standards))}
          />
          <p className="ex-cue" style={{ marginTop: 18 }}>
            <Link href="/swim/records">Records</Link>
          </p>
          <p className="ex-cue">
            <Link href="/swim/deep">The whole record</Link>
          </p>
        </>
      )}

      {sub === 'plan' && <PlanTab plan={plan} baseline={baseline} year={year} ladder={ladder ?? []} />}
      {sub === 'how' && year && <HowTab plan={plan} year={year} recent={recent ?? []} />}
      {sub === 'me' && coaching && year && <CoachMe c={coaching} year={year} recent={recent ?? []} />}
      {sub === 'teach' && teaching && <CoachThem t={teaching} />}
    </div>
  );
}
