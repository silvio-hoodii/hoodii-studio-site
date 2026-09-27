'use client';

/* One way to write from this surface, so the 2026-08-11 bug cannot come back: both buttons in the
 * first build did `await fetch(...)` then set "sent" unconditionally, `fetch` does not reject on an
 * HTTP status, and three notes he typed at the stove were discarded while the screen said saved.
 *
 * Returns 'ok', 'locked' (the cookie is missing, SaveBlocked shows the password field in place),
 * 'offline', or the server's own reason ("note over 5000 characters"), falling back to the status. */
export type WriteResult = 'ok' | 'locked' | 'offline' | (string & {});

export async function postJson(url: string, body: unknown): Promise<WriteResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return 'offline';
  }
  if (res.ok) return 'ok';
  if (res.status === 401) return 'locked';
  const reason = await res
    .json()
    .then((j: { error?: unknown }) => (typeof j?.error === 'string' ? j.error : ''))
    .catch(() => '');
  return reason || `failed ${res.status}`;
}
