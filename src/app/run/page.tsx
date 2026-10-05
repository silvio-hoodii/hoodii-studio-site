import Link from 'next/link';
import { loadConditioning } from '@/lib/gym/program';
import { getRecentSessions } from '@/lib/gym/session';
import LastSession from '@/components/training/LastSession';
import SubNav from '@/components/training/SubNav';
import RecentSessions from '@/components/training/RecentSessions';
import Cues from '@/components/training/Cues';
import type { ConditioningWeek } from '@/lib/gym/types';
import { runWeekAt, SHORT_DAY } from '@/lib/gym/run-week';
import { today } from '@/lib/day';

export const dynamic = 'force-dynamic';

/* RUN, ON ITS OWN ROUTE. Phase C, 2026-08-27.
 *
 * Lifted out of /gym/conditioning?p=run without a word of it rewritten. The three sub-tabs are the
 * same three, with the same `?s=` parameter names, so an old ?p=run&s=how bookmark keeps its
 * meaning through the redirect in next.config.ts.
 *
 * THE SPLIT IS BY WHEN YOU ASK, and it is not being reinvented here:
 *   Now   what is true about me today. Changes on its own.
 *   Plan  what to do over the coming weeks. Changes when the programme changes.
 *   How   how to actually do it. Barely changes at all.
 * That split took the swim view from 7.9 phone screens to 2.2 on 2026-08-22, after he said it
 * twice: "if I go to the water, I have to scroll a lot".
 *
 * Plain links with a query param rather than client state, for the reason the kitchen filters and
 * the swim tabs give: it works before hydration, it survives a reload standing at a treadmill, and
 * every view is a URL he can bookmark. */
/* OUTDOORS SINCE 2026-10-04. Each week is a list of runs, each a WATCH distance: his rule the same
 * evening is that a distance on this page is the number his watch shows, the session total with any
 * walking in it, never a running-only figure, in km to two decimals as the watch prints it. Minutes
 * are DERIVED from that distance and `run.pace.sessionSecPerKm`, a [low, high] range from two of his
 * own sessions, never typed, so a distance edit cannot leave a stale time beside it. A range, not one
 * number, because how much he walks decides it. content/gym/validate.mjs holds the 10% weekly cap,
 * the rest rule for every week, and the lift-day cap. */
function mins(km: number, secPerKm: number): number {
  return Math.round((km * secPerKm) / 60);
}
function range(lo: number, hi: number): string {
  return lo === hi ? `about ${lo} min` : `about ${lo} to ${hi} min`;
}
function weekFigures(w: ConditioningWeek, [lo, hi]: [number, number]) {
  const runs = w.runs.map((r) => ({ ...r, lo: mins(r.km, lo), hi: mins(r.km, hi) }));
  return {
    runs,
    lo: runs.reduce((a, r) => a + r.lo, 0),
    hi: runs.reduce((a, r) => a + r.hi, 0),
  };
}
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1, 12)).getUTCDay();
  const name = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][wd];
  return `${name} ${d} ${MONTH[(m ?? 1) - 1]}`;
}

const SUB_TABS = [
  { id: 'now', label: 'Now' },
  { id: 'plan', label: 'Plan' },
  { id: 'how', label: 'How' },
] as const;

