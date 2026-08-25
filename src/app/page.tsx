import { deriveStock, expiringSoon } from '@/lib/kitchen/stock';
import { allRecipes, offer, isOfferable } from '@/lib/kitchen/recipes';
import { computeNextUp } from '@/lib/gym/cycle';
import { today } from '@/lib/day';
import { daysAgoText } from '@/lib/format';
import { loadProgram } from '@/lib/gym/program';
import { splitName } from '@/lib/gym/program-shared';
import SiteFooter from '@/components/SiteFooter';
import NowPlaying from '@/components/NowPlaying';
import { getBodyCompSummary } from '@/lib/health/db';
import { getSummary as getFrenchSummary } from '@/lib/french/db';
import { getSummary as getCurioSummary } from '@/lib/curio/db';
import { getSummary as getMusicSummary } from '@/lib/music/db';
import { getSummary as getSwimSummary, getLiveness as getSwimLiveness, shortPool } from '@/lib/swim/db';
import { allPacks } from '@/lib/reading/packs';
import { getAcquisitionMap, getQueue } from '@/lib/reading/queue-db';
import { getShelfStats } from '@/lib/reading/shelf-db';
import { getWantKeys } from '@/lib/reading/want-db';
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
 */

interface Row {
  label: string;
  line: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
  external?: boolean;
  off?: boolean;
  /* Not a link, but not an absence either. `off` means an app whose data we cannot reach and which
   * therefore shows no state. `plain` means a real thing that simply has no public URL to send you
   * to, which is a different claim and should not be dimmed like a failure. */
  plain?: boolean;
}

async function kitchenRow(): Promise<Row> {
  try {
    const [stock, recipes] = await Promise.all([deriveStock(), allRecipes()]);
    /* isOfferable is shared with /kitchen. This line used to be `offer(r, stock).status === 'ready'`,
     * which ignored the read gate and the verbatim gate, so the front door announced "14 dishes you can
     * cook right now" and the page one tap away said "1 ready to start". The first thing the app did on
     * open was overpromise by 14x. */
    const ready = recipes.filter((r) => isOfferable(r) && offer(r, stock).status === 'ready').length;
    const soon = expiringSoon(stock, 5, 2);

    // Stock display names carry the shop's branding, e.g. "spring mix salad (Your Fresh Market)".
    // Useful in the kitchen, noise on the front door.
    const short = (s: string) => s.replace(/\s*\([^)]*\)/g, '').trim();

    const sub = soon.length
      ? soon
          .map((i) => `${short(i.n)}, ${i.daysLeft! <= 0 ? 'today' : `${i.daysLeft} d left`}`)
          .join(' · ')
      : 'nothing about to turn';

    return {
      label: 'Kitchen',
      line:
        ready > 0 ? (
          <>
            <span className="live tnum">{ready}</span> dish{ready === 1 ? '' : 'es'} you can cook right now
          </>
        ) : (
          'nothing ready without a shop'
        ),
      sub,
      href: '/kitchen',
    };
  } catch {
    // A database hiccup must not take the front door down with it.
    return { label: 'Kitchen', line: 'Recipes and what is in the fridge', href: '/kitchen' };
  }
}

async function gymRow(): Promise<Row> {
  try {
    const [nextUp, program] = await Promise.all([
      computeNextUp(today()),
      loadProgram(),
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
      sub: nextUp.streak > 0 ? `${nextUp.streak}-day streak` : 'logged between sets',
      href: '/gym',
    };
  } catch {
    // A database hiccup must not take the front door down with it.
    return { label: 'Gym', line: 'Upper/lower split, logged between sets', href: '/gym' };
  }
}

async function healthRow(): Promise<Row> {
  try {
    const summary = await getBodyCompSummary();
    if (!summary.latest?.kg) throw new Error('no readings');

    /* `.live` is reserved for a value that is true right now, so a reading two weeks old must not
     * wear it. The store is filled by a one-shot migration with no recurring sync behind it, which
     * means "as of 2026-08-09" would otherwise sit here reading as a current weight forever. */
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
      line: <>Weight <span className="live tnum">{summary.latest.kg.toFixed(1)} kg</span></>,
      sub: `as of ${summary.latest.date}`,
      href: '/health',
    };
  } catch {
    // A database hiccup must not take the front door down with it.
    return { label: 'Health', line: 'Weight, swim history, and lifting attendance', href: '/health' };
  }
}

