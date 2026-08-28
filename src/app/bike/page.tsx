import Link from 'next/link';
import { loadConditioning } from '@/lib/gym/program';
import { getPeakHr, getRecentSessions } from '@/lib/gym/session';
import { fill, fillCue } from '@/lib/gym/hr-anchor';
import LastSession from '@/components/training/LastSession';
import RecentSessions from '@/components/training/RecentSessions';
import Prose from '@/components/training/Prose';
import Cues from '@/components/training/Cues';

export const dynamic = 'force-dynamic';

/* BIKE, ON ITS OWN ROUTE. Phase C, 2026-08-27.
 *
 * Lifted out of /gym/conditioning?p=bike without a word of it rewritten, same three sub-tabs and the
 * same `?s=` parameter names, so an old ?p=bike&s=how bookmark keeps its meaning through the
 * redirect in next.config.ts.
 *
 * NOTHING ON THIS PAGE WRITES A RIDE YET, and POST /bike/api/ride is live and gated. The form is
 * Phase D. That order was deliberate: the write route shipped first so its two gates could be built
 * and broken on purpose, rather than bolted on after a form made them urgent. */
const SUB_TABS = [
  { id: 'now', label: 'Now' },
  { id: 'plan', label: 'Plan' },
  { id: 'how', label: 'How' },
] as const;

function SubNav({ sub }: { sub: string }) {
  return (
    <div className="subtabs">
      {SUB_TABS.map((t) => (
        <Link
          key={t.id}
          href={`/bike?s=${t.id}`}
          className={`subtab${sub === t.id ? ' on' : ''}`}
          aria-current={sub === t.id ? 'page' : undefined}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

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
     
     `fill` returns null rather than a default when the database has nothing, and the render below drops
     the line instead of printing a placeholder or a fallback number. A default here would put a typed
     figure back into the sentence that exists because a typed figure was wrong, which is the
     catch-and-return-a-default this repo forbids in lib/music/spotify.ts. */
  const peak = sub === 'plan' || sub === 'how' ? await getPeakHr() : null;

  return (
    <div className="wrap">
      <h1>Bike</h1>

      <SubNav sub={sub} />

      {sub === 'now' && (
        <>
          <p className="lede">
            {c.bike.surface}, {c.bike.sessionsPerWeek}x a week, {c.bike.protocol.totalMinutes} minutes
            of {c.bike.protocol.name}. The last one the watch saw is below.
          </p>
          <LastSession s={lastSession} />
          {/* ONE SENTENCE, and it is the only one here that LastSession does not already say.
              The first draft of this block opened with "the watch gives a bike session a heart rate
              and nothing else", which is the card's own second line verbatim, one paragraph apart.
              Caught by screenshotting the page rather than by reading the source, where the two
              sentences live in different files and never appear next to each other. */}
          <p className="ex-cue">
            Which is why the resistance levels get typed instead. Somewhere to type them is the next
            thing to land here.
          </p>
          <RecentSessions sessions={recent} kind="cycling" />
          {/* THE BLOCK ABOVE SAYS "the only one the watch has ever recorded" AND THAT IS FALSE.
              It reads health_session_detail, which holds one cycling row. The watch holds 76, back
              to 2021. Correcting the block itself is finding 54 and needs its own ruling; this link
              at least gives him the real number in the meantime. */}
          <p className="ex-cue" style={{ marginTop: 14 }}>
            <Link href="/bike/log">Every ride the watch recorded</Link>, back to 2021. There are more
            than the block above can see.
          </p>
        </>
      )}

      {sub === 'plan' && (
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
          <div className="exgroup-label">How to ride</div>
          <Cues
            cues={(c.bike.cues ?? []).map((cue) => fillCue(cue, peak))}
            note={c.bike.cuesNote ? (fill(c.bike.cuesNote, peak) ?? c.bike.cuesNote) : c.bike.cuesNote}
          />
        </div>
      )}
    </div>
  );
}
