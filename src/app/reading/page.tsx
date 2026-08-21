import Link from 'next/link';
import { getAcquisitionMap, getLiveness, getQueue } from '@/lib/reading/queue-db';
import {
  dedupePriceItems, formatPriceLine, pickedViaLabel, priceChannelLabel, priceChannelOrder, trackLabel,
  verdictLabel,
} from '@/lib/reading/queue-types';
import type { AcquisitionEntry, QueueEntry } from '@/lib/reading/queue-types';

export const metadata = {
  title: 'Reading: Next up',
  description: 'The ten books queued to read next, why each is in the ten, and whether I can get it today.',
  alternates: { canonical: '/reading' },
};

/* Same reason /swim carries this: the data lives in Neon and changes whenever content/reading/
 * sync.mjs runs, with no redeploy in between. Static prerendering would bake the queue in at
 * build time and then never look at it again, which is exactly the staleness /swim already
 * solved once. */
export const dynamic = 'force-dynamic';

/* The queue is DATA, mirrored from ReadingOS/data/queue.json + data/acquire.json by
 * content/reading/sync.mjs, run by hand after refill.mjs / acquire.mjs on the laptop -- acquire.mjs
 * needs Silvio's own logged-in Chrome over CDP for CPL branch lookups and retail prices, so it can
 * never run here. Read-only: there is no /reading/api for the queue, the same as /swim.
 *
 * `position` preserves QUEUE.md's rendered order and is never a re-sort by score. That order is
 * gentlest-first, the on-ramp, which is deliberately not the pick order: The Catcher in the Rye
 * (7.07) sits first while The Grapes of Wrath (9.10) sits fifth. Showing a different order than
 * QUEUE.md would be a second, disagreeing "the queue" existing at the same time, which is the
 * exact drift this whole app is built to avoid.
 *
 * The old example here was Middlesex, "score 1, owned, the one being read". It stopped being true
 * on 2026-08-21 when the scoring was rebuilt and refill.mjs started re-ranking instead of topping
 * up. A comment naming specific data goes stale on its own; check it against queue.json before
 * trusting it.
 */
export default async function ReadingQueue() {
  const [queue, acquisitionMap, liveness] = await Promise.all([
    getQueue(), getAcquisitionMap(), getLiveness(),
  ]);

  return (
    <div className="reading">
      <p className="surf-nav">
        <span className="rtab on">Next up</span>
        <Link className="rtab" href="/reading/all">All books</Link>
        <Link className="rtab" href="/reading/shelf">Shelf check</Link>
        <Link className="rtab" href="/reading/finished">Finished</Link>
      </p>

      <h1>Next up</h1>
      <p className="blurb">
        The ten books queued to read next, why each earned a place, and whether I can actually get
        it today.
      </p>
      <p className="stat">
        <span className="tnum">{queue.length}</span> books
        {liveness.queueUpdated && <><span className="dot">·</span>queue as of {liveness.queueUpdated}</>}
      </p>

      {/* Two different states, not one, same split /swim and /health already made: a badge that
          is WRONG (a hold could have cleared, a shelf copy could be gone) is worse than a badge
          that is simply ABSENT, because absence is honest and a stale claim is not. --destructive
          only for the first: --signal stays reserved for a fact that is true right now, and a week-
          old BORROW NOW claim is the opposite of that. */}
      {liveness.hasAcquisitionData && liveness.stale && (
        <div className="stale">
          <span className="k">Acquisition status is stale</span>
          Holds move daily, and this hasn&apos;t refreshed in over a week. BORROW NOW and BUY calls
          below may no longer be right. Re-run acquire.mjs, then sync.
          {liveness.lastError && <span className="why">{liveness.lastError}</span>}
        </div>
      )}
      {!liveness.hasAcquisitionData && (
        <p className="note">
          No acquisition data synced yet. Every book below shows its ranking only, not whether
          it&apos;s actually gettable today.
          {liveness.lastError && <span className="why">{liveness.lastError}</span>}
        </p>
      )}

      {queue.map((entry) => (
        <QueueRow key={entry.key} entry={entry} acquisition={acquisitionMap.get(entry.key)} />
      ))}

      <p className="src"><Link href="/reading/about">How this works and where the numbers come from</Link></p>
    </div>
  );
}

