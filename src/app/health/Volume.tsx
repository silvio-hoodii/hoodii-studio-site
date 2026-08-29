import type { Coverage } from '@/lib/gym/coverage.mts';
import { MIN_EFFECTIVE_DOSE, EFFICIENT_ZONE_TOP } from '@/lib/gym/coverage.mts';

/* HOW THE FOUR DAYS ADD UP, ON A SCREEN HE CAN REACH.
 *
 * He asked three times over nine days and got a document three times:
 *
 *   "I haven't seen yet how all these days tie up together, like lower A and lower B together. Does
 *    it make sense as the 2 days within a week? Same thing for upper A and upper B and how all
 *    those 4 days add up to volume within one period?"
 *
 * The answer was computed the whole time, in scripts/gym-coverage.mjs, and had never been anywhere
 * but a terminal. His own ruling on 2026-08-27 is why this is a page and not another paragraph:
 * reasoning belongs in a document, but this is not reasoning, it is the shape of his own week.
 *
 * NO PROSE, AND THAT IS A CONSTRAINT RATHER THAN A STYLE. Note #12: "Walls of text again why do I
 * need all this, just leave the cue and thats it, it can even be hidden". So: the table, the two
 * numbers needed to read it, the source, and everything else behind a tap.
 *
 * THE TIER NAMES FROM THE PAPER ARE DELIBERATELY NOT ON SCREEN. Pelland's Table 3 labels its bands
 * "minimum", "intermediate", "lower efficiency" and so on, and "intermediate" printed next to a
 * muscle reads as a training level, which is a different claim entirely and one nobody made. The
 * numbers are the paper's; the words next to them are just where the number falls.
 */

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/* THE STATE SITS UNDER THE MUSCLE NAME, not in a column of its own, and that was decided by looking
 * at the rendered page at 390px rather than at the source. As a seventh column it was off the right
 * edge of the phone: the table scrolls sideways inside its own box, which is correct for the
 * per-day numbers and wrong for the one cell that says whether a number is a problem.
 *
 * Only the two ends of the scale are labelled. A muscle sitting inside the efficient zone gets no
 * note at all, because sixteen rows each carrying "in 5 to 10" is a column of noise that pushes the
 * two rows that matter off the screen. The legend under the table says what silence means. */
function State({ below, past }: { below: boolean; past: boolean }) {
  if (below) return <div className="vol-state under">under {MIN_EFFECTIVE_DOSE}</div>;
  if (past) return <div className="vol-state">over {EFFICIENT_ZONE_TOP}</div>;
  return null;
}

