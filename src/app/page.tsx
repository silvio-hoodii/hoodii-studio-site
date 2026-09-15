import { listDishes, openInbox } from '@/lib/kitchen/cookbook';
import { computeNextUp } from '@/lib/gym/cycle';
import { getTrainingStreak } from '@/lib/gym/week';
import { today } from '@/lib/day';
import { daysAgoText, shortDate } from '@/lib/format';
import { loadProgram } from '@/lib/gym/program';
import { splitName } from '@/lib/gym/program-shared';
import SiteFooter from '@/components/SiteFooter';
import NowPlaying from '@/components/NowPlaying';
import { getBodyCompSummary, getSyncLiveness } from '@/lib/health/db';
import { getSummary as getFrenchSummary } from '@/lib/french/db';
import { getSummary as getCurioSummary } from '@/lib/curio/db';
import { getSummary as getMusicSummary } from '@/lib/music/db';
import { getSwimFrontRow } from '@/lib/swim/db';
import { allPacks } from '@/lib/reading/packs';
import { getReadingFrontRow } from '@/lib/reading/queue-db';
import './hub.css';

/* ISR. Added 2026-08-22 at 60 seconds after Active CPU passed the Hobby allowance, raised to 600
 * on 2026-08-25 after measuring what it was actually costing.
 *
 * This is the front door and it makes ten data calls per render, so it took the full weight of
 * every crawler. force-dynamic meant one render per request forever; at 60s a thousand bot hits
 * cost about sixteen renders instead of a thousand. It does NOT reintroduce the build-time
 * staleness problem AGENTS.md warns about: ISR regenerates against Neon, it does not bake at build.
 *
 * WHY 600 NOW. With the scraper blocked, this route was still 67.1% of ALL remaining Active CPU on
 * the whole Vercel account: 42.3 seconds across 178 regenerations in 13 hours, about 237ms of CPU
 * each, because every regeneration runs all ten calls. And the rate did not move when the crawler
 * was blocked (13.7/hr before, 13.5/hr after), so the regenerations were never bot-driven at the
 * margin: they were demand-limited by the 60-second window itself. Every minute that anyone at all
 * asks for this page is a minute it rebuilds. Ten minutes caps that at six an hour.
 *
 * The 60-second version's comment said the trade was Spotify now-playing going stale. That was
 * already untrue when it was written: NowPlaying moved to a client component the SAME DAY (see the
 * header of components/NowPlaying.tsx) and fetches /api/spotify itself, which sets its own
 * s-maxage=60. Nothing about this number touches it.
 *
 * What 600 actually trades is the app-state rows: dishes ready, next lift, queue length. Those
 * change when he cooks or trains, a few times a day, not every minute. And ISR serves the stale
 * copy WHILE regenerating, so the lag is never a wait, only an older number. */
export const revalidate = 600;

/* Declared here rather than in the root layout, where it would be inherited by every route and
 * would tell a crawler the whole site is a duplicate of this page. */
export const metadata = { alternates: { canonical: '/' } };

/* The index shows STATE, not link labels.
 *
 * That is the whole anti-generic move, and it matters more than any palette. Six cards saying what
 * each app is could be generated for anyone. "14 dishes ready now, beef 350 g, 2 days left" could
 * only ever be this page. Content is what makes it look human, so the design's job is to get out
 * of the way of the content.
 *
 * Corollary, and it is load-bearing: NEVER invent state for an app whose data we cannot reach. A
 * fabricated "3 days ago" would be worse than the cards it replaced. Reading and Swim were the two
 * standing examples, and Swim stopped being one on 2026-08-16: it is a route with a mirror behind
 * it now, so its row is computed rather than written. That is the real cure for the drift. The
 * hand-written version of that row described the wrong app for months and read perfectly well the
 * whole time it was wrong.
 *
 * Swim proved the rule twice. On 2026-08-26 the pool schedule it was computed from was deleted, and
 * because the row was a computation rather than a sentence, what needed changing was visible: the
 * function stopped compiling against a table that no longer exists. A hand-written line would have
 * gone on describing a scraper that had been switched off.
 */

interface Row {
  label: string;
  line: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
  external?: boolean;
  off?: boolean;
}

