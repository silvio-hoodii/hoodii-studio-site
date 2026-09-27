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
 * Next's cache and revalidates on a timer. A shelf past the feed's page size (about 100 items)
 * would need `&page=2`; that is a long way off. */

export const GOODREADS_USER = '204368762';
export const GOODREADS_PROFILE = 'https://www.goodreads.com/user/show/204368762-silvio';

/* How long a fetched feed is reused. He adds a book on Goodreads and expects to see it here the
   same day, not the same minute. */
export const FEED_TTL = 6 * 60 * 60;

export interface Book {
  id: string;
  title: string;
  author: string;
  cover: string;
  pages: number | null;
  rating: number; // his stars, 0 when unrated
  avgRating: number | null;
  readAt: string | null; // YYYY-MM-DD
  addedAt: string | null; // YYYY-MM-DD, when it went on this shelf
  link: string;
}

export interface Shelves {
  current: Book[];
  read: Book[];
  want: Book[];
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

function day(s: string): string | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

export function parseFeed(xml: string): Book[] {
  const items = xml.split('<item>').slice(1).map((s) => s.split('</item>')[0] ?? '');
  return items.map((it) => {
    const pages = Number(field(it, 'num_pages'));
    const avg = Number(field(it, 'average_rating'));
    return {
      id: field(it, 'book_id'),
      title: decode(field(it, 'title')),
      author: decode(field(it, 'author_name')),
      /* The large image is about 300px wide; the medium one is 100px and blurs at the size the
         current book renders. Goodreads serves a grey placeholder at the same URL shape when a book
         has no cover, so there is always something to draw. */
      cover: field(it, 'book_large_image_url') || field(it, 'book_medium_image_url'),
      pages: Number.isFinite(pages) && pages > 0 ? pages : null,
      rating: Number(field(it, 'user_rating')) || 0,
      avgRating: Number.isFinite(avg) && avg > 0 ? avg : null,
      readAt: day(field(it, 'user_read_at')),
      addedAt: day(field(it, 'user_date_added')),
      link: `https://www.goodreads.com/book/show/${field(it, 'book_id')}`,
    };
  });
}

async function shelf(name: string): Promise<Book[] | null> {
  try {
    const r = await fetch(
      `https://www.goodreads.com/review/list_rss/${GOODREADS_USER}?shelf=${name}&per_page=100`,
      { next: { revalidate: FEED_TTL }, headers: { 'user-agent': 'Mozilla/5.0 (hoodii.studio reading page)' } },
    );
    if (!r.ok) return null;
    const xml = await r.text();
    if (!xml.includes('<rss')) return null;
    return parseFeed(xml);
  } catch {
    return null;
  }
}

export async function getShelves(): Promise<Shelves> {
  const [current, read, want] = await Promise.all([shelf('currently-reading'), shelf('read'), shelf('to-read')]);
  const when = (b: Book) => b.readAt ?? b.addedAt ?? '';
  return {
    current: current ?? [],
    read: (read ?? []).sort((a, b) => (when(a) < when(b) ? 1 : -1)),
    want: want ?? [],
    /* ok means every feed answered. A failed feed and an empty shelf look the same once parsed, and
       the page must not tell him he has read nothing because Goodreads was down. */
    ok: current !== null && read !== null && want !== null,
  };
}
