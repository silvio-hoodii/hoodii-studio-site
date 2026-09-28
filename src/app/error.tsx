'use client';

/* When a page throws, which so far has meant the database did not answer.
 *
 * Observed on 2026-08-14 on a plain load of /french: Neon returned ETIMEDOUT, the query threw, and
 * the route answered a stock HTTP 500 error page. The next request succeeded, so it was a network
 * hiccup rather than a bug. The bug is that a hiccup showed a visitor a blank framework error.
 *
 * The hub has guarded against this since it was built: every row on `/` catches its own failure,
 * with the note "a database hiccup must not take the front door down with it". The app pages behind
 * it never got the same treatment, so the surfaces most likely to be linked directly were the ones
 * with no floor under them.
 *
 * AN ERROR BOUNDARY RATHER THAN A try/catch IN EACH PAGE. The status code is NOT the reason, and
 * this comment used to say it was ("a boundary keeps the 500"). That holds only where nothing has
 * streamed yet. A segment with a `loading.tsx` sends its frame first, and once the first chunk is out
 * the response is already `200 OK` and cannot change (node_modules/next/dist/docs, loading.md
 * "Status Codes" and guides/streaming.md). Most app surfaces here have one. The reason that still
 * holds is one floor under every page instead of one per page.
 *
 * THE TEXT NAMES NO CAUSE, since 2026-09-27. It said the database did not answer, which was a guess
 * about every error: a bad row or a render bug lands here too.
 *
 * `unstable_retry`, NOT `reset`, since 2026-09-27. Per the Next 16.2 docs, `reset` clears the error
 * and re-renders WITHOUT re-fetching, so after a timeout it re-rendered the same failed result;
 * `unstable_retry` re-fetches and re-renders the segment, which is what "Try again" promises. It does
 * NOT retry on its own: a page that quietly reloads itself hides how often this happens, and how
 * often it happens is worth knowing.
 */
export default function Error({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="unreachable">
      <span className="k">Something went wrong</span>
      <p>This page failed to load.</p>
      <div className="unreachable-actions">
        <button type="button" className="primary" onClick={() => unstable_retry()}>Try again</button>
        {/* A plain <a>, not next/link, and this is the one place that is right. An error boundary
            is rendering because something under it already failed; the way out should not depend on
            the client router it may have failed inside. This does a real page load. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/">Back to the index</a>
      </div>
    </div>
  );
}
