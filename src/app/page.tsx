import { fetchSpotify } from '@/lib/fetchers';
import { deriveStock, expiringSoon } from '@/lib/kitchen/stock';
import { allRecipes, offer, isOfferable } from '@/lib/kitchen/recipes';
import { computeNextUp } from '@/lib/gym/cycle';
import { today } from '@/lib/day';
import { daysAgoText } from '@/lib/format';
import { loadProgram } from '@/lib/gym/program';
import { splitName } from '@/lib/gym/program-shared';
import SiteFooter from '@/components/SiteFooter';
import { getBodyCompSummary } from '@/lib/health/db';
import { getSummary as getFrenchSummary } from '@/lib/french/db';
import { getSummary as getCurioSummary } from '@/lib/curio/db';
import { getSummary as getMusicSummary } from '@/lib/music/db';
import './hub.css';

export const dynamic = 'force-dynamic';

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
 * Corollary, and it is load-bearing: NEVER invent state for an app whose data we cannot reach.
 * Reading and Swim live elsewhere today, so they get an honest descriptor and no numbers. A
 * fabricated "3 days ago" would be worse than the cards it replaced.
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
  {
    /* This said "The shelf, the queue, and whether a book is worth keeping". The deployed app has
     * no shelf and no queue on it: it serves finish packs, which are self-graded recall cards plus
     * a debrief for a book you have finished, and one spoiler-gated companion for a book in
     * progress. Caught 2026-08-11 by reading the deployed page, which is the same way the Swim row
     * was caught two days earlier and the same underlying defect: a description written by hand
     * rather than derived will drift and still read plausibly. Both rows stay hand-written until
     * these apps become real routes, so both stay suspect. */
    label: 'Reading',
    line: 'Recall cards and a debrief for books I have finished, so I can tell whether any of it stuck',
    sub: 'plus a companion for whatever I am reading now, gated so it cannot spoil ahead',
    href: 'https://readingos.vercel.app',
    external: true,
  },
  {
    /* This said "Sessions, drills, and what to work on in the water", which is not what the app is
     * or has ever been. It is a lane-swim schedule finder: 18 Calgary pools, "Open right now" and
     * "Starting soon". Nobody caught it because the row read plausibly, which is the whole problem
     * with a description that is written rather than derived. Corrected 2026-08-11 by reading the
     * deployed page. Tracking his own swims is a different job and lives in /health. */
    label: 'Swim',
    line: 'Which Calgary pools have lane swim open right now',
    href: 'https://swim.hoodii.studio',
    external: true,
  },
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
 * Versatile has no `href` on purpose. Its hub sits behind the firm's own Entra login, so there is
 * nothing a stranger can open. Saying so is more honest than linking a door that will not budge,
 * and it is the same rule the app rows follow: never claim a state you cannot show.
 */
const WORK: Row[] = [
  {
    label: 'The Moment',
    line: 'Storefront, checkout and admin for a bakery here in Calgary',
    sub: <><span className="live tnum">154</span> real orders have gone through it</>,
    /* themomentyyc.com, NOT themoment.ca. The .ca is an unrelated business and it is wrong in
     * several repo files, which is how it kept getting shipped. Confirmed 2026-08-11 by reading the
     * title: .ca returns "The Moment | Discover Insight Today". A 200 is not a confirmation. */
    href: 'https://themomentyyc.com',
    external: true,
  },
  {
    label: 'Versatile',
    /* "eight worksheets the staff actually fill in" was the first draft and it is exactly the claim
     * the evidence ledger forbids: adoption is not something we have measured, only deployment. */
    line: 'Marketing site and the internal operations hub for a Calgary accounting firm. A tax season mapped into five phases and sixteen steps, plus eight process templates',
    sub: 'the site is public, the hub sits behind the firm’s own login',
    href: 'https://versatilecpa.ca',
    external: true,
  },
  {
    label: 'Brixel',
    line: 'Trades company. The site and the lead intake, plus the quoting and contract paperwork behind it',
    sub: 'five commercial templates, six quote revisions on one live job',
    href: 'https://brixelcorp.com',
    external: true,
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
    line: <>Two versions before this one. <span className="live tnum">1,359</span> cards generated for me up front, and exactly one review ever logged</>,
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
    plain: true,
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
  const [spotify, kitchen, gym, health, french, curio, music] = await Promise.all([
    fetchSpotify(), kitchenRow(), gymRow(), healthRow(), frenchRow(), curioRow(), musicRow(),
  ]);
  const rows = [kitchen, gym, health, french, curio, music, ...STATIC_ROWS];

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
      <SiteFooter home={false}>
        {spotify.isPlaying && spotify.title && (
          <span className="np">
            <span className="eq" aria-hidden="true"><i /><i /><i /></span>
            {spotify.url ? (
              <a href={spotify.url} target="_blank" rel="noreferrer">
                {spotify.title}{spotify.artist ? ` · ${spotify.artist}` : ''}
              </a>
            ) : (
              <span>{spotify.title}</span>
            )}
          </span>
        )}
      </SiteFooter>
    </div>
  );
}
