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
 * AN ERROR BOUNDARY RATHER THAN A try/catch IN EACH PAGE, and the reason is the status code. A
 * caught error returns HTTP 200 with an apology in the body, which on /curio and /music, the two
 * routes this site actually wants indexed, is an invitation to index the apology in place of the
 * page. A boundary keeps the 500, which tells a crawler to come back later and tells a person
 * something readable, which is the correct pair of answers.
 *
 * `reset` re-runs the render. For a timeout that is often all it takes, and it is the one useful
 * thing to offer. It does NOT retry on its own: a page that quietly reloads itself hides how often
 * this happens, and how often it happens is worth knowing.
 */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="unreachable">
      <span className="k">Cannot reach the store</span>
      <p>
        This page could not read its database just now. Nothing is lost and nothing is wrong with
        the data: a connection failed.
      </p>
      <div className="unreachable-actions">
        <button type="button" onClick={reset}>Try again</button>
        <a href="/">Back to the index</a>
      </div>
    </div>
  );
}
