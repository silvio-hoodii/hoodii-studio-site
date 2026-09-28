'use client';

/* THE FLOOR UNDER THE ROOT LAYOUT. `src/app/error.tsx` cannot catch an error thrown by the root
 * layout itself, because a segment's error boundary sits inside that segment's layout. Without this
 * file such an error showed the framework's stock page.
 *
 * It REPLACES the root layout when active, so it renders its own <html> and <body>, and it gets no
 * global stylesheet: bare elements, no surface CSS, and `color-scheme` so the browser's own defaults
 * follow the phone's light or dark setting. Same text and same two actions as error.tsx, and the
 * same reason for `unstable_retry` over `reset` (re-fetch, not only re-render). */
export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="light dark" />
        <title>Something went wrong</title>
      </head>
      <body>
        <main>
          <h1>Something went wrong</h1>
          <p>This page failed to load.</p>
          <p>
            <button type="button" onClick={() => unstable_retry()}>Try again</button>{' '}
            {/* A real page load, not the client router this may have failed inside. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Back to the index</a>
          </p>
        </main>
      </body>
    </html>
  );
}