async function kitchenRow(): Promise<Row> {
  try {
    /* Rebuilt 2026-09-05. This row used to print how many dishes he could cook right now, scored
     * against a fridge model that stopped being fed on 2026-08-23 and kept being read. The kitchen
     * is a cookbook now: dishes he chose, each with the publisher's recipe and a shopping list. The
     * honest numbers are how many there are and whether an ask of his is still waiting for a session. */
    const [dishes, inbox] = await Promise.all([listDishes(), openInbox()]);
    const n = dishes.length;
    return {
      label: 'Kitchen',
      line: (
        <>
          <span className="live tnum">{n}</span> dish{n === 1 ? '' : 'es'} with a recipe and a list
        </>
      ),
      sub: inbox.length
        ? `${inbox.length} ask${inbox.length === 1 ? '' : 's'} waiting for a session`
        : dishes[0]
          ? `latest: ${dishes[0].name}`
          : undefined,
      href: '/kitchen',
    };
  } catch {
    // A database hiccup must not take the front door down with it.
    return { label: 'Kitchen', line: 'Dishes I chose, with their recipes and lists', href: '/kitchen' };
  }
}

async function gymRow(): Promise<Row> {
  try {
    const [nextUp, program, streak] = await Promise.all([
      computeNextUp(today()),
      loadProgram(),
      getTrainingStreak(),
    ]);
    const day = program.days[nextUp.nextDay];
    const next = day ? splitName(day) : nextUp.nextDay;
    const since = nextUp.daysSince;

    /* "Next up Lower B" is true after a week off and after a rest day, and it reads the same either
     * way: a row that only ever says what is queued cannot say that nothing has happened. The gap
     * is the more useful fact once it opens, so past a single rest day it leads. */
    return {
      label: 'Gym',
      line:
        since != null && since > 1 ? (
          <>Last trained <span className="live tnum">{daysAgoText(since)}</span>, next up {next}</>
        ) : (
          /* "Lower B" is a name, not a number: it had .tnum on it, and --signal, which globals
             reserves for a value that is true right now. /gym renders the same string in plain grey
             one click away. Nothing in this branch is a live number, so nothing is green. */
          <>Next up <b>{next}</b></>
        ),
      /* The streak here and the streak on the week page are now the same number out of the same
         function. Until 2026-08-26 this row counted only days the app logged, so a swim or a run
         the watch recorded advanced the count one click away and not here. */
      sub: streak.run > 0 ? `${streak.run}-day streak` : 'logged between sets',
      href: '/gym',
    };
  } catch {
    // A database hiccup must not take the front door down with it.
    return { label: 'Gym', line: 'Two sessions, alternated, logged between sets', href: '/gym' };
  }
}

async function healthRow(): Promise<Row> {
  try {
    /* TWO CONDITIONS, NOT ONE, and they are genuinely different facts.
     *
     * `summary.stale` is "he has not weighed himself in a fortnight". `sync.stale` is "the mirror on
     * the laptop stopped writing", which /health itself has shouted at 36 hours since it was built
     * and which this row did not consult at all. So between 36 hours and 14 days of a dead pipeline
     * the hub showed the weight in `.live` with "as of {date}" while /health, one tap away, said
     * "Not syncing. Everything below is whatever it held at that point." Two surfaces disagreeing
     * about the same condition. 05-small-apps H5.
     *
     * The distinction matters in the other direction too: a dead mirror is not evidence he stopped
     * training, and telling him he has not measured when the pipeline is what broke sends him to the
     * scale to fix a laptop. */
    const [summary, sync] = await Promise.all([getBodyCompSummary(), getSyncLiveness()]);
    if (!summary.latest?.kg) throw new Error('no readings');

    /* `.live` is reserved for a value that is true right now, so a reading two weeks old must not
     * wear it, and neither must one arriving through a pipeline that has stopped. */
    if (sync.stale) {
      return {
        label: 'Health',
        line: <>Weight <span className="tnum">{summary.latest.kg.toFixed(1)} kg</span>, last measured {daysAgoText(summary.daysSinceLatest ?? 0)}</>,
        sub: 'the sync from the watch has stopped, so nothing here is moving',
        href: '/health',
      };
    }
    if (summary.stale) {
      return {
        label: 'Health',
        line: <>Weight <span className="tnum">{summary.latest.kg.toFixed(1)} kg</span>, last measured {daysAgoText(summary.daysSinceLatest ?? 0)}</>,
        sub: `no measurement since ${summary.latest.date}`,
        href: '/health',
      };
    }
    return {
      label: 'Health',
      /* Green only for a reading from today or yesterday, since 2026-09-15. It was green up to the
         14-day stale line, so a nine-day-old weight wore the colour reserved for a value true right
         now, beside a raw ISO date. The age now reads the same way it does in the two branches above. */
      line: <>Weight <span className={(summary.daysSinceLatest ?? 0) <= 1 ? 'live tnum' : 'tnum'}>{summary.latest.kg.toFixed(1)} kg</span></>,
      sub: `last measured ${daysAgoText(summary.daysSinceLatest ?? 0)}`,
      href: '/health',
    };
  } catch {
    // A database hiccup must not take the front door down with it.
    return { label: 'Health', line: 'Weight and lifting attendance', href: '/health' };
  }
}

