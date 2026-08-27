import Link from 'next/link';
import { loadSwimPlan, loadSwimCoaching, loadSwimTeaching } from '@/lib/swim/content';
import { getSwimBaseline, getSwimHistory } from '@/lib/swim/db';
import {
  loadSwimStandards, getSwimPbs, standingFor, ratedDistances, fmtTime, tierTimeMs,
  type SwimStandards, type DistanceStanding,
} from '@/lib/swim/level';
import { getRecentSessions } from '@/lib/gym/session';
import { BarChart } from '../health/HealthCharts';
import BaselineForm from './BaselineForm';
import LastSession from '@/components/training/LastSession';
import RecentSessions from '@/components/training/RecentSessions';
import Prose from '@/components/training/Prose';
import Cues from '@/components/training/Cues';
import { shortDate } from '@/lib/format';
import type { SwimCoaching, SwimTeaching } from '@/lib/swim/types';

export const dynamic = 'force-dynamic';

/* SWIM, THE WHOLE SUBJECT, ON ONE ROUTE. Rebuilt 2026-08-26.
 *
 * Until today this URL was the Calgary lane-swim timetable and his actual swimming was a tab three
 * taps inside /gym/conditioning?p=swim. Two halves of one subject, neither linking to the other,
 * and the half that was about him was the one you had to know the query string to find. The
 * schedule is dead, by his decision and knowing that nothing else produces "which pool has lane
 * swim open right now". This is what took its place.
 *
 * THE SUB-TABS ARE UNCHANGED, deliberately, and so is the query-param idiom. That split (Now, Plan,
 * How, Coach me, Coach them) took the swim view from 7.9 phone screens to 2.2 on 2026-08-22, after
 * he said it twice: "if I go to the water, I have to scroll a lot", and "everything else feels like
 * it's just slop that it's sitting there without any real reason". The content was never slop; its
 * ARRANGEMENT was. A rebuild is exactly where that regresses, so nothing here re-stacks.
 *
 * Plain links with a query param rather than client state, for the reasons /gym/conditioning gives:
 * it works before hydration, it survives a reload at the side of a pool, and every view is a URL he
 * can bookmark. `?s=` is the same parameter name, so an old ?p=swim&s=teach bookmark keeps its
 * meaning once /gym/conditioning redirects it here.
 *
 * NOTHING WAS CUT in the move. He has never asked for less of this, only for it to stop being in
 * his way. The swim history numbers that /health used to carry arrived here as well, which is the
 * one thing this page gained: they were on a page about body composition, answering a question
 * about swimming, with no link between them. */

const SUB_TABS = [
  { id: 'now', label: 'Now' },
  { id: 'plan', label: 'Plan' },
  { id: 'how', label: 'How' },
  /* TWO COACHING TABS, split 2026-08-22. "Me" is him in the water on his own; "Them" is him on the
   * deck coaching somebody else. They were one tab, and every cue in it read "stand next to them
   * and watch", which answered none of the questions he was actually asking about his own swimming.
   * His words: "there's the need for another tab, like the coach for me and me coaching someone
   * else, because I want both things." */
  { id: 'me', label: 'Coach me' },
  { id: 'teach', label: 'Coach them' },
] as const;

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

/** Milliseconds to "1:48" per 100 m. Whole seconds: a pace is a rate, and hundredths on a rate
 *  computed from a whole session imply a precision the wall clock does not have. `fmtTime` in
 *  lib/swim/level.ts is the one that keeps hundredths, because a personal best is a measurement. */
function msToPace(ms: number | null): string {
  if (!ms) return 'N/A';
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  return `${min}:${String(totalSec % 60).padStart(2, '0')}`;
}

/* WHERE HE IS, AS A SWIMMER. Built 2026-08-22.
 *
 * His ask: "there have to be reference or benchmarks on timings for specific levels. I want to know
 * on what level I am with my current timings." And he called the honest problem before I hit it:
 * real standards exist only at the sharp end, so the lower tiers had to be built.
 *
 * So provenance is rendered, not hidden in a comment. Three of these tiers are published standards
 * for men aged 35 to 39 in a 25 m pool; two are multiples of one of them that I picked; one is not
 * a time at all. Showing which is which is what makes the sourced rows worth anything, and it is
 * the same reason the cue cards on this page print `confidence`. */
