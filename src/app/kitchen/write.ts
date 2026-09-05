'use client';

/* One way to write from this surface, so the 2026-08-11 bug cannot come back: both buttons in the
 * first build did `await fetch(...)` then set "sent" unconditionally, `fetch` does not reject on an
 * HTTP status, and three notes he typed at the stove were discarded while the screen said saved.
 *
 * Returns 'ok', 'locked' (the cookie is missing, show the password field in place), or a reason. */
export type WriteResult = 'ok' | 'locked' | 'offline' | `http-${number}`;

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
  return `http-${res.status}`;
}

export async function unlock(pw: string): Promise<boolean> {
  try {
    const res = await fetch('/kitchen/api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pw }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
