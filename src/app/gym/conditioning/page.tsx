import Link from 'next/link';
import { loadConditioning } from '@/lib/gym/program';

export const dynamic = 'force-dynamic';

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

export default async function ConditioningPage() {
  const c = await loadConditioning();

  return (
    <div className="wrap">
      <p className="lede" style={{ marginBottom: 6 }}>
        <Link href="/gym">← Gym</Link>
      </p>
      <h1>Conditioning</h1>
      <p className="lede">
        Run, bike and swim. The lifting is at <Link href="/gym">/gym</Link>. Nothing here replaces a
        swim: the running lives in a morning slot that is currently empty.
      </p>

      {/* ---- when things happen ---- */}
      <div className="exgroup">
        <div className="exgroup-label">The week</div>
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

      {/* ---- run ---- */}
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
      </div>

      {/* ---- bike ---- */}
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
      </div>

      {/* ---- swim ---- */}
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
      </div>
    </div>
  );
}
