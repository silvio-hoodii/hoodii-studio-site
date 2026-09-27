import { PHASE_PRODUCTION_BUILD } from 'next/constants';

/* His Goodreads shelves, read from their public RSS feeds.
 *
 * WHY GOODREADS AND NOT READINGOS. On 2026-09-27 the usage audit found the old /reading mirror had
 * not been synced since 2026-08-22, its want list had 0 rows ever, and its shelf page was the one
 * bots hit 250,000 times in August. His words: "at some point I realized I might as well just use
 * Goodreads." So Goodreads is where he keeps books now, and this page only shows them.
 *
 * WHY RSS. Goodreads stopped issuing API keys in December 2020. Every public shelf still publishes
 * a feed at /review/list_rss/<user>?shelf=<name>, checked live on 2026-09-27, carrying cover, his
 * rating, dates, page count and shelves. No key, no database, no cost: the page fetches it through
 * Next's cache and revalidates on a timer.
 *
 * A FEED THAT LOOKS FINE AND IS NOT, three ways, each refused below rather than rendered:
 *   - A shelf name Goodreads does not know returns 200 with his WHOLE library, titled for another
 *     shelf (checked 2026-09-27 with ?shelf=nosuchshelf). So the channel title must name the shelf.
 *   - An item with no book_id or title means the format moved under the parser.
 *   - A shelf past one page (PAGE_SIZE items) used to truncate; pages are walked until one comes
 *     back short, up to MAX_PAGES. */

export const GOODREADS_USER = '204368762';
export const GOODREADS_PROFILE = 'https://www.goodreads.com/user/show/204368762-silvio';

/* How long a fetched feed is reused. He adds a book on Goodreads and expects to see it here the
   same day, not the same minute. */
export const FEED_TTL = 6 * 60 * 60;

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

export interface Book {
  id: string;
  title: string;
  author: string;
  cover: string;
  pages: number | null;
  rating: number; // his stars, 0 when unrated
  readAt: string | null; // YYYY-MM-DD
  addedAt: string | null; // YYYY-MM-DD, when it went on this shelf
  link: string;
}

export interface Shelves {
  current: Book[];
  read: Book[];
  want: Book[];
  /** Every feed answered. False when some did: the page says so rather than showing an empty shelf. */
  ok: boolean;
}

function field(item: string, name: string): string {
  const m = item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  if (!m) return '';
  return m[1]!.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'");
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* "Wed, 16 Sep 2026 16:45:18 -0700" -> "2026-09-16", read straight off the string. It went through
   Date and toISOString, which is UTC, so a book marked read in his evening landed on the next day. */
function day(s: string): string | null {
  const m = s.match(/(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})/);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2]!);
  if (mon < 0) return null;
  return `${m[3]}-${String(mon + 1).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
}

/** Parses one feed page. Throws on an item the parser cannot identify. */
export function parseFeed(xml: string): Book[] {
  const items = xml.split('<item>').slice(1).map((s) => s.split('</item>')[0] ?? '');
  return items.map((it) => {
    const id = field(it, 'book_id');
    const title = decode(field(it, 'title'));
    if (!id || !title) throw new Error('Goodreads item without book_id or title');
    const pages = Number(field(it, 'num_pages'));
    return {
      id,
      title,
      author: decode(field(it, 'author_name')),
      /* The large image is about 300px wide; the medium one is 100px and blurs at the size the
         current book renders. Goodreads serves a grey placeholder at the same URL shape when a book
         has no cover, so there is always something to draw. */
      cover: field(it, 'book_large_image_url') || field(it, 'book_medium_image_url'),
      pages: Number.isFinite(pages) && pages > 0 ? pages : null,
      rating: Number(field(it, 'user_rating')) || 0,
      readAt: day(field(it, 'user_read_at')),
      addedAt: day(field(it, 'user_date_added')),
      link: `https://www.goodreads.com/book/show/${id}`,
    };
  });
}

/** One shelf, every page. null when any page fails or the feed is not the shelf asked for. */
async function shelf(name: string): Promise<Book[] | null> {
  const books: Book[] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = await fetch(
        `https://www.goodreads.com/review/list_rss/${GOODREADS_USER}?shelf=${name}&per_page=${PAGE_SIZE}&page=${page}`,
        { next: { revalidate: FEED_TTL }, headers: { 'user-agent': 'Mozilla/5.0 (hoodii.studio reading page)' } },
      );
      if (!r.ok) return null;
      const xml = await r.text();
      if (!xml.includes('<rss')) return null;
      const channelTitle = field(xml.split('<item>')[0] ?? '', 'title');
      if (!channelTitle.endsWith(`: ${name}`)) return null;
      const got = parseFeed(xml);
      books.push(...got);
      if (got.length < PAGE_SIZE) break;
    }
    return books;
  } catch {
    return null;
  }
}

export async function getShelves(): Promise<Shelves> {
  const [current, read, want] = await Promise.all([shelf('currently-reading'), shelf('read'), shelf('to-read')]);

  /* ALL THREE FAILED: throw, so ISR keeps serving the last good page instead of caching "Goodreads
     did not answer" for six hours. At build there is no last good page, so the build renders the
     notice rather than failing a deploy over Goodreads. */
  if (current === null && read === null && want === null && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
    throw new Error('Goodreads: every shelf feed failed');
  }

  /* Newest read first; a book with no read date goes after every dated one. */
  const byRead = (a: Book, b: Book) =>
    a.readAt === b.readAt ? 0 : a.readAt === null ? 1 : b.readAt === null ? -1 : a.readAt < b.readAt ? 1 : -1;
  return {
    current: current ?? [],
    read: (read ?? []).sort(byRead),
    want: want ?? [],
    ok: current !== null && read !== null && want !== null,
  };
}