function SwimLevel({ standards, standings }: { standards: SwimStandards; standings: DistanceStanding[] }) {
  const withPb = standings.filter((s) => s.best);
  if (!withPb.length) return null;
  const tierName = (id: string | null) => standards.tiers.find((t) => t.id === id)?.name ?? null;
  /* The distance he is CLOSEST to levelling up in, proportionally. An absolute gap is misleading:
     18 s off at 100 m and 141 s off at 1500 m sound like the 100 is closer, and it is the furthest. */
  const closest = [...withPb]
    .filter((s) => s.next && s.best)
    .sort((a, b) => (a.next!.gapMs / a.best!.durationMs) - (b.next!.gapMs / b.best!.durationMs))[0];

  return (
    <>
      <div className="exgroup">
        <div className="exgroup-label">
          Where you are <span className="tag">(men {standards.meta.ageGroup}, {standards.meta.course} 25 m, freestyle)</span>
        </div>
        <div className="table-scroll">
          <table className="plan-table">
            <thead>
              <tr>
                <th>Distance</th>
                <th className="tnum">Your best</th>
                <th>Level</th>
                <th className="tnum">Next level</th>
              </tr>
            </thead>
            <tbody>
              {withPb.map((s) => (
                <tr key={s.distanceM}>
                  <td className="tnum">{s.distanceM} m</td>
                  <td className="tnum">
                    {fmtTime(s.best!.durationMs)}
                    <span className="quiet-inline"> {s.best!.achievedOn}</span>
                  </td>
                  <td>{tierName(s.tierId) ?? 'below the table'}</td>
                  <td className="tnum">
                    {s.next
                      ? <>{fmtTime(s.next.timeMs)} <span className="quiet-inline">for {s.next.name}</span></>
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {closest && (
          <p className="ex-cue" style={{ marginTop: 10 }}>
            The level you are closest to is <b>{closest.next!.name} at {closest.distanceM} m</b>:{' '}
            {(100 * closest.next!.gapMs / closest.best!.durationMs).toFixed(0)}% faster, which is{' '}
            {(closest.next!.gapMs / 1000 / (closest.distanceM / 100)).toFixed(1)} seconds per 100 m.
          </p>
        )}
      </div>

      {/* THE WHOLE LADDER, BEHIND A TAP. Ten rungs is 1,200px of a phone screen, and the only two
          he needs on any given day are his own and the one above it, both of which are already in
          the table above. Open it when you want to see how far the top is; otherwise it is in the
          way, which is the complaint that produced these sub-tabs in the first place. */}
      <details className="exgroup ladder-all">
        <summary className="exgroup-label">What the levels are <span className="tag">(all 10)</span></summary>
        <div className="tierlist">
          {standards.tiers.map((t) => {
            const src = standards.sources.find((x) => x.id === t.sourceId);
            const at100 = tierTimeMs(t, 100, standards.tiers);
            return (
              <div className="tier" key={t.id}>
                <div className="tier-head">
                  <span className="tier-name">{t.name}</span>
                  {/* "/100 m" read as a PACE. It is the tier's time FOR the 100, which is a different number
                      and the one place on this page a reader could quietly take away the wrong figure. */}
                  {at100 != null && <span className="tier-time tnum">{fmtTime(at100)} <span className="quiet-inline">at 100 m</span></span>}
                  <span className={`prov ${t.provenance}`}>
                    {t.provenance === 'sourced' ? 'sourced'
                      : t.provenance === 'sourced-other-course' ? 'sourced, other course'
                      : t.provenance === 'third-party' ? 'third party'
                      : t.provenance === 'constructed' ? 'our number'
                      : 'not a time'}
                  </span>
                </div>
                <div className="ex-cue">{t.what}</div>
                {/* A real tap target. These were 15px tall on the first build, which is a third of
                    the 44px floor this repo enforces, on the one control that lets him check a
                    number I am asking him to trust. */}
                {src && (
                  <a className="tier-src" href={src.url} target="_blank" rel="noreferrer">
                    {src.label}
                  </a>
                )}
              </div>
            );
          })}
        </div>
        <p className="ex-cue" style={{ marginTop: 10 }}>
          Two rungs are published standards for men your age and six come from an independent
          project that matches the official qualifying time exactly at its top rung. One is ours.
          Each says which it is, so you know what to argue with.
        </p>
      </details>

      <div className="exgroup">
        <div className="exgroup-label">What the shape of it says</div>
        <Prose text={standards.profileNote} />
        <details className="src wk">
          <summary>Why there is no 25 m or 50 m here</summary>
          <div className="src-body">
            Samsung records no personal best under 100 m. Deriving one from single lengths does not
            survive the data: the fastest length ever recorded is 9.03 s, which is faster than a
            world-record 25 m split, and filtering the sensor miscounts moves the answer from
            14.42 s to 18.55 s depending on where the threshold goes. A number that swings four
            seconds on a threshold somebody picked is not a personal best. Swim a timed 25 and 50
            from a push and they become real.
          </div>
        </details>
      </div>
    </>
  );
}

/* HIS OWN SWIMMING. Every check shows the sentence it came from and links the page, because he
 * asked for exactly that: "I don't want hallucination here so try to keep it as literal as you
 * can." The quote is on the card rather than behind a tap, so an invented cue would have nowhere
 * to hide. content/swim/validate.mjs refuses a "sourced" check with no quote and no source. */
function SwimCoachMe({ c }: { c: SwimCoaching }) {
  const byId = new Map(c.sources.map((s) => [s.id, s]));
  return (
    <>
      <div className="exgroup">
        <div className="exgroup-label">{c.theQuestion.title}</div>
        <Prose text={c.theQuestion.body} />
      </div>

      {/* COLLAPSED BY DEFAULT, and the same markup as `Cues` rather than a second pattern for the
          same job. Rendered open, these twelve took this tab to 8.21 phone screens at 390px, which
          is LONGER than the 7.9-screen page whose length he complained about in the first place.
          The wall was inherited, not introduced by the swim migration, and it had probably never
          been measured: the 2.2-screen figure in the docs was about the Now view. Closed, the
          twelve names are a checklist he can scan and each opens on its own, which is also how he
          would use them, one at a time, between lengths. */}
      <div className="exgroup-label" style={{ marginTop: 22 }}>
        What to check <span className="tag">({c.checks.length})</span>
      </div>
      <p className="lede" style={{ marginBottom: 6 }}>
        Each one is a test you perform, not a feeling you have to have. Tap to open.
      </p>
      <div className="cuelist">
        {c.checks.map((k) => {
          const src = byId.get(k.source ?? k.from ?? '');
          const quote = k.quote ?? k.fromQuote;
          return (
            <details className="cue" key={k.id}>
              <summary>
                <span className="cue-n tnum">{k.n}</span>
                <span className="cue-name">{k.name}</span>
                {k.confidence !== 'sourced' && (
                  <span className={`conf ${k.confidence}`}>{k.confidence}</span>
                )}
              </summary>
              <div className="cue-body">
                <div className="ex-cue">{k.say}</div>
                {k.say2 && <div className="ex-cue">{k.say2}</div>}
                <div className="ex-meta cue-test"><b>How you check it.</b> {k.test}</div>
                {quote && (
                  <div className="stale cue-quote">
                    <span className="k">{k.confidence === 'inference' ? 'Reasoned from' : 'Their words'}</span>
                    <p className="ex-cue">&ldquo;{quote}&rdquo;</p>
                    {src && (
                      <a className="tier-src" href={src.url} target="_blank" rel="noreferrer">{src.label}</a>
                    )}
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>

      <div className="exgroup" style={{ marginTop: 22 }}>
        <div className="exgroup-label">Where all of this comes from</div>
        <div className="tierlist">
          {c.sources.map((src) => (
            <div className="tier" key={src.id}>
              <a className="tier-src" href={src.url} target="_blank" rel="noreferrer">{src.label}</a>
              {src.note && <div className="ex-cue">{src.note}</div>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* THE HANDBOOK, for when somebody at the pool asks him what to work on.
 *
 * "I have no idea how to explain principles that I'm already familiar with but not sure how to
 * explain... I'm not really sure how to tell them what to work on or what to improve."
 *
 * The safety line is first and it is not decoration. The most valuable thing he can say to a
 * frightened non-swimmer is that he is not a teacher, and every fix here is a TEST HE CAN SEE from
 * the side of the pool rather than a sensation the other person has to report. Nothing in this file
 * was written from an agent's memory: the staging is Swim England's and the freestyle is US Masters
 * Swimming's, and the one line that has no source says so on its own card. */
function SwimTeach({ t }: { t: SwimTeaching }) {
  return (
    <>
      <div className="exgroup">
        <div className="stale">
          <span className="k">{t.beforeYouStart.title}</span>
          <Prose text={t.beforeYouStart.body} />
        </div>
      </div>

      <div className="exgroup">
        <div className="exgroup-label">{t.whatToLookFor.title}</div>
        <p className="ex-cue">{t.whatToLookFor.intro}</p>
        <div className="lookfor">
          {t.whatToLookFor.items.map((i) => (
            <div className="lf" key={i.see}>
              <div className="lf-see">{i.see}</div>
              <div className="lf-say">{i.say}</div>
            </div>
          ))}
        </div>
      </div>

      {t.stages.map((st) => (
        <div className="exgroup" key={st.id}>
          <div className="exgroup-label">
            {st.n}. {st.name}
          </div>
          <p className="ex-cue"><b>Who this is for.</b> {st.who}</p>
          <Cues
            cues={st.cues}
            heading="What to say, and what to watch for"
            intro="Each one is something you can SEE from the side of the pool, not something they have to feel and tell you about. Tap to open."
          />
        </div>
      ))}

      <div className="exgroup">
        <div className="exgroup-label">Where all of this comes from</div>
        <div className="tierlist">
          {t.sources.map((src) => (
            <div className="tier" key={src.id}>
              <a className="tier-src" href={src.url} target="_blank" rel="noreferrer">{src.label}</a>
              {src.note && <div className="ex-cue">{src.note}</div>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* Turns "Your number plus 100 m" into "500 m" once the calibration swim has happened.
 *
 * Text substitution rather than a restructured data model, deliberately: the rung wording is prose
 * that changes with the plan, and the alternative is a schema of operations that has to be kept in
 * step with sentences somebody rewrites. If a phrase stops matching, the reader sees the original
 * relative wording, which is still true and still followable. It degrades to correct. */
function resolvePiece(piece: string, base: number | null): string {
  if (!base) return piece;
  return piece
    .replace(/your number plus (\d+) m/gi, (_m, n) => `${base + Number(n)} m`)
    /* Floored at 100 m, four lengths, the smallest piece worth writing down in a 25 m pool. A
       200 m baseline made the week 7 to 8 rung resolve to "0 m", which is not a prescription. The
       ladder's own note already covers what a small baseline means for the later rungs. */
    .replace(/your number minus (\d+) m/gi, (_m, n) => `${Math.max(100, base - Number(n))} m`)
    .replace(/your number/gi, `${base} m`);
}

export default async function SwimPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const sp = await searchParams;
  const sub = SUB_TABS.find((x) => x.id === sp.s)?.id ?? 'now';

  /* One read per tab, and only the tab that is open pays for it. The four plan tabs were static
     content before the tracker moved here; giving them a Neon round trip so the Now tab could share
     a fetch would put a database call in front of a page he opens at the side of a pool. */
  const plan = await loadSwimPlan();
  const teaching = sub === 'teach' ? await loadSwimTeaching() : null;
  const coaching = sub === 'me' ? await loadSwimCoaching() : null;
  const baseline = sub === 'plan' ? await getSwimBaseline() : null;
  const now = sub === 'now'
    ? await (async () => {
        /* getRecentSessions returns newest first, so its head IS the last session. Calling
           getLastSession as well would fetch the same row a second time. */
        const [standards, pbs, recent, history] = await Promise.all([
          loadSwimStandards(), getSwimPbs(), getRecentSessions('swimming', 10), getSwimHistory(90),
        ]);
        return {
          standards,
          standings: ratedDistances(standards).map((d) => standingFor(d, pbs, standards)),
          lastSession: recent[0] ?? null,
          recent,
          history,
        };
      })()
    : null;

  return (
    <div className="wrap">
      <h1>Swim</h1>

      <SubNav sub={sub} />

      {sub === 'now' && now && (
        <>
          <LastSession s={now.lastSession} />
          <RecentSessions sessions={now.recent} kind="swimming" />

          <SwimLevel standards={now.standards} standings={now.standings} />

          {/* THE WAY INTO THE DEEP DIVE, and the only thing this page gained on 2026-08-27.
              A LINK AND NOT A SIXTH SUB-TAB. The five chips above measure 337px of a 390px screen
              and `.subtabs` is a flex row with neither wrap nor scroll, so a sixth breaks the "0
              horizontal overflows, 0 wrapped nav rows" invariant that holds across all eleven
              training views. Folding eight sections of analysis into this tab instead would add
              height to the one view he opens at the side of a pool, which is the complaint the
              sub-tabs exist to answer. It sits under the tier table because that is the question it
              extends: the table says what level he is, this says how he got there. */}
          <p className="ex-cue" style={{ marginTop: 14 }}>
            <Link href="/swim/deep">The whole record, eight years of lengths</Link>. Stroke
            efficiency over time, how each personal best got there, and what the data cannot say.
          </p>

          {/* THE HISTORY, which lived on /health until today.
              It was a section about swimming on a page about body composition, and the two numbers
              that matter most here (best pace on the wall clock, best pace with the rest removed)
              sat there with no route to the tier table that gives them meaning. Same numbers, same
              two-pace split, on the page that is about swimming. */}
          <div className="exgroup">
            <div className="exgroup-label">
              What the history says <span className="tag">({now.history.totalSessions} sessions)</span>
            </div>
            {now.history.bestMovingPacePer100mMs != null && (
              <p className="lede" style={{ marginTop: 0 }}>
                Two paces, because a swim includes standing at the wall. Whole session counts that
                rest; swimming pace removes it, and exists for{' '}
                <span className="tnum">{now.history.movingPaceSessions}</span> of{' '}
                <span className="tnum">{now.history.totalSessions}</span> sessions, the ones the
                watch timed length by length.
              </p>
            )}
            <div className="stats">
              <div>
                <div className="stat-k">Longest</div>
                <div className="stat-v">{Math.round(now.history.longestDistanceM ?? 0)}<span className="stat-u">m</span></div>
              </div>
              {/* "Best pace / 100m" was ONE tile reading 1:31, and it was wrong in the way that is
                  hardest to notice: not out of range, just quietly answering a different question
                  than its label asked. It came from a column computed two ways and a minimum always
                  picks the flattering one, so it reported a rest-excluded pace off a 300 m session
                  that ran 25 minutes with 4 minutes of swimming in it, FASTER than the official
                  100 m personal best in the table above. Two tiles, each saying which clock it ran
                  on. CAPTIONS STAY SHORT: `.stats` is a wrap-flex and a tile is as wide as its
                  widest child, so a long caption spills across the row above at 390px. */}
              <div>
                <div className="stat-k">Best pace / 100m</div>
                <div className="stat-v">{msToPace(now.history.bestWallPacePer100mMs)}</div>
                <div className="stat-d">whole session</div>
              </div>
              {now.history.bestMovingPacePer100mMs != null && (
                <div>
                  <div className="stat-k">Swimming pace / 100m</div>
                  <div className="stat-v">{msToPace(now.history.bestMovingPacePer100mMs)}</div>
                  <div className="stat-d">rest removed</div>
                </div>
              )}
            </div>
            <BarChart
              points={now.history.sessions
                .filter((s) => s.distanceM != null)
                .map((s) => ({ date: s.date, value: s.distanceM as number }))}
              unit="m"
            />
            {/* WHERE THE DATA STOPS, said out loud. The mirror went sixteen days without a swim
                refresh in August and a 5,000 m swim on the 15th, tying his longest ever, simply was
                not on the site. Nothing looked broken: a stalled sync draws exactly like three
                quiet weeks. It cannot draw like that any more. */}
            {now.history.lastSessionOn && (
              <p className="ex-cue" style={{ marginTop: 10 }}>
                Last swim the watch export has reached: {shortDate(now.history.lastSessionOn)}.
                Anything after that is unknown, not zero.
              </p>
            )}
          </div>

          <div className="exgroup">
            <div className="exgroup-label">What the lap data says</div>
            <div className="exlist">
              {/* WALKED, NOT NAMED. Until 2026-08-21 this block read three baseline fields by name
                  and summarised them in one line, and two false claims lived in those slots for
                  weeks: "600 m on 2026-06-27" (right distance, wrong date) and a best continuous
                  effort of "around 3 minutes" when the lap data says 11:36. The data had to fit the
                  sentence. Now each fact carries its own label and the page cannot outgrow what the
                  laps say. */}
              <div className="ex">
                <div className="ex-name">Where you are</div>
                {plan.baseline
                  .filter((f) => !f.secondary)
                  .map((f) => (
                    <div className="ex-cue" key={f.label}>
                      <b>{f.label}.</b> {f.value}
                    </div>
                  ))}
                {/* The backing numbers go behind a tap. Adding five labelled facts took this view to
                    5,821px on a 390px screen, which is the seven-screen scroll the tabs were built
                    to kill. The data keeps every fact; the page shows the ones that change what he
                    does. */}
                {plan.baseline.some((f) => f.secondary) && (
                  <details className="src">
                    <summary>The rest of the numbers</summary>
                    <div className="src-body">
                      {plan.baseline
                        .filter((f) => f.secondary)
                        .map((f) => (
                          <p key={f.label}>
                            <b>{f.label}.</b> {f.value}
                          </p>
                        ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {sub === 'plan' && (
        <div className="exgroup">
          <div className="exgroup-label">
            {plan.title} <span className="tag">({plan.sessionsPerWeek})</span>
          </div>
          <div className="exlist">
            <div className="ex">
              <div className="ex-name">{plan.theGoal.target}</div>
              <div className="ex-cue">{plan.theGoal.whatThatActuallyIs}</div>
              <div className="ex-cue">{plan.theGoal.whyItIsAchievable}</div>
            </div>
          </div>

          <p className="lede">{plan.structure.note}</p>

          {/* THE SLOT FOR THE NUMBER. Added 2026-08-22: every rung below reads "your number plus
              100 m" and there was nowhere to put the number, so the plan could not be followed as
              written. Above the calibration card, because once the number exists the card is
              history and the ladder is the thing he reads. */}
          <BaselineForm current={baseline} />

          {/* THE CALIBRATION SWIM SITS ABOVE THE TABLE, because every row in the table is measured
              from the number it returns and the table is unreadable without it. It is not styled as
              a row of the ladder: it is a gate on the ladder. */}
          <div className="exlist">
            <div className="ex">
              <div className="ex-name">{plan.structure.calibration.name}</div>
              <div className="ex-meta">{plan.structure.calibration.what}</div>
              <div className="ex-meta cue-test">
                <b>The test.</b> {plan.structure.calibration.test}
              </div>
              {/* The reasoning is why he trusts it, and it is also 90 words he does not need at the
                  poolside. Same treatment the cues get. */}
              <details className="src">
                <summary>Why there is no number written here</summary>
                <div className="src-body">{plan.structure.calibration.why}</div>
              </details>
            </div>
          </div>

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
                {plan.structure.ladder.map((s) => (
                  <tr key={s.weeks}>
                    <td className="tnum">{s.weeks}</td>
                    {/* NOT .nowrap any more. The rungs stopped being "2 x 400 m" on 2026-08-21 and
                        became sentences relative to his measured number, and nowrap on a sentence is
                        how you force a phone to scroll sideways. */}
                    {/* "Your number plus 100 m" becomes "500 m" the moment the number exists.
                        The relative wording stays in the DATA, because the ladder has to be
                        readable before the calibration swim and correct after it, and a stored
                        absolute would be wrong for whoever reads it first. */}
                    <td>
                      {resolvePiece(s.piece, baseline?.metres ?? null)}
                      {s.note && <div className="quiet">{s.note}</div>}
                    </td>
                    <td>{s.rest}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sub === 'how' && (
        <div className="exgroup">
          <div className="exgroup-label">How to swim it</div>
          <div className="exlist">
            <div className="ex">
              <div className="ex-name">The one change: go slower</div>
              <div className="ex-meta">{plan.theOneTechniqueChange.what}</div>
              <div className="ex-cue">{plan.theOneTechniqueChange.why}</div>
              <div className="ex-cue">{plan.theOneTechniqueChange.howToKnow}</div>
            </div>
            <div className="ex">
              <div className="ex-name">Paddles</div>
              <div className="ex-meta">{plan.paddleRule.rule}</div>
              <Prose text={plan.paddleRule.why} />
            </div>
            <div className="ex">
              <div className="ex-name">Pull buoy</div>
              <div className="ex-cue">{plan.pullBuoyRule}</div>
            </div>
            <div className="ex">
              <div className="ex-name">Drills</div>
              <div className="ex-cue">{plan.onDrills}</div>
            </div>
          </div>
          <Cues cues={plan.cues ?? []} note={plan.cuesNote} />
        </div>
      )}

      {sub === 'me' && coaching && <SwimCoachMe c={coaching} />}
      {sub === 'teach' && teaching && <SwimTeach t={teaching} />}
    </div>
  );
}
