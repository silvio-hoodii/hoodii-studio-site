import { fetchSpotify } from '@/lib/fetchers';
import { deriveStock, expiringSoon } from '@/lib/kitchen/stock';
import { allRecipes, offer } from '@/lib/kitchen/recipes';
import { computeNextUp } from '@/lib/gym/cycle';
import { getBodyCompSummary } from '@/lib/health/db';
import { getSummary as getFrenchSummary } from '@/lib/french/db';
import { getSummary as getCurioSummary } from '@/lib/curio/db';
import './hub.css';

export const dynamic = 'force-dynamic';

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
    const ready = recipes.filter((r) => offer(r, stock).status === 'ready').length;
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
            <span className="live tnum">{ready}</span> dishes you can cook right now
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
    const nextUp = await computeNextUp(new Date().toISOString().slice(0, 10));
    return {
      label: 'Gym',
      line: <>Next up <span className="live tnum">{nextUp.nextDay}</span></>,
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

const STATIC_ROWS: Row[] = [
  {
    label: 'Reading',
    line: 'The shelf, the queue, and whether a book is worth keeping',
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
      <div className="arrow">{r.href && !r.off ? '→' : '·'}</div>
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
  const [spotify, kitchen, gym, health, french, curio] = await Promise.all([
    fetchSpotify(), kitchenRow(), gymRow(), healthRow(), frenchRow(), curioRow(),
  ]);
  const rows = [kitchen, gym, health, french, curio, ...STATIC_ROWS];

  return (
    <div className="idx">
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

      <div className="foot">
        <a href="https://github.com/silvio-hoodii" target="_blank" rel="noreferrer">GitHub</a>
        <a href="https://linkedin.com/in/silvio-neyra-rivas" target="_blank" rel="noreferrer">LinkedIn</a>
        <a href="mailto:silvio@hoodii.studio">Email</a>
        {/* Brixel was here and should not have been. This row is how to reach me; a company is not
         * a contact method, and it already has its own line under In production. */}
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
      </div>
    </div>
  );
}
