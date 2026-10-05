import Link from 'next/link';
import { loadConditioning } from '@/lib/gym/program';
import { getRecentSessions } from '@/lib/gym/session';
import LastSession from '@/components/training/LastSession';
import SubNav from '@/components/training/SubNav';
import RecentSessions from '@/components/training/RecentSessions';
import Cues from '@/components/training/Cues';
import type { ConditioningWeek } from '@/lib/gym/types';

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
/* OUTDOORS SINCE 2026-10-04, and every figure in a row is DERIVED from the week's clock times and
 * `run.pace`, none typed. His rule the same evening: a distance on this page is the number his watch
 * shows, which is the TOTAL for the session, walks included, never a running-only figure. So the line
 * under each week is the whole session's distance at the stated paces, and the running-only split
 * stays in conditioning.json's `$` fields. */
function secs(mmss: string): number | null {
  const m = /^(\d+):(\d{2})$/.exec(mmss.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function clock(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
function weekFigures(w: ConditioningWeek, runSecPerKm: number, walkSecPerKm: number) {
  const warm = secs(w.warmup);
  const run = secs(w.run);
  const walk = secs(w.walk);
  if (warm == null || run == null || walk == null || !(w.blocks > 0)) return null;
  const runTotal = run * w.blocks;
  const walkTotal = warm + walk * w.blocks;
  const km = runTotal / runSecPerKm + walkTotal / walkSecPerKm;
  return {
    line: `${w.warmup} walk, then ${w.blocks} rounds of ${w.run} run, ${w.walk} walk`,
    total: clock(runTotal + walkTotal),
    watch: `About ${km.toFixed(1)} km on the watch.`,
  };
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
  const { runSecPerKm, walkSecPerKm } = c.run.pace;

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
            {/* THE PACE, above the table: the one number he checks on the watch mid-run. The belt
                block that stood here went with the treadmill on 2026-10-04. */}
            <div className="ex">
              <div className="ex-name">Pace</div>
              <div className="ex-meta">
                Run at <b className="nowrap">{c.run.pace.run}</b>, walk at{' '}
                <b className="nowrap">{c.run.pace.walk}</b>
              </div>
              <div className="ex-cue">{c.run.pace.check}</div>
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
                {c.run.weeks.map((w) => {
                  const f = weekFigures(w, runSecPerKm, walkSecPerKm);
                  return (
                    <tr key={w.week}>
                      <td className="tnum">{w.week}</td>
                      <td>
                        {f?.line}
                        {f && <div className="quiet">{f.watch}</div>}
                        {w.note && <div className="quiet">{w.note}</div>}
                      </td>
                      <td className="tnum">{f?.total}</td>
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