export default function Volume({
  coverage,
  dayLabels,
}: {
  coverage: Coverage;
  /** One label per entry of coverage.dayOrder, derived from each day's own title rather than
   *  hardcoded: the keys in program.json are weekday names and the split is a rotation. */
  dayLabels: string[];
}) {
  const { perMuscle, perLift, redundantPairs, totals, weekBlocks, dayOrder } = coverage;
  const strict = redundantPairs.filter((p) => p.strict);
  const loose = redundantPairs.filter((p) => !p.strict);
  const labelOfDay = (d: string) => dayLabels[dayOrder.indexOf(d)] ?? d;
  const soloCount = weekBlocks.filter((b) => b.solo).length;

  return (
    <>
      <p className="lede">
        Every set the four days ask of you, added up by muscle. A set counts once for a muscle the
        lift trains directly and half for one that only assists, which is how the study below counted
        them.
      </p>


      <div className="exgroup">
        <div className="exgroup-label">
          Weekly sets per muscle <span className="tag">({perMuscle.length} muscles)</span>
        </div>
        <div className="table-scroll">
          <table className="plan-table vol-table">
            <thead>
              <tr>
                <th className="wide">Muscle</th>
                <th className="tnum">Wk</th>
                {dayLabels.map((d) => (
                  <th className="tnum vol-day" key={d}>{d}</th>
                ))}
              </tr>
            </thead>
            {/* THE EXERCISES LIVE IN THE CELL THEY WERE COUNTED INTO. His third attempt at asking
                for this, and he was right every time: "you're saying glute, lower A, 13.5. Now I
                have to go up and somehow figure out glutes from lower A from the week, block by
                block, which doesn't really make sense ... I want the table that's on the end but I
                want the detail that's on the first part. Combine those two into one."

                Two tables meant the totals were in one and the exercises in the other, and the join
                between them was work he had to do by eye across two scroll positions. A cell reading
                "13.5" now shows its own arithmetic underneath it.

                A synergist prints at half weight and with its half-set value, because that is what
                went into the sum: BB Back Squat contributes 4 to quadriceps and 2 to spinal
                erectors, and printing "4" in both cells would make the column stop adding up.

                IT IS WIDE AND IT SCROLLS, on his instruction: "I don't care if it doesn't fit or
                anything. I want to see one table." */}
            <tbody>
              {perMuscle.map((m) => (
                <tr key={m.muscle}>
                  <td className="wide">
                    {m.label}
                    <State below={m.belowMinimum} past={m.pastEfficient} />
                  </td>
                  <td className="tnum live">{fmt(m.sets)}</td>
                  {m.byDay.map((v, i) => (
                    <td className="daycell" key={dayLabels[i] ?? i}>
                      {v ? (
                        <>
                          <div className="tnum daysum">{fmt(v)}</div>
                          <div className="whichlifts">
                            {(m.byDayDetail[i] ?? []).map((c, k) => (
                              <div className={c.primary ? 'lift' : 'lift half'} key={`${c.name}-${k}`}>
                                {c.name} <span className="tnum">{fmt(c.sets)}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <span className="log-none">.</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ex-cue">
          <span className="tnum">{MIN_EFFECTIVE_DOSE}</span> sets a week is the smallest dose that
          produced measurable growth. From <span className="tnum">{MIN_EFFECTIVE_DOSE + 1}</span> to{' '}
          <span className="tnum">{EFFICIENT_ZONE_TOP}</span> is where each extra set buys the most,
          and a muscle with no note under its name is in that band. Past{' '}
          <span className="tnum">{EFFICIENT_ZONE_TOP}</span> the extra sets still work, they just buy
          less than the ones before them. Right now <span className="tnum">{totals.below}</span>{' '}
          muscle{totals.below === 1 ? ' is' : 's are'} under the minimum and{' '}
          <span className="tnum">{totals.pastEfficient}</span> are over the top of the band. The four
          day columns scroll sideways inside the table.
        </p>
      </div>

      {/* BEHIND A TAP AND BELOW THE MATRIX, since 2026-08-28.
       *
       * "I want to see one table." The matrix above is that table. This one answers a different
       * question, which is WHERE THE EMPTY RESTS ARE, and it is the only place they appear at all,
       * so it stays. It does not get to be the second thing on screen, and it certainly does not
       * get to be the first, which it was for about an hour. */}
      {/* BEHIND A TAP, since 2026-08-28. "I want to see one table." This one answers a different
          question from the matrix above, which is where the empty rests are, and it is the only
          place they appear at all, so it stays. It does not get to be the second thing on screen. */}
      <details className="exgroup ladder-all">
        <summary className="exgroup-label">
          The week, block by block{' '}
          <span className="tag">({weekBlocks.length} blocks, {soloCount} with an empty rest)</span>
        </summary>
        <div className="table-scroll">
          <table className="plan-table vol-table weekgrid">
            {/* THREE COLUMNS, NOT SIX, AND THE SCREEN DECIDED THAT.
                The first version had Day, Block, Rest, Exercise, Sets and Feeds as six columns.
                Measured at 390px: "DB Romanian Deadlift" broke across three lines and the FEEDS
                column, which is the entire reason the table exists, sat off the right edge behind a
                sideways scroll. A table whose point is invisible without scrolling is a table he
                will read once.
                So the day, the role and the rest fold into the block cell, and the muscles fold
                under the exercise they belong to. Nothing was dropped; the same facts are stacked
                instead of spread. */}
            <thead>
              <tr>
                <th>Day and block</th>
                <th>Exercise and muscles</th>
                <th className="tnum">Sets</th>
              </tr>
            </thead>
            <tbody>
              {weekBlocks.map((b) => {
                const rows = b.solo ? [...b.slots, null] : b.slots;
                return rows.map((s, i) => (
                  <tr key={`${b.day}-${b.label}-${i}`} className={i === 0 ? 'blockstart' : undefined}>
                    {i === 0 && (
                      <td rowSpan={rows.length}>
                        {labelOfDay(b.day)}
                        <div className="blocklabel">{b.label}</div>
                        <div className="quiet">{b.role} &middot; rest {b.rest}</div>
                      </td>
                    )}
                    {s === null ? (
                      <td className="emptyrest" colSpan={2}>nothing in this rest</td>
                    ) : (
                      <>
                        <td>
                          {s.name}
                          {s.reps && <span className="quiet"> &middot; {s.reps}</span>}
                          {/* THE SEPARATOR TRAILS ITS OWN ITEM RATHER THAN LEADING THE NEXT ONE.
                              It led, inside a `white-space: nowrap` span, which glued the comma to
                              the following muscle and left the line no break point at all: measured
                              at 390px, "Quadriceps 21 over, Glutes 27.5 over, Cal" ran off the right
                              edge. A trailing comma is a break opportunity; a leading one is not. */}
                          <div className="feeds">
                            {s.feeds.map((f, k) => (
                              <span key={f.label} className={f.primary ? 'feed' : 'feed half'}>
                                {f.label} <span className="tnum">{fmt(f.weekly)}</span>
                                {f.weekly > EFFICIENT_ZONE_TOP && <span className="over"> over</span>}
                                {k < s.feeds.length - 1 && ','}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="tnum">{s.sets}</td>
                      </>
                    )}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </details>

      {/* THE SECOND DENOMINATOR, AND ADDING IT TO THE FIRST IS THE MISTAKE. Pelland reports
          hypertrophy per MUSCLE and strength per ASSESSED EXERCISE, so a lift can be well dosed for
          size and under-dosed for strength at the same time. Behind a tap because the muscle table
          is the question he asked and this is the follow-up. */}
      <details className="exgroup ladder-all">
        <summary className="exgroup-label">
          Weekly sets per lift <span className="tag">({perLift.length} lifts)</span>
        </summary>
        <p className="ex-cue">
          A different count, and it may not be added to the one above: that table is per muscle, this
          one is per lift. For getting stronger at a lift, 1 set a week is the floor and past 5 the
          extra sets stop paying reliably.
        </p>
        <div className="table-scroll">
          <table className="plan-table vol-table">
            <thead>
              <tr>
                <th className="wide">Lift</th>
                <th className="tnum">Wk</th>
                <th className="tnum">Days</th>
                <th className="nowrap">Load</th>
              </tr>
            </thead>
            <tbody>
              {perLift.map((v) => (
                <tr key={v.id}>
                  <td className="wide">{v.name}</td>
                  <td className="tnum live">{fmt(v.sets)}</td>
                  <td className="tnum">{v.days.length}</td>
                  <td className="nowrap">
                    {v.loadable ? 'yes' : <span className="vol-state under">no weight</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* A PARTNER THAT SHARES A MUSCLE WITH THE LIFT IT SITS BEHIND COSTS THAT LIFT REPS. Zhang
          2025. Two strictnesses because the loose one depends on a judgement about what a lift's
          assisting muscles are, and hiding that judgement inside a single count is how a number
          starts arguing for itself. */}
      {redundantPairs.length > 0 && (
        <details className="exgroup ladder-all">
          <summary className="exgroup-label">
            Partners that cost the lift in front of them <span className="tag">({redundantPairs.length})</span>
          </summary>
          <div className="exlist">
            {[...strict, ...loose].map((p) => (
              <div className="ex" key={`${p.day}-${p.block}-${p.partner}`}>
                <div className="ex-name">
                  {p.lead} + {p.partner}
                </div>
                <div className="ex-meta">
                  {p.day} · {p.block} · {p.sets} sets
                </div>
                <div className="ex-cue">
                  {p.strict
                    ? `Both train ${p.shared.join(', ')} as a main muscle, so the second one is done on a tired muscle.`
                    : `The lift also uses ${p.alsoShared.join(', ')}, which is what the partner trains directly. Whether that counts is a judgement, so it is shown rather than counted.`}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* NOT .quiet-inline, which carries white-space: nowrap. It is for a date riding beside a
          number, and on a paragraph it ran the citation off the right edge of the phone with the
          journal and year unreadable. Caught in a screenshot; nothing else would have shown it. */}
      <p className="ex-cue vol-cite">
        Pelland JC et al. The Resistance Training Dose Response. Sports Med. 2026;56(2):481-505,
        Tables 3 and 4. 67 studies, 2,058 participants. Zhang 2025, Sports Med 55(4):953-975, for the
        pairing rule. The counting is done by src/lib/gym/coverage.mts, the same code behind{' '}
        <code>node scripts/gym-coverage.mjs</code>, so this page and that gate cannot disagree.
      </p>
    </>
  );
}