/* A ROW RETURNS NULL WHEN ITS APP HAS NOTHING CURRENT TO SAY, since 2026-09-15, on his call. French
 * and Reading were two of eight rows and one said "No cards yet" while the other said its library
 * check was 26 days old, so a quarter of the front door advertised an app with nothing in it. Both
 * come back on their own the moment the data does: this is a condition, not a deletion. */
async function frenchRow(): Promise<Row | null> {
  try {
    const s = await getFrenchSummary();
    if (s.total === 0) return null;
    return {
      label: 'French',
      line: s.dueNow > 0 ? <><span className="live tnum">{s.dueNow}</span> due</> : 'nothing due today',
      sub: s.streak > 0 ? `${s.streak}-day streak` : `${s.total} cards`,
      href: '/french',
    };
  } catch {
    // A database hiccup must not take the front door down with it.
    return { label: 'French', line: 'Review queue built from three physical books', href: '/french' };
  }
}

async function readingRow(): Promise<Row | null> {
  try {
    /* ONE Neon round trip for all six numbers plus liveness, not five concurrent ones. See
       `getReadingFrontRow` in src/lib/reading/queue-db.ts. `allPacks()` is the filesystem and stays
       separate. */
    const [packs, r] = await Promise.all([allPacks(), getReadingFrontRow()]);
    if (!packs.length && !r.queued) throw new Error('no packs, no queue');
    /* Hidden past the seven-day window rather than shouting about it. See the note above frenchRow. */
    if (r.liveness.stale) return null;

    /* Counted off the files and the mirror, like every other row that has data behind it. This
       row's own history is why: the hand-written version once said "The shelf, the queue, and
       whether a book is worth keeping" before there was any queue feature at all, and it sat there
       reading perfectly plausibly until somebody opened the deployed page. Writing a fact down
       here that a script did not just compute is the exact mistake that comment is about.

       "55 published lists" WAS SUCH A FACT, typed into the sub line below this very comment, and it
       is `r.sourceLists` now (04-reading P3-1). It was true when written and AGENTS.md, which
       carries the same number in prose, already said 33.

       "RIGHT NOW" IS GATED, since 2026-08-28. This row claimed "N of the next ten on a home-branch
       shelf right now" off a snapshot that was six days old the day the audit read it, and it never
       called getLiveness at all (04-reading P1-1, audit theme T3). The sync is run by hand and holds
       move daily. So past a day the sentence dates itself instead of asserting a present tense: "on
       a home-branch shelf as of Aug 20" is still a useful thing to know and is the difference
       between a mirror and a lie. Past the seven-day window the count is dropped entirely, because
       at that point nobody knows. */
    const borrowNowSayable = r.borrowNowAtHome > 0;
    const asOf = r.liveness.acquireGenerated
      ? new Date(r.liveness.acquireGenerated).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
      : null;

    return {
      label: 'Reading',
      line: borrowNowSayable
        ? (r.liveness.homeBranchNowStale
            ? <><span className="tnum">{r.borrowNowAtHome}</span> of the next ten on a home-branch shelf as of {asOf}, <span className="tnum">{r.shelfWorth.toLocaleString()}</span> worth pulling in a shop</>
            : <><span className="tnum">{r.borrowNowAtHome}</span> of the next ten on a home-branch shelf right now, <span className="tnum">{r.shelfWorth.toLocaleString()}</span> worth pulling in a shop</>)
        : <><span className="tnum">{r.queued}</span> queued to read next, <span className="tnum">{r.shelfWorth.toLocaleString()}</span> worth pulling in a shop</>,
      /* The stale shout that lived here is gone with the row: past the window the row is hidden. */
      sub: r.wants > 0
        ? `${r.shelfTotal.toLocaleString()} books scored, ${r.wants} saved to want, ${packs.length} finished with recall cards`
        : `${r.shelfTotal.toLocaleString()} books scored from ${r.sourceLists} published lists, ${packs.length} finished with recall cards`,
      href: '/reading',
    };
  } catch {
    // A filesystem or Neon hiccup must not take the front door down with it.
    return { label: 'Reading', line: 'The next ten to read, and a debrief for what I have finished', href: '/reading' };
  }
}