export default async function RunPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const sp = await searchParams;
  const sub = SUB_TABS.find((t) => t.id === sp.s)?.id ?? 'now';
  const c = await loadConditioning();
  /* One session read, and only on the tab that draws it. The plan and how tabs had no database
     dependency when they were query parameters and they still do not: this page opens at the side
     of a treadmill. */
  /* One read for the whole Now tab. getRecentSessions returns newest first, so the head of it IS
     the last session and a separate getLastSession call would be the same row fetched twice. */
  const recent = sub === 'now' ? await getRecentSessions('treadmill', 10) : [];
  const lastSession = recent[0] ?? null;
  const span = c.run.pace.sessionSecPerKm;
  const at = runWeekAt(c.run.startsOn, today(), c.run.weeks.length);
  /* Where he is in the plan, a fact about him: before the start it names the start day. */
  const where = at.before
    ? `Week 1 starts ${longDate(c.run.startsOn)}.`
    : at.after
      ? `The ${c.run.weeks.length} weeks are done. Reassess before going on.`
      : `This is week ${at.week} of ${c.run.weeks.length}.`;
  const counts = c.run.weeks.map((w) => w.runs.length);
  const lo = Math.min(...counts);
  const hi = Math.max(...counts);
  const perWeek = lo === hi ? `${hi}x a week` : `${lo} to ${hi} runs a week`;

  return (
    <div className="wrap">
      <h1>Run</h1>

      <SubNav base="/run" tabs={SUB_TABS} sub={sub} />

      {sub === 'now' && (
        <>
          {/* NO ARTICLE IN FRONT OF THE NUMBER. This read "on a {n}-week build" and rendered "on a
              8-week build", because the count comes from the data and "a" was typed. Rewritten so
              there is no article to get wrong rather than branching on the digit: 8, 11 and 18 all
              take "an" and the next edit to the plan would have reintroduced it. */}
          <p className="lede">
            {c.run.surface}, {perWeek}, over {c.run.weeks.length} weeks. {where}
          </p>
          <LastSession s={lastSession} />
          <RecentSessions sessions={recent} kind="treadmill" />
          {/* The recent block above reads health_session_detail, which has 5 rows for running.
              The log reads health_watch_session, which has 318 going back to 2019. Both are honest
              about their own source; only one answers "how much have I run". */}
          <p className="ex-cue" style={{ marginTop: 14 }}>
            <Link href="/run/log">Every run on record</Link>
          </p>
        </>
      )}

      {sub === 'plan' && (
        <div className="exgroup">
          <div className="exgroup-label">
            {c.run.title} <span className="tag">({c.run.surface}, {perWeek})</span>
          </div>
          {/* `why` (the trial behind the plan) and `whyTheClockNotTheConsole` rendered here until
              2026-09-15. Both are still in conditioning.json. AGENTS.md, "Page text". */}
          <div className="exlist">
            <div className="ex">
              <div className="ex-name">How hard</div>
              <div className="ex-cue">{c.run.howHard.primary}</div>
              <div className="ex-cue">{c.run.howHard.secondary}</div>
            </div>
            {/* The Pace block that stood here (8:00 per km, a pace check) was DELETED 2026-10-04 on
                review: pace never kept him easy, the talk test and the 140 did. run.howHard.$why. */}
          </div>
          <p className="ex-cue">{where}</p>
          <div className="table-scroll">
            <table className="plan-table">
              <thead>
                {/* THREE COLUMNS, not four. A fourth for the console reading was measured at 390px
                    on 2026-08-21 and crushed the session column so hard that week 1's note wrapped
                    one word per line. The console figure is a confirmation he reads AFTER the run,
                    so it belongs under the session as a quiet line, not in a column of its own. */}
                <tr>
                  <th className="tnum">Week</th>
                  {/* Each run: day, watch distance, minutes. Total is the week's minutes. */}
                  <th className="wide">Runs</th>
                  <th className="tnum">Total</th>
                </tr>
              </thead>
              <tbody>
                {c.run.weeks.map((w) => {
                  const f = weekFigures(w, span);
                  return (
                    <tr key={w.week} className={w.week === at.week && !at.after ? 'now' : undefined}>
                      <td className="tnum">{w.week}</td>
                      <td>
                        {f.runs.map((r) => (
                          <div key={r.day}>
                            {SHORT_DAY[r.day] ?? r.day} {r.km.toFixed(2)} km
                            <div className="quiet">{range(r.lo, r.hi)}</div>
                          </div>
                        ))}
                        {w.note && <div className="quiet">{w.note}</div>}
                      </td>
                      <td className="tnum">{f.lo === f.hi ? f.lo : `${f.lo} to ${f.hi}`} min</td>
                    </tr>
                  );
                })}
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

      {sub === 'how' && (
        <div className="exgroup">
          <Cues cues={c.run.cues ?? []} />
        </div>
      )}
    </div>
  );
}