async function frenchRow(): Promise<Row> {
  try {
    const s = await getFrenchSummary();
    if (s.total === 0) {
      return { label: 'French', line: 'No cards yet', sub: 'review queue built from three physical books', href: '/french' };
    }
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

async function readingRow(): Promise<Row> {
  try {
    const [packs, queue, acquisitionMap, shelf, wants] = await Promise.all([
      allPacks(), getQueue(), getAcquisitionMap(), getShelfStats(), getWantKeys(),
    ]);
    if (!packs.length && !queue.length) throw new Error('no packs, no queue');
    const borrowNowAtHome = [...acquisitionMap.values()].filter((a) => a.homeBranchNow).length;
    /* Counted off the files and the mirror, like every other row that has data behind it. This
       row's own history is why: the hand-written version once said "The shelf, the queue, and
       whether a book is worth keeping" before there was any queue feature at all, and it sat there
       reading perfectly plausibly until somebody opened the deployed page. Writing a fact down
       here that a script did not just compute is the exact mistake that comment is about. */
    return {
      label: 'Reading',
      line: borrowNowAtHome > 0
        ? <><span className="tnum">{borrowNowAtHome}</span> of the next ten on a home-branch shelf right now, <span className="tnum">{shelf.worth.toLocaleString()}</span> worth pulling in a shop</>
        : <><span className="tnum">{queue.length}</span> queued to read next, <span className="tnum">{shelf.worth.toLocaleString()}</span> worth pulling in a shop</>,
      sub: wants.size > 0
        ? `${shelf.total.toLocaleString()} books scored, ${wants.size} saved to want, ${packs.length} finished with recall cards`
        : `${shelf.total.toLocaleString()} books scored from 55 published lists, ${packs.length} finished with recall cards`,
      href: '/reading',
    };
  } catch {
    // A filesystem or Neon hiccup must not take the front door down with it.
    return { label: 'Reading', line: 'The next ten to read, and a debrief for what I have finished', href: '/reading' };
  }
}

async function swimRow(): Promise<Row> {
  try {
    const [s, live] = await Promise.all([getSwimSummary(), getSwimLiveness()]);

    /* The schedule no longer reaching today REPLACES the metric rather than sitting beside it. The
       count would be a true statement about a week that has already happened, and "0 pools open"
       reads as a quiet Sunday rather than as a broken scrape. Same move /music makes when its
       collector dies. */
    if (live.dataStale) {
      return {
        label: 'Swim',
        line: 'The pool schedule has fallen behind and is not safe to read',
        sub: live.coversThrough ? `it only runs to ${live.coversThrough}` : 'there is no schedule behind it',
        href: '/swim',
      };
    }

    return {
      label: 'Swim',
      line: s.openNow > 0
        ? <><span className="live tnum">{s.openNow}</span> Calgary pool{s.openNow === 1 ? '' : 's'} with lane swim open right now</>
        : 'No lane swim open this minute',
      sub: s.nextStart
        ? `next ${shortPool(s.nextPool ?? '')} at ${s.nextStart}`
        : `${s.poolsLive} of ${s.poolsTotal} pools covered`,
      href: '/swim',
    };
  } catch {
    // A database hiccup must not take the front door down with it.
    return { label: 'Swim', line: 'Which Calgary pools have lane swim open right now', href: '/swim' };
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
          {s.since ? ` since ${s.since.slice(0, 10)}` : ''}
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
  /* Swim used to sit here, hand-written, pointing at swim.hoodii.studio. It is a real route as of
   * 2026-08-16 and its row is DERIVED from the mirror in swimRow() above, which is the actual fix
   * for the drift this list kept producing: this row once said "Sessions, drills, and what to work
   * on in the water" for months, which the app has never been. A sentence nobody computes is a
   * sentence nobody checks. */
  /* Theories was here, pointing at theoryos-review.vercel.app, which renders nothing but its own
   * title. A link to an empty page is worse than no link and breaks the honest-states rule below.
   * The app still exists and is untouched; it is just not advertised until it has content. */
];

/* Work that other people use.
 *
 * Every number here is verified and traceable, not estimated. The order count came from the Square
 * export, the templates were counted as files, the phases and steps were counted in the deployed
 * hub. Anything that could not be checked that way is not on this page. The standing rule behind
 * that lives in CareerOS/strategy/project-evidence-ledger.md, which also lists, per project, the
 * claims that are NOT allowed: no adoption metrics, no revenue, no team-size implications, and
 * nothing that reads as an employment relationship rather than work delivered.
 *
 * Since 2026-08-16 these rows open MY page about the work rather than the client's website. The
 * client URL still exists one level down, on the "Live at" line of each page. That ordering is the
 * point: a row that jumped straight to themomentyyc.com sent you to a bakery, which tells you
 * nothing about what I did there. `external` comes off together with the href, so the glyph flips
 * from ↗ to → on its own instead of being hand-edited into agreement.
 */
const WORK: Row[] = [
  {
    label: 'The Moment',
    line: 'Storefront, checkout and admin for a bakery here in Calgary',
    /* This said "154 real orders had gone through it", meaning the storefront, and it was false.
       The 154 records in themoment/sales/exports/orders-raw.json split by Square `source.name` into
       135 with no source (sold in person at markets), 17 hand-made Payment Links, and 2 from the
       app. The online store has taken one real order since opening on 2 July 2026. The bad number
       came from CareerOS/strategy/project-evidence-ledger.md, which counted the bakery's Square
       ACCOUNT and called it throughput; that line is fixed at source.

       Still not `.live`. --signal means a value that is true right now, and this is a snapshot from
       a store this site has no connection to. Dated instead. */
    sub: <><span className="tnum">154</span> orders through July 2026, nearly all taken in person at markets. The online store has taken one</>,
    /* themomentyyc.com, NOT themoment.ca. The .ca is an unrelated business and it is wrong in
     * several repo files, which is how it kept getting shipped. Confirmed 2026-08-11 by reading the
     * title: .ca returns "The Moment | Discover Insight Today". A 200 is not a confirmation. */
    href: '/work/themoment',
  },
  {
    label: 'Versatile',
    /* "eight worksheets the staff actually fill in" was the first draft and it is exactly the claim
     * the evidence ledger forbids: adoption is not something we have measured, only deployment. */
    /* Four and fifteen, not five and sixteen. The bigger pair describes a static HTML hub retired in
     * 2026; the live one at hub.versatilecpa.ca runs s1 to s15 across four phases and says
     * "Fifteen steps, one place" on its own page. Same stale ledger line as the row above. */
    line: 'Marketing site and the internal operations hub for a Calgary accounting firm. A tax season mapped into four phases and fifteen steps, plus eight process templates',
    sub: 'the site is public, the hub sits behind the firm’s own login',
    href: '/work/versatile',
  },
  {
    /* "Trades company. The site and the lead intake, plus the quoting and contract paperwork behind
     * it" was this row until 2026-08-16, and it had the same defect Silvio found in the page: it
     * leads with the website, which is the least of it, and never names the job that happened. */
    label: 'Brixel',
    line: 'A construction company that sits between builders and the trades. I built the pricing, the quoting and the contract paperwork',
    /* Not "end to end", and not "signed". A reviewer checking this against Brixel/ on 2026-08-16
     * found the contract folders empty and the gravel phase uninvoiced. See the header comment on
     * src/app/work/brixel/page.tsx. */
    sub: 'one exterior foundation package priced, subcontracted and invoiced, on six quote revisions',
    href: '/work/brixel',
  },
];

/* What got killed, and why it is on the page at all.
 *
 * Anyone can list what they shipped, and a generated portfolio lists it better. What cannot be
 * faked is a post-mortem on your own work, because it requires having been wrong in a specific,
 * checkable way. Each `sub` is the rule that survived the thing dying, which is the only part that
 * was ever worth keeping.
 *
 * Sources, so nobody softens these later into something vaguer and less true:
 * LanguageOS/DESIGN.md (1,359 cards, 1 review), content/kitchen/schema/SOURCING.md (the burnt
 * dish), AGENTS.md (the room), _archive/red-panda-reader-2026-08-10/.
 */
const STOPPED: Row[] = [
  {
    label: 'A 3D room',
    line: 'This site used to be a WebGL studio you could walk around. I deleted it, and the eight dependencies under it, in an afternoon',
    sub: 'I had been redesigning it for months because there was nothing behind it to finish',
    plain: true,
  },
  {
    label: 'French, twice',
    /* Also not `.live`. This is a count of cards in a database that no longer exists, under a
       heading that says "what I stopped building". A finished fact about a dead project is the
       precise opposite of a value that is true right now. */
    line: <>Two versions before this one. <span className="tnum">1,359</span> cards generated for me up front, and exactly one review ever logged</>,
    sub: 'the third takes a card only from a page I have actually sat down and worked',
    plain: true,
  },
  {
    label: 'A reader',
    line: 'Built a reading app for a serial I then stopped reading. I retired it rather than keep it alive out of politeness',
    sub: 'a tool with one user should die the moment that user loses interest',
    plain: true,
  },
  {
    label: 'Written recipes',
    line: 'The first dish I ever cooked from my own kitchen app burnt. It had passed a six-source check on every quantity, a full read of all eighteen steps, and a clean validator',
    sub: 'every failure was a sentence the model wrote, and none was a number a source gave, so it now copies one published recipe and adds only what a printed page cannot',
    /* The only row in this section with a destination, because it is the only one whose post-mortem
     * got written up. Without it /work/kitchen is in the sitemap and linked from nowhere, which is
     * the orphan state the rest of the site is careful not to create. */
    href: '/work/kitchen',
  },
];

function RowView({ r }: { r: Row }) {
  const inner = (
    <>
      <div className="label">{r.label}</div>
      <div className="body">
        <div className="line">{r.line}</div>
        {r.sub && <div className="sub">{r.sub}</div>}
      </div>
      {/* Two different destinations should not wear the same glyph. Every other row on this page
          opens an app on this domain; these three open somebody else's website. */}
      <div className="arrow">{r.href && !r.off ? (r.external ? '↗' : '→') : '·'}</div>
    </>
  );

  if (!r.href) return <div className={`row ${r.plain ? 'plain' : 'off'}`}>{inner}</div>;
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
  const rows = [kitchen, gym, health, french, curio, music, swim, reading, ...STATIC_ROWS];

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
        myself. This is the front door to it.
      </p>
      <p className="blurb">
        Before these, twelve years of pointing the same instinct at other people’s problems:
        discovery, requirements and delivery, usually as the person sitting between the business and
        the engineers. These days I build the thing as well as specify it.
      </p>

      <hr />
      <div className="rows">
        {rows.map((r) => <RowView key={r.label} r={r} />)}
      </div>

      <h2 className="sec">In production</h2>
      <div className="rows">
        {WORK.map((r) => <RowView key={r.label} r={r} />)}
      </div>

      <h2 className="sec">What I stopped building</h2>
      <div className="rows">
        {STOPPED.map((r) => <RowView key={r.label} r={r} />)}
      </div>

      {/* The same row /curio and /music carry, minus the link home, because this is home. Brixel was
        * in here once and should not have been: this row is how to reach me, a company is not a
        * contact method, and it already has its own line under In production. */}
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