async function swimRow(): Promise<Row> {
  try {
    const s = await getSwimFrontRow();
    if (!s.lastDate) throw new Error('nothing synced');

    /* THIS ROW USED TO COUNT POOLS. It read "N Calgary pools with lane swim open right now", off
       six scrapers and a nightly mirror, and all of that was deleted on 2026-08-26 along with the
       only answer anywhere to that question. What /swim holds now is his own swimming, so the row
       shows his own swimming.

       Still derived rather than written, which is the part that matters and the reason this
       function exists at all: this row once said "Sessions, drills, and what to work on in the
       water" for months, which the app had never been. A sentence nobody computes is a sentence
       nobody checks.

       No `.live` class. --signal is reserved for a value that is true RIGHT NOW, and the last swim
       is a thing that happened, sometimes three days ago. The old row earned the green because a
       pool being open at 6am is true at 6am. */
    const days = Math.max(0, Math.round((Date.parse(today()) - Date.parse(s.lastDate)) / 86400000));
    return {
      label: 'Swim',
      line: (
        <>
          Last swim <b className="tnum">{Math.round(s.lastDistanceM ?? 0)} m</b>, {daysAgoText(days)}
        </>
      ),
      sub: `${s.totalSessions} sessions, longest ${Math.round(s.longestDistanceM ?? 0).toLocaleString('en-CA')} m`,
      href: '/swim',
    };
  } catch {
    // A database hiccup must not take the front door down with it.
    return { label: 'Swim', line: 'Where I am in the water, and the plan to swim 1,000 m unbroken', href: '/swim' };
  }
}

async function curioRow(): Promise<Row> {
  try {
    const s = await getCurioSummary();
    if (!s.items) throw new Error('nothing synced');
    return {
      label: 'Curio',
      line: <><span className="live tnum">{s.items}</span> things I looked up properly</>,
      sub: s.latestQuestion ?? `${s.digests} mornings`,
      href: '/curio',
    };
  } catch {
    // A database hiccup must not take the front door down with it.
    return { label: 'Curio', line: 'Questions I wondered about, answered and kept', href: '/curio' };
  }
}

async function musicRow(): Promise<Row> {
  try {
    const s = await getMusicSummary();

    /* A broken collector outranks any number this row could show. Plays are perishable: while the
     * refresh token is dead, listening is being lost permanently rather than merely not displayed,
     * so the row says so instead of quietly rendering a count that has stopped moving. */
    if (s.liveness.stale) {
      return {
        label: 'Music',
        line: 'The collector has stopped, so plays are being lost',
        sub: s.liveness.lastOkAt
          ? `last good run ${s.liveness.lastOkAt.slice(0, 10)}`
          : 'it has never completed a run',
        href: '/music',
      };
    }
    if (s.plays === 0) {
      return { label: 'Music', line: 'Nothing collected yet', sub: 'the first scheduled run fills it in', href: '/music' };
    }
    /* Was "plays kept that Spotify would have dropped". Spotify hands back the last fifty plays on
     * request, and the table holds fifty: exactly one batch, nothing yet preserved that asking again
     * would not return. The sentence becomes true after months of collecting and was being told from
     * day one. What is true today is the count and the date it starts at.
     *
     * And a count with a start date implies accumulation, which is its own quiet overclaim. Checked
     * against music_sync on 2026-08-14: the collector has run cleanly three times a day since
     * 2026-08-11 and added zero plays every time, because all fifty arrived in one backfill that hit
     * the API's fifty-item cap. So the row states the age of the newest play too, once it is old
     * enough to mean something. The liveness alarm above cannot cover this: those runs succeeded. */
    const newestAgeDays = s.latest
      ? Math.floor((Date.now() - Date.parse(s.latest)) / 86_400_000)
      : null;
    return {
      label: 'Music',
      line: (
        <>
          <span className="live tnum">{s.plays}</span> plays collected
          {s.since ? ` since ${shortDate(s.since.slice(0, 10))}` : ''}
        </>
      ),
      sub:
        newestAgeDays != null && newestAgeDays >= 2
          ? `nothing new for ${newestAgeDays} days, newest play ${s.latest?.slice(0, 10)}`
          : `${s.artists} artists, ${s.tracks} tracks`,
      href: '/music',
    };
  } catch {
    // A database hiccup must not take the front door down with it.
    return { label: 'Music', line: 'What I listen to, and a history Spotify does not keep', href: '/music' };
  }
}

