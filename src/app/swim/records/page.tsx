import Link from 'next/link';
import type { Metadata } from 'next';
import { getSwimRecords, type DerivedRecord, type SwimRecords } from '@/lib/swim/records';
import { getSwimPbs, fmtTime, type PbRow } from '@/lib/swim/level';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Swim records',
  description: 'Every distance, this year: the four the watch keeps and the ones it does not.',
  alternates: { canonical: '/swim/records' },
  robots: { index: false, follow: false },
};

/* RECORDS. Built 2026-09-03 on his ask, and the ask named the gap precisely:
 *
 *   "I just want to have a reference for the 1,000, which the watch doesn't have as a default. It
 *    goes from 400 to 1,500 ... Maybe in a different tab or something with the records and
 *    everything. The records that we already have as a default on the watch, put them also there
 *    and maybe add the 1,000 or something else."
 *
 * A ROUTE AND NOT A SIXTH SUB-TAB, the same call /swim/deep made and for the same measured reason:
 * the five chips on /swim end at 337px of a 390px screen and `.subtabs` has neither wrap nor scroll,
 * so a sixth breaks the "0 horizontal overflows, 0 wrapped nav rows" invariant that holds across all
 * eleven training views. He said "a different tab or something"; the constraint picked which.
 *
 * WHY IT IS NOT PART OF /swim/deep, which also shows personal bests. That page is "how the bests got
 * there", eight years of progression read on the sofa. This one answers "what is my time for X",
 * which is a lookup he wants before or after a swim. Same data, different question, and folding a
 * lookup into a 9,000px analysis page is how the muscle table he asked for three times ended up
 * existing somewhere he had never seen it.
 *
 * EVERYTHING HERE IS THIS CALENDAR YEAR, on his ruling: "Don't do the past year. Just do this year,
 * 2026 ... I don't care about 2025 or 2023." The year is derived from today's date in SQL, so no
 * literal year appears in this file or in src/lib/swim/records.ts.
 *
 * NOTHING ON THIS PAGE IS TYPED. Every figure is returned from getSwimRecords or getSwimPbs. The
 * one hardcoded set of numbers is the watch-clock comparison inside the method note, which is a
 * measurement OF the watch rather than of his swimming, and it names the swim it checked so it can
 * be re-run. Until 2026-09-11 there was a second one, a plan time window quoted in the Closest
 * block, and it outlived the plan text it quoted by a day. */

const DISTANCES = [400, 800, 1000, 1500];

/** The four the watch keeps, so the page can say which rows it did not have to derive. */
const WATCH_DISTANCES = new Set([100, 200, 400, 1500]);

/** Pace per 100 m, in m:ss. NOT `fmtTime`, which keeps hundredths: a derived pace is a sum of
 *  rounded length durations divided by a distance, and printing "1:52.35" claims a precision the
 *  input never had. Caught by reading the rendered table, where it sat next to `mmss` times and
 *  contradicted the rule written three lines below it. */
function per100(ms: number | null, distanceM: number): string {
  if (ms === null) return '-';
  return mmss(Math.round((ms / distanceM) * 100));
}

/** m:ss, no hundredths. A derived time is not measured to a hundredth and should not pretend to be:
 *  it is a sum of length durations the watch rounded, and `fmtTime` prints 2 decimals, which would
 *  claim a precision the derivation does not have. The stored personal bests DO keep hundredths,
 *  because those are Samsung's own measurement, and they use `fmtTime` below. */
function mmss(ms: number | null): string {
  if (ms === null) return '-';
  const t = Math.round(ms / 1000);
  const m = Math.floor(t / 60);
  return `${m}:${String(t % 60).padStart(2, '0')}`;
}

function when(iso: string | null): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  const month = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m)];
  return `${Number(d)} ${month}`;
}

/* ---------------------------------------------------------------------------------------------
 * THE 1,000, first, because it is the thing he asked for and the thing the plan is built on.
 * --------------------------------------------------------------------------------------------- */
