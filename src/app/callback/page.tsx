import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Callback' };

/* The OAuth landing for the Spotify app, whose one registered redirect URI is
 * https://hoodii.studio/callback. It exists so re-authorising does not need a throwaway local
 * server, and it is public because the proxy matcher does not cover this path.
 *
 * It shows the authorization CODE and nothing else. It deliberately does NOT exchange the code
 * for tokens here, because the refresh token is the long-lived secret and the only safe place to
 * see it is a terminal, not a page in a browser. The code on its own is useless without the
 * client secret, is single-use, and expires in about ten minutes.
 *
 * Spotify's dashboard lists this app's Refresh Token Lifetime as 180 days while in Development
 * mode, so this page is not a one-off. Expect to come back here roughly twice a year, and note
 * that the failure it fixes is silent: fetchSpotify catches everything and returns "not playing",
 * so an expired token looks exactly like nothing being on.
 */

export default async function CallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string; state?: string }>;
}) {
  const { code, error } = await searchParams;

  return (
    <div className="cb">
      <h1>Callback</h1>

      {error && (
        <>
          <p className="lede">Spotify returned an error instead of a code.</p>
          <pre className="box err">{error}</pre>
          <p className="note">
            If that reads <code>access_denied</code> you hit Cancel on the consent screen. Open the
            authorise link again and choose Agree.
          </p>
        </>
      )}

      {code && (
        <>
          <p className="lede">Authorised. Copy this code and paste it back into the session.</p>
          <pre className="box">{code}</pre>
          <p className="note">
            Single use, and it expires in about ten minutes. It is useless on its own: exchanging it
            needs the client secret, which is not in this page or this repo. Nothing was stored
            here.
          </p>
        </>
      )}

      {!code && !error && (
        <>
          <p className="lede">Nothing to do here.</p>
          <p className="note">
            This page only means something as the destination of a Spotify authorise link, which
            arrives carrying <code>?code=</code>.
          </p>
        </>
      )}

      <p className="back">
        <Link href="/">Back to the index</Link>
      </p>
    </div>
  );
}