function QueueRow({ entry, acquisition }: { entry: QueueEntry; acquisition?: AcquisitionEntry }) {
  const owned = !acquisition && (entry.status === 'reading' || entry.status === 'finished' || entry.format);
  const actionableNow = acquisition?.homeBranchNow ?? false;

  return (
    <details className="qrow">
      <summary>
        <span className="qmain">
          <span className="qt">{entry.title}</span>
          <span className="qa">{entry.author}{entry.year ? ` · ${entry.year}` : ''}</span>
        </span>
        <span className="qmeta">
          <span className="qtrack">{trackLabel[entry.track]}</span>
          {owned && <span className="verdict owned">In hand</span>}
          {acquisition && (
            <span className={`verdict${actionableNow ? ' now' : ''}`}>{verdictLabel[acquisition.verdict]}</span>
          )}
        </span>
      </summary>

      <div className="body qbody">
        {entry.why && <p className="qwhy">{entry.why}</p>}
        <p className="qpicked">
          {entry.score != null && (
            <><span className="tnum" title="How much independent evidence there is: a jury, a curated list, a reader vote, and what is being read right now. Each list weighted by how selective it is. Not a rating out of 10.">
              {entry.score} score
            </span> · </>
          )}
          Here for {pickedViaLabel(entry.pickedVia)}.
        </p>
        <p className="qtags">
          {[entry.pace, entry.era, entry.language, entry.pages ? `${entry.pages}pp` : null]
            .filter(Boolean).join(' · ')}
          {entry.mood.length > 0 && <> · {entry.mood.join(', ')}</>}
        </p>

        {owned && <p className="qacq">Already yours (status: {entry.status}{entry.format ? `, ${entry.format}` : ''}).</p>}

        {acquisition && <AcquisitionDetail acquisition={acquisition} />}
      </div>
    </details>
  );
}

function AcquisitionDetail({ acquisition }: { acquisition: AcquisitionEntry }) {
  const { verdict, verdictDetail, payload, homeBranchLabel, homeBranchNow } = acquisition;
  const branches = payload.branchInfo?.ok ? payload.branchInfo.branches : [];
  const availableBranches = branches.filter((b) => b.status === 'Available');

  return (
    <div className="qacq">
      {verdictDetail && <p className="qacq-detail">{verdictDetail}</p>}

      {verdict === 'BORROW NOW' && branches.length > 0 && (
        <div className="qbranches">
          <p className="qacq-label">
            {homeBranchNow
              ? `Available at a home branch right now: ${homeBranchLabel}.`
              : 'Not available at Westbrook or Central right now:'}
          </p>
          {!homeBranchNow && availableBranches.map((b, i) => (
            <div className="qbranch" key={i}>
              <span className="qb-name">{b.branch}</span>
              <span className="qb-status">{b.collection}</span>
            </div>
          ))}
        </div>
      )}

      {verdict === 'BUY' && payload.price && (
        <div className="qprices">
          {priceChannelOrder.map((chKey) => {
            const ch = payload.price?.[chKey];
            if (!ch) return null;
            const items = ch.ok ? dedupePriceItems(ch.items) : [];
            return (
              <div className="qpricegroup" key={chKey}>
                <span className="qp-channel">{priceChannelLabel[chKey] ?? chKey}</span>
                {ch.ok
                  ? items.map((item, i) => (
                      <span className="qp-line" key={i}>{formatPriceLine(item)}</span>
                    ))
                  : <span className="qp-line qp-failed">Not resolved: {ch.reason}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