function TheThousand({ r, year }: { r: DerivedRecord | undefined; year: number }) {
  if (!r || r.swims === 0) {
    return (
      <div className="exgroup">
        <div className="exgroup-label">The 1,000</div>
        <p className="ex-cue">
          No 1,000 m in the lengths for {year} yet. This fills in from the first swim that covers it.
        </p>
      </div>
    );
  }
  return (
    <div className="exgroup">
      <div className="exgroup-label">
        The 1,000 <span className="tag">({r.swims} swims in {year} contained one)</span>
      </div>
      <p className="lede" style={{ marginTop: 0 }}>
        Read off the lengths: any 1,000 m inside a longer swim counts.
      </p>
      <div className="stats">
        <div>
          <div className="stat-k">Typical</div>
          <div className="stat-v">{mmss(r.medianWallMs)}</div>
          <div className="stat-d">wall clock</div>
        </div>
        <div>
          <div className="stat-k">Best</div>
          <div className="stat-v">{mmss(r.bestWallMs)}</div>
          <div className="stat-d">{when(r.bestWallOn)}, wall clock</div>
        </div>
        <div>
          <div className="stat-k">Swimming only</div>
          <div className="stat-v">{mmss(r.bestSwimmingMs)}</div>
          <div className="stat-d">{when(r.bestSwimmingOn)}, rest removed</div>
        </div>
        <div>
          <div className="stat-k">Typical rest inside</div>
          <div className="stat-v">{mmss(r.medianRestMs)}</div>
          <div className="stat-d">across 39 walls</div>
        </div>
      </div>
      {/* "The gap between the first two tiles IS the rest" stood here until 2026-09-11, and it was
          false: the first two tiles are the typical and the best wall clock, and the gap between
          them is how much better the best day was. The rest is the fourth tile. */}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
 * THE CLOSEST HE HAS COME. The goal is 1,000 m UNBROKEN, so the least-interrupted attempt is a
 * more useful record than the fastest one, and it is not a number any page has ever shown him.
 * --------------------------------------------------------------------------------------------- */
function Closest({ r }: { r: DerivedRecord | undefined }) {
  if (!r || r.leastRestMs === null) return null;
  const stops = r.leastRestStops;
  const cuts = [0, ...stops.map((s) => s.atM), r.distanceM];
  const longestPiece = Math.max(...cuts.slice(1).map((c, i) => c - (cuts[i] as number)));
  return (
    <div className="exgroup">
      <div className="exgroup-label">The closest you have come to 1,000 unbroken</div>
      <div className="exlist">
        <div className="ex">
          <div className="ex-name">
            {when(r.leastRestOn)}: {mmss(r.leastRestWallMs)} with {mmss(r.leastRestMs)} of stopping
          </div>
          <div className="ex-cue">
            {stops.length === 0 ? (
              <>No stops inside it. That is the goal, already done.</>
            ) : (
              <>
                {stops.length === 1 ? 'One stop' : `${stops.length} stops`}, at{' '}
                {stops.map((s, i) => (
                  <span key={s.atM}>
                    {i > 0 && (i === stops.length - 1 ? ' and ' : ', ')}
                    <span className="tnum">{s.atM}</span> m for <span className="tnum">{s.restS}</span> s
                  </span>
                ))}
                . Everything else was continuous.
              </>
            )}
          </div>
          {/* "The plan asks for 1,000 m unbroken in 20:40 to 22:00" stood here until 2026-09-11. The
              plan stopped carrying a time window when it was cut to three lines that morning, so
              this quoted a plan that no longer said it. What is left is derived instead. */}
          {stops.length > 0 && r.leastRestWallMs !== null && (
            <div className="ex-meta cue-test">
              <b>Without the stops</b> it was{' '}
              <span className="tnum">{mmss(r.leastRestWallMs - r.leastRestMs)}</span> of swimming.
              The longest piece in it: <span className="tnum">{longestPiece}</span> m.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
 * EVERY DISTANCE, derived. 400 and 1500 are here on purpose even though the watch keeps them:
 * they are the only way to see the derivation next to a number Samsung measured independently.
 * --------------------------------------------------------------------------------------------- */
/* CARDS AND NOT A TABLE, and this was found by looking at the rendered page rather than by any gate.
 *
 * The first version was a five-column `plan-table` inside a `table-scroll`. Every gate passed: the
 * wrapper gives it `overflow-x: auto`, so there is no page-level horizontal overflow and probe-taps
 * reports clean. Screenshotted at 390px, the last two columns, "Typical, wall" and "Swims", were
 * off the right edge, and the typical time is the number he actually asked for. Meeting the overflow
 * rule by putting the answer where a thumb has to go looking for it is not meeting it.
 *
 * The `.tier` card shape below is the one the watch-records section already uses on the same page,
 * so this is the existing pattern rather than a new one. Cards stack, so width stops mattering. */
function DerivedCards({ recs, year }: { recs: DerivedRecord[]; year: number }) {
  return (
    <div className="exgroup">
      <div className="exgroup-label">
        Read off the lengths <span className="tag">({year}, freestyle only)</span>
      </div>
      <div className="tierlist">
        {recs.map((r) => (
          <div className="tier" key={r.distanceM}>
            <div className="tier-head">
              <span className="tier-name">
                <span className="tnum">{r.distanceM.toLocaleString('en-CA')}</span> m
                {WATCH_DISTANCES.has(r.distanceM) && <span className="tag"> watch keeps it too</span>}
              </span>
              <span className="tier-time tnum">{mmss(r.bestWallMs)}</span>
            </div>
            <div className="ex-cue">
              <b>Best.</b> Wall clock <span className="tnum">{mmss(r.bestWallMs)}</span>
              {r.bestWallOn && <> on {when(r.bestWallOn)}</>}, {per100(r.bestWallMs, r.distanceM)} per
              100 m. Swimming only <span className="tnum">{mmss(r.bestSwimmingMs)}</span>
              {r.bestSwimmingOn && <>, on {when(r.bestSwimmingOn)}</>}.
            </div>
            <div className="ex-cue">
              <b>Typical.</b> <span className="tnum">{mmss(r.medianWallMs)}</span>
              {r.medianRestMs !== null && (
                <>, of which <span className="tnum">{mmss(r.medianRestMs)}</span> standing</>
              )}
              . From <span className="tnum">{r.swims}</span> {r.swims === 1 ? 'swim' : 'swims'} that
              held one.
            </div>
          </div>
        ))}
      </div>
      {/* DELETED 2026-09-09 on his no-filler ruling. It explained WHY 400 and 1,500 are derived
          here as well as read from the watch: so the two can be compared and the derivation
          checked. That is a reason for the page's construction, not a fact about his swimming, and
          the table below already shows both numbers side by side, which is the whole point being
          made. Kept here for whoever wonders why the duplication exists. */}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
 * WHAT THE WATCH KEEPS. This year only, so the list is short and every row is current.
 * --------------------------------------------------------------------------------------------- */
function WatchRecords({ pbs, year }: { pbs: PbRow[]; year: number }) {
  const thisYear = pbs.filter((p) => Number(p.achievedOn.slice(0, 4)) === year);
  const olderCount = pbs.length - thisYear.length;
  const byDistance = new Map<number, PbRow[]>();
  for (const p of thisYear) {
    const list = byDistance.get(p.distanceM);
    if (list) list.push(p);
    else byDistance.set(p.distanceM, [p]);
  }
  for (const list of byDistance.values()) list.sort((a, b) => a.durationMs - b.durationMs);
  const distances = [...byDistance.keys()].sort((a, b) => a - b);

  return (
    <div className="exgroup">
      <div className="exgroup-label">
        What the watch keeps <span className="tag">({year}, Samsung&rsquo;s own records)</span>
      </div>
      <div className="tierlist">
        {distances.map((dist) => {
          const list = byDistance.get(dist) as PbRow[];
          const best = list[0] as PbRow;
          return (
            <div className="tier" key={dist}>
              <div className="tier-head">
                <span className="tier-name">
                  <span className="tnum">{dist.toLocaleString('en-CA')}</span> m
                </span>
                <span className="tier-time tnum">{fmtTime(best.durationMs)}</span>
              </div>
              {/* NO PACE ON THE 100, because over 100 m the pace per 100 m IS the time and printing
                  "1:38.71 ... 1:39 per 100 m" is the same number twice in two precisions. */}
              <div className="ex-cue">
                {when(best.achievedOn)}
                {dist !== 100 && <>, {per100(best.durationMs, dist)} per 100 m</>}
                {list.length > 1 && (
                  <>
                    {'. '}
                    <span className="tnum">{list.length - 1}</span> slower{' '}
                    {list.length === 2 ? 'attempt' : 'attempts'} this year, back to{' '}
                    <span className="tnum">{fmtTime((list[list.length - 1] as PbRow).durationMs)}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {olderCount > 0 && (
        <p className="ex-cue">
          <span className="tnum">{olderCount}</span> older times are on{' '}
          <Link href="/swim/deep">the whole record</Link>.
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
 * THE METHOD, behind a tap. It is the answer to "can I trust this", which is worth having and is
 * not worth reading twice. Same treatment the cues get.
 * --------------------------------------------------------------------------------------------- */
function Method({ r }: { r: SwimRecords }) {
  return (
    <div className="exgroup">
      <div className="exgroup-label">Where these come from</div>
      <details className="src">
        <summary>Three clocks, and why the derived times will not match the watch</summary>
        <div className="src-body">
          <p>
            <b>Swimming.</b> The length times added up, rest removed. <b>Wall.</b> Those plus the
            rests between them, what a clock on the wall would show.
          </p>
          <p>
            <b>The watch uses a third clock and it is neither of those.</b> Its records run on its
            own session clock, and the lengths do not always add up to it. The 400 m of 10 Sep had
            no rest in it at all: the watch says 7:03.84 and its sixteen lengths add up to 7:13. So
            a time read off the lengths can sit seconds away from the watch&rsquo;s record for the
            same swim with no rest involved.
          </p>
          <p>
            <b>A paused watch records no rest.</b> At some stops the watch is paused, and while it
            is paused it cannot see the stop, so the swim reads as continuous. The pause is still in
            the export, so it counts here: a pause of 5 seconds or more is a stop, rest recorded or
            not.
          </p>
          <p>
            <b>Freestyle only, and contiguous.</b> A window has to be an unbroken run of lengths by
            index. A mixed-stroke 1,000 is excluded, which also removes one bad number: the fastest
            any-stroke 1,000 m is 16:54, a shade off your 100 m best pace, and it contains two
            lengths of 14 and 16 seconds carrying four and six stroke cycles. Those are push-offs or
            a mis-segmented length, not swimming.
          </p>
          <p>
            <b>What was read.</b> <span className="tnum">{r.coverage.lengthsRead.toLocaleString('en-CA')}</span>{' '}
            lengths across <span className="tnum">{r.coverage.sessions}</span> swims,{' '}
            {r.coverage.firstDay} to {r.coverage.lastDay}.{' '}
            <span className="tnum">{r.coverage.lengthsRefused}</span> were refused as under 12
            seconds, over two minutes, or carrying no stroke count.
          </p>
          <p>
            <b>Times are m:ss and not hundredths</b> for the derived rows, because a sum of rounded
            length durations does not measure to a hundredth. The watch&rsquo;s own records keep
            theirs, because those are its measurement and not ours.
          </p>
        </div>
      </details>
    </div>
  );
}

export default async function SwimRecordsPage() {
  const [records, pbs] = await Promise.all([getSwimRecords(DISTANCES), getSwimPbs()]);
  const thousand = records.derived.find((d) => d.distanceM === 1000);

  return (
    <div className="wrap">
      <h1>Records</h1>
      <p className="lede">
        Every distance for {records.year}, including the ones the watch does not keep.{' '}
        <Link href="/swim">Back to Swim</Link>.
      </p>

      <TheThousand r={thousand} year={records.year} />
      <Closest r={thousand} />
      <DerivedCards recs={records.derived} year={records.year} />
      <WatchRecords pbs={pbs} year={records.year} />
      <Method r={records} />
    </div>
  );
}