const STATIC_ROWS: Row[] = [
  /* Swim used to sit here, hand-written, pointing at swim.hoodii.studio. It became a real route on
   * 2026-08-16 and its row has been DERIVED ever since, which is the actual fix for the drift this
   * list kept producing. What it derives FROM changed on 2026-08-26, when the pool schedule was
   * deleted and /swim became his own swimming: see swimRow() above. */
  /* Theories was here, pointing at theoryos-review.vercel.app, which renders nothing but its own
   * title. A link to an empty page is worse than no link and breaks the honest-states rule below.
   * The app still exists and is untouched; it is just not advertised until it has content. */
];

function RowView({ r }: { r: Row }) {
  const inner = (
    <>
      <div className="label">{r.label}</div>
      <div className="body">
        <div className="line">{r.line}</div>
        {r.sub && <div className="sub">{r.sub}</div>}
      </div>
      {/* An app on this domain gets →, somebody else’s website gets ↗. */}
      <div className="arrow">{r.href && !r.off ? (r.external ? '↗' : '→') : '·'}</div>
    </>
  );

  if (!r.href) return <div className="row off">{inner}</div>;
  return (
    <a className="row" href={r.href} {...(r.external ? { target: '_blank', rel: 'noreferrer' } : {})}>
      {inner}
    </a>
  );
}

export default async function Home() {
  const [kitchen, gym, health, french, curio, music, swim, reading] = await Promise.all([
    kitchenRow(), gymRow(), healthRow(), frenchRow(), curioRow(), musicRow(), swimRow(), readingRow(),
  ]);
  const rows = [kitchen, gym, health, french, curio, music, swim, reading, ...STATIC_ROWS].filter(
    (r): r is Row => r !== null,
  );

  /* Who this is, in the form a search engine reads rather than infers. Both links are already
   * printed in the footer below, so nothing here is newly public. `sameAs` is the whole point: it
   * is what ties this domain to the GitHub and LinkedIn profiles as one person instead of three
   * unrelated pages that happen to share a name. */
  const person = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Silvio Neyra',
    url: 'https://hoodii.studio',
    email: 'mailto:silvio@hoodii.studio',
    address: { '@type': 'PostalAddress', addressLocality: 'Calgary', addressRegion: 'AB', addressCountry: 'CA' },
    sameAs: ['https://github.com/silvio-hoodii', 'https://linkedin.com/in/silvio-neyra-rivas'],
  };

  return (
    <div className="idx">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(person) }} />
      <div className="top">
        <h1>Silvio Neyra</h1>
        <span className="where">Calgary</span>
      </div>
      <p className="blurb">
        Small software for an audience of one, mostly to answer questions I got tired of asking
        myself.
      </p>
      {/* THE PORTFOLIO LAYER WAS REMOVED ON 2026-09-15, on his call: a résumé paragraph, a row about
        * the build gates, three client projects under "In production" and four post-mortems under
        * "What I stopped building", plus the /work pages behind them. His words: "i dont like the
        * content itself ... its clearly ai lsopppy so i rather just take it out and foucs on the
        * actual apps". The front door is the apps. Do not add a section about the person, the clients
        * or the process back without him asking for it. Recoverable from git history. */}

      <hr />
      <div className="rows">
        {rows.map((r) => <RowView key={r.label} r={r} />)}
      </div>

      {/* The same row /curio and /music carry, minus the link home, because this is home. Brixel was
        * in here once and should not have been: this row is how to reach me, and a company is not a
        * contact method. */}
      {/* Guarded on `title`, not on `isPlaying`. It used to be both, which meant that on a quiet
        * evening `fetchSpotify` fetched a perfectly good last-played track, returned it, and this
        * line threw it away. The API offers both and the fetcher already asked for both.
        *
        * `title` is also the right guard for the trap in AGENTS.md: fetchSpotify returns
        * `{ isPlaying: false }` for a dead refresh token AND for nobody listening, and the two are
        * indistinguishable from that flag alone. A dead token yields no title, so it still renders
        * nothing. Do not add a fallback that gives this a title when the token is gone: that would
        * turn a silent 180-day expiry into a footer that looks fine.
        *
        * The equaliser is the only thing here wearing --signal, and it appears only while something
        * is actually playing, which is what that colour is reserved for. A last-played track is a
        * fact about the past and gets a plain label and its own age instead. */}
      <SiteFooter home={false}>
        <NowPlaying />
      </SiteFooter>
    </div>
  );
}
