import Link from 'next/link';
import { loadConditioning } from '@/lib/gym/program';
import { getRecentSessions } from '@/lib/gym/session';
import LastSession from '@/components/training/LastSession';
import SubNav from '@/components/training/SubNav';
import RecentSessions from '@/components/training/RecentSessions';
import Cues from '@/components/training/Cues';

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
/* THE CONSOLE CHECK IS DERIVED FROM THE CLOCK AND THE BELT, since 2026-09-27. `consoleCheck` and
 * `runKm` in conditioning.json are typed for 8.0 and 5.0 km/h, and the cues tell him to drop the belt
 * 0.5 km/h on a fail, after which the typed figures are simply wrong. Computing them from the session
 * string and `beltSettings` keeps the numbers true for the speeds the page states, and the line says
 * which speed it assumes, so a lowered belt reads as a different case rather than a failed run. The
 * page cannot know the belt he actually set, so it does not pretend to. */
const KM_PER_MILE = 1.609344;
function segSeconds(session: string, what: 'walk' | 'run'): number | null {
  let total = 0;
  for (const m of session.matchAll(/(\d+):(\d{2})\s+(walk|run)/g)) {
    if (m[3] === what) total += Number(m[1]) * 60 + Number(m[2]);
  }
  return total > 0 ? total : null;
}
function consoleLine(session: string, runKmh: number, walkKmh: number): string | null {
  const run = segSeconds(session, 'run');
  const walk = segSeconds(session, 'walk');
  if (run == null || walk == null || !(runKmh > 0) || !(walkKmh > 0)) return null;
  const runKm = (run / 3600) * runKmh;
  const km = runKm + (walk / 3600) * walkKmh;
  return `At ${runKmh.toFixed(1)} km/h the console should read ${km.toFixed(2)} km, or ${(km / KM_PER_MILE).toFixed(2)} miles, ${Number(runKm.toFixed(2))} km of it running.`;
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
  const runKmh = parseFloat(c.run.beltSettings.run);
  const walkKmh = parseFloat(c.run.beltSettings.walk);

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
            {c.run.surface}, {c.run.sessionsPerWeek}x a week, over {c.run.weeks.length} weeks.
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
            {c.run.title} <span className="tag">({c.run.surface}, {c.run.sessionsPerWeek}x/week)</span>
          </div>
          {/* `why` (the trial behind the plan) and `whyTheClockNotTheConsole` rendered here until
              2026-09-15. Both are still in conditioning.json. AGENTS.md, "Page text". */}
          <div className="exlist">
            <div className="ex">
              <div className="ex-name">How hard</div>
              <div className="ex-cue">{c.run.howHard.primary}</div>
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
            </div>
          </div>
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
                      {consoleLine(w.session, runKmh, walkKmh) && (
                        <div className="quiet">{consoleLine(w.session, runKmh, walkKmh)}</div>
                      )}
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
