import Link from 'next/link';
import { loadConditioning } from '@/lib/gym/program';
import { getPeakHr, getRecentSessions } from '@/lib/gym/session';
import { fill, fillCue } from '@/lib/gym/hr-anchor';
import LastSession from '@/components/training/LastSession';
import SubNav from '@/components/training/SubNav';
import RecentSessions from '@/components/training/RecentSessions';
import Cues from '@/components/training/Cues';

export const dynamic = 'force-dynamic';

/* BIKE, ON ITS OWN ROUTE. Phase C, 2026-08-27.
 *
 * Lifted out of /gym/conditioning?p=bike without a word of it rewritten, same three sub-tabs and the
 * same `?s=` parameter names, so an old ?p=bike&s=how bookmark keeps its meaning through the
 * redirect in next.config.ts.
 *
 * NOTHING ON THIS PAGE WRITES A RIDE. The write route that once waited for a form was deleted unused
 * on 2026-09-27; the watch rows are the whole record. */
const SUB_TABS = [
  { id: 'now', label: 'Now' },
  { id: 'plan', label: 'Plan' },
  { id: 'how', label: 'How' },
] as const;

export default async function BikePage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const sp = await searchParams;
  const sub = SUB_TABS.find((t) => t.id === sp.s)?.id ?? 'now';
  const c = await loadConditioning();
  const recent = sub === 'now' ? await getRecentSessions('cycling', 10) : [];
  const lastSession = recent[0] ?? null;

  /* EVERY HEART-RATE FIGURE ON THIS ROUTE IS DERIVED, since 2026-08-28. Five rendered strings asserted
     that his highest recorded heart rate is 175. The export's highest is higher, 23 of his last 60
     swims beat 175, and six tie at exactly 175, which is where the number came from: it was the most
     common ceiling, not the ceiling.
     
     THE COST WAS THE STOP RULE. Cue 7 is the only stop rule in the whole week and it read "HEART RATE
     ABOVE 175, higher than anything you have ever recorded", a threshold he passes routinely. A stop
     rule that fires on a normal day is one he learns to ignore.
     
     With no peak on record, `fill` returns null and the How hard line below is not rendered, and
     `fillCue` cuts the sentence that carries the placeholder, so the stop rule keeps its knee, chest
     and head rules and loses only the heart-rate one. Neither falls back to a typed number:
     that would put a typed figure back into the sentence that exists because a typed figure was
     wrong, the catch-and-return-a-default this repo forbids in lib/music/spotify.ts. */
  const peak = sub === 'plan' || sub === 'how' ? await getPeakHr() : null;

  return (
    <div className="wrap">
      <h1>Bike</h1>

      <SubNav base="/bike" tabs={SUB_TABS} sub={sub} />

      {sub === 'now' && (
        <>
          {/* "0x A WEEK" SHIPPED TO PRODUCTION AND READ AS A FREQUENCY. `sessionsPerWeek` is 0
              for the bike, which is TRUE and means the bike is not in the current week at all, and
              the template rendered it as a rate: "Stationary bike, 0x a week, 43 minutes of
              Norwegian 4x4". Zero is not a frequency, and a page cannot say how often he does a
              thing he is not currently prescribed.

              The zero is now a BRANCH rather than a value interpolated into a sentence, which is
              the class removed: any count going to zero here used to produce a grammatical
              sentence that was nonsense. /run carries the same shape at sessionsPerWeek 2 and would
              have read the same way the day it went to 0. */}
          <p className="lede">
            {c.bike.sessionsPerWeek > 0 ? (
              <>
                {c.bike.surface}, {c.bike.sessionsPerWeek}x a week,{' '}
                {c.bike.protocol.totalMinutes} minutes of {c.bike.protocol.name}.
              </>
            ) : (
              <>
                {c.bike.surface}, not in the current week.
              </>
            )}
          </p>
          <LastSession s={lastSession} />
          {/* "Which is why the resistance levels get typed instead. Somewhere to type them is the next
              thing to land here." sat here until 2026-09-15: a promise three weeks old about a form
              that does not exist. The route behind it was deleted unused on 2026-09-27. */}
          <RecentSessions sessions={recent} kind="cycling" />
          {/* The block above reads health_session_detail, which holds few cycling rows; the log
              reads health_watch_session, which holds every ride back to 2021. */}
          <p className="ex-cue" style={{ marginTop: 14 }}>
            <Link href="/bike/log">Every ride on record</Link>
          </p>
        </>
      )}

      {sub === 'plan' && (
        <div className="exgroup">
          <div className="exgroup-label">
            {c.bike.title}{' '}
            <span className="tag">
              ({c.bike.sessionsPerWeek > 0 ? `${c.bike.sessionsPerWeek}x/week, ` : 'not this week, '}
              {c.bike.protocol.totalMinutes} min)
            </span>
          </div>
          {/* `why` and `protocol.evidenceNote` rendered here until 2026-09-15; both still in
              conditioning.json. AGENTS.md, "Page text". */}
          <div className="exlist">
            <div className="ex">
              <div className="ex-name">{c.bike.protocol.name}</div>
              <div className="ex-meta">{c.bike.protocol.structure}</div>
              <div className="ex-cue">{c.bike.protocol.shortVersion}</div>
            </div>
            <div className="ex">
              <div className="ex-name">How hard</div>
              <div className="ex-cue">{c.bike.howHard.hardPiece}</div>
              {fill(c.bike.howHard.heartRate, peak) && (
                <div className="ex-cue">{fill(c.bike.howHard.heartRate, peak)}</div>
              )}
              <div className="ex-cue">{c.bike.howHard.easyPiece}</div>
            </div>
          </div>
          <ul className="rules">
            {c.bike.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {sub === 'how' && (
        <div className="exgroup">
          <Cues
            cues={(c.bike.cues ?? [])
              .map((cue) => fillCue(cue, peak))
              .filter((cue): cue is NonNullable<typeof cue> => cue != null)}
          />
        </div>
      )}
    </div>
  );
}
