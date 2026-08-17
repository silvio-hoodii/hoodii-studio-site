import Link from 'next/link';
import { loadConditioning } from '@/lib/gym/program';
import type { Cue } from '@/lib/gym/types';

export const dynamic = 'force-dynamic';

/* ONE DISCIPLINE PER TAB. Rebuilt 2026-08-16.
 *
 * It was one page, 6,287 pixels tall, which is seven phone screens of unbroken scrolling behind a
 * single heading with no way to jump anywhere. His words: "right now is just walls of text i need
 * actual program separated either in pages or tabs or somethign i dont want to scroll infintely to
 * find buke or run".
 *
 * Tabs as plain links with a query param rather than client state, for the same reasons the kitchen
 * filters are: it works before hydration, it survives a reload at the side of a pool, and
 * /gym/conditioning?p=swim is a thing he can bookmark. The `.tab` styling is the one already used on
 * the workout page, including its 44px tap floor, so the two surfaces do not drift.
 *
 * NOTHING WAS CUT. The reasoning under each plan is why the plan is trusted, and he has never asked
 * for less of it, only for it to stop being in his way. Seven screens became four tabs of one or two.
 */

const TABS = [
  { id: 'week', label: 'The week' },
  { id: 'run', label: 'Run' },
  { id: 'bike', label: 'Bike' },
  { id: 'swim', label: 'Swim' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** Prose fields arrive as a string or an array of lines, because JSON has no multi-line string and
 *  these paragraphs carry the reasoning the whole plan rests on. An empty entry is a blank line. */
function Prose({ text }: { text: string | string[] }) {
  const paras = (Array.isArray(text) ? text.join('\n') : text).split(/\n\s*\n|\n(?=\s*$)/);
  return (
    <>
      {paras
        .map((p) => p.replace(/\n/g, ' ').trim())
        .filter(Boolean)
        .map((p, i) => (
          <p className="lede" key={i}>
            {p}
          </p>
        ))}
    </>
  );
}

/* THE CUES. Added 2026-08-16: "also cues and techinique remember that ive never run or bike".
 *
 * The plan told him how hard and how long and never how, which is a gap when the athlete has never
 * done the sport. Each cue is a TEST WITH A BINARY RESULT, per the same house rule the kitchen runs
 * on: a doneness cue must be something he performs, never a sense he has to have.
 *
 * `confidence` is rendered, not hidden. "convention" means good coaching practice with no study
 * behind it, and saying so is the point: a plan that labels its guesses can be trusted about the
 * rest. The citation sits behind a tap because he needs the cue at the gym and the source only when
 * he doubts it. */
function Cues({ cues, note }: { cues: Cue[]; note?: string | null }) {
  if (!cues?.length) return null;
  return (
    <>
      <div className="exgroup-label" style={{ marginTop: 22 }}>
        How to actually do it <span className="tag">({cues.length})</span>
      </div>
      <p className="lede" style={{ marginBottom: 6 }}>
        Each one is a test you perform, not a feeling you have to have. Tap to open.
      </p>
      {/* COLLAPSED BY DEFAULT, and measured before and after rather than guessed. Rendering all
          seven open took the Run tab to 8,536 px, which is TALLER than the 6,287 px page he
          complained about in the first place. Fixing one wall of text by building a bigger one is
          not a fix. Collapsed, the seven names are a scannable checklist and each opens on its own,
          which is also how he would use them at the gym. */}
      <div className="cuelist">
        {cues.map((c) => (
          <details className="cue" key={c.name}>
            <summary>
              <span className="cue-name">{c.name}</span>
              <span className={`conf ${c.confidence}`}>{c.confidence}</span>
            </summary>
            <div className="cue-body">
              <div className="ex-cue">{c.cue}</div>
              <div className="ex-meta cue-test"><b>The test.</b> {c.test}</div>
              {c.why && <div className="ex-cue quiet">{c.why}</div>}
              {c.grounding && (
                <details className="src">
                  <summary>{c.confidence === 'convention' ? 'No study behind this' : 'Where this comes from'}</summary>
                  <div className="src-body">
                    {c.grounding}
                    {c.url && (
                      <>
                        {' '}
                        <a href={c.url} target="_blank" rel="noreferrer">open the source</a>
                      </>
                    )}
                  </div>
                </details>
              )}
            </div>
          </details>
        ))}
      </div>
      {note && (
        <details className="src">
          <summary>What was thrown out, and why</summary>
          <div className="src-body" style={{ whiteSpace: 'pre-line' }}>{note}</div>
        </details>
      )}
    </>
  );
}

export default async function ConditioningPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const c = await loadConditioning();
  const sp = await searchParams;
  const tab: TabId = (TABS.find((t) => t.id === sp.p)?.id ?? 'week') as TabId;

  return (
    <div className="wrap">
      <h1>Conditioning</h1>

      {/* Immediately under the title, because the whole complaint was having to scroll to reach a
          discipline. Nothing else comes before these. */}
      <div className="tabs">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === 'week' ? '/gym/conditioning' : `/gym/conditioning?p=${t.id}`}
            className={`tab${tab === t.id ? ' on' : ''}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'week' && (
        <>
          <p className="lede">
            Run, bike and swim. The lifting is on the workout tab. Nothing here replaces a swim: the
            running lives in a morning slot that is currently empty.
          </p>

          <div className="exgroup">
            <div className="exgroup-label">When things happen</div>
            <div className="exlist">
              <div className="ex">
                <div className="ex-name">{c.slots.morning.name}</div>
                <div className="ex-meta">{c.slots.morning.what}</div>
                <div className="ex-cue">{c.slots.morning.why}</div>
              </div>
              <div className="ex">
                <div className="ex-name">{c.slots.evening.name}</div>
                <div className="ex-meta">{c.slots.evening.what}</div>
                <div className="ex-cue">{c.slots.evening.why}</div>
              </div>
              <div className="ex">
                <div className="ex-name">Pool times</div>
                <div className="ex-cue">
                  {Object.entries(c.slots.poolTimes)
                    .filter(([k]) => !k.startsWith('$'))
                    .map(([, v]) => v)
                    .join(' · ')}
                </div>
              </div>
            </div>
          </div>

          {/* One line each, then out. The detail is a tap away and does not belong here. */}
          <div className="exgroup">
            <div className="exgroup-label">The three plans</div>
            <div className="exlist">
              <Link className="ex" href="/gym/conditioning?p=run">
                <div className="ex-name">{c.run.title} &rarr;</div>
                <div className="ex-meta">{c.run.surface} · {c.run.sessionsPerWeek}x a week · {c.run.weeks.length}-week build</div>
              </Link>
              <Link className="ex" href="/gym/conditioning?p=bike">
                <div className="ex-name">{c.bike.title} &rarr;</div>
                <div className="ex-meta">{c.bike.sessionsPerWeek}x a week · {c.bike.protocol.totalMinutes} min · {c.bike.protocol.name}</div>
              </Link>
              <Link className="ex" href="/gym/conditioning?p=swim">
                <div className="ex-name">{c.swim.title} &rarr;</div>
                <div className="ex-meta">{c.swim.sessionsPerWeek} · target {c.swim.theGoal.target}</div>
              </Link>
            </div>
          </div>
        </>
      )}

      {tab === 'run' && (
        <div className="exgroup">
          <div className="exgroup-label">
            {c.run.title} <span className="tag">({c.run.surface}, {c.run.sessionsPerWeek}x/week)</span>
          </div>
          <Prose text={c.run.why} />
          <div className="exlist">
            <div className="ex">
              <div className="ex-name">How hard</div>
              <div className="ex-cue">{c.run.howHard.primary}</div>
              <div className="ex-cue">{c.run.howHard.startingSpeed}</div>
              <div className="ex-cue">{c.run.howHard.secondary}</div>
            </div>
          </div>
          <div className="table-scroll">
            <table className="plan-table">
              <thead>
                <tr>
                  <th className="tnum">Week</th>
                  <th>Each session</th>
                  <th className="tnum">Run</th>
                </tr>
              </thead>
              <tbody>
                {c.run.weeks.map((w) => (
                  <tr key={w.week}>
                    <td className="tnum">{w.week}</td>
                    <td>
                      {w.session}
                      {w.note && <div className="quiet">{w.note}</div>}
                    </td>
                    <td className="tnum">{w.runKm} km</td>
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
          <Cues cues={c.run.cues ?? []} note={c.run.cuesNote} />
        </div>
      )}

      {tab === 'bike' && (
        <div className="exgroup">
          <div className="exgroup-label">
            {c.bike.title} <span className="tag">({c.bike.sessionsPerWeek}x/week, {c.bike.protocol.totalMinutes} min)</span>
          </div>
          <Prose text={c.bike.why} />
          <div className="exlist">
            <div className="ex">
              <div className="ex-name">{c.bike.protocol.name}</div>
              <div className="ex-meta">{c.bike.protocol.structure}</div>
              <div className="ex-cue">{c.bike.protocol.shortVersion}</div>
              <div className="ex-cue quiet">{c.bike.protocol.evidenceNote}</div>
            </div>
            <div className="ex">
              <div className="ex-name">How hard</div>
              <div className="ex-cue">{c.bike.howHard.hardPiece}</div>
              <div className="ex-cue">{c.bike.howHard.heartRate}</div>
              <div className="ex-cue">{c.bike.howHard.easyPiece}</div>
            </div>
          </div>
          <ul className="rules">
            {c.bike.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <Cues cues={c.bike.cues ?? []} note={c.bike.cuesNote} />
        </div>
      )}

      {tab === 'swim' && (
        <div className="exgroup">
          <div className="exgroup-label">
            {c.swim.title} <span className="tag">({c.swim.sessionsPerWeek})</span>
          </div>
          <div className="exlist">
            <div className="ex">
              <div className="ex-name">Where you are</div>
              <div className="ex-meta">
                {c.swim.baseline.continuousUnassisted} continuous, unassisted · {c.swim.baseline.movingPace} per 100 m
              </div>
              <div className="ex-cue">{c.swim.baseline.typicalSession}</div>
              <div className="ex-cue">{c.swim.baseline.matchesTheData}</div>
            </div>
            <div className="ex">
              <div className="ex-name">{c.swim.theGoal.target}</div>
              <div className="ex-cue">{c.swim.theGoal.whatThatActuallyIs}</div>
              <div className="ex-cue">{c.swim.theGoal.whyItIsAchievable}</div>
            </div>
            <div className="ex">
              <div className="ex-name">The one change: go slower</div>
              <div className="ex-meta">{c.swim.theOneTechniqueChange.what}</div>
              <div className="ex-cue">{c.swim.theOneTechniqueChange.why}</div>
              <div className="ex-cue">{c.swim.theOneTechniqueChange.howToKnow}</div>
            </div>
          </div>

          <p className="lede">{c.swim.structure.note}</p>
          <div className="table-scroll">
            <table className="plan-table">
              <thead>
                <tr>
                  <th className="tnum">Weeks</th>
                  <th className="wide">Continuity piece</th>
                  {/* NOT .tnum: the last two rows say "then easy swimming" and "the whole thing,
                      unbroken", and nowrap on prose forced the table to scroll sideways. */}
                  <th>Rest</th>
                </tr>
              </thead>
              <tbody>
                {c.swim.structure.ladder.map((s) => (
                  <tr key={s.weeks}>
                    <td className="tnum">{s.weeks}</td>
                    <td>
                      <span className="nowrap">{s.piece}</span>
                      {s.note && <div className="quiet">{s.note}</div>}
                    </td>
                    <td>{s.rest}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="exlist">
            <div className="ex">
              <div className="ex-name">Paddles</div>
              <div className="ex-meta">{c.swim.paddleRule.rule}</div>
              <Prose text={c.swim.paddleRule.why} />
            </div>
            <div className="ex">
              <div className="ex-name">Pull buoy</div>
              <div className="ex-cue">{c.swim.pullBuoyRule}</div>
            </div>
            <div className="ex">
              <div className="ex-name">Drills</div>
              <div className="ex-cue">{c.swim.onDrills}</div>
            </div>
          </div>
          <Cues cues={c.swim.cues ?? []} note={c.swim.cuesNote} />
        </div>
      )}
    </div>
  );
}
