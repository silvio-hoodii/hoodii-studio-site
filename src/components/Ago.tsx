'use client';

import { useSyncExternalStore } from 'react';
import { daysAgoText } from '@/lib/format';

/* "N days ago", corrected on the device, since 2026-09-27.
 *
 * The index is cached for hours, so a relative day baked in at regeneration ("yesterday") can be a
 * day old by the time he opens it after a quiet night. The server still renders the text it
 * computed, so the page paints complete and a crawler sees a sentence; once hydrated this
 * recomputes the count from the device's own calendar day.
 *
 * `useSyncExternalStore` with a constant store is the hydration-safe way to know "am I on the
 * client yet": the server snapshot says no, the client snapshot says yes, and nothing sets state
 * inside an effect (the React compiler lint refuses that shape).
 *
 * `date` is a Calgary day (YYYY-MM-DD) from src/lib/day.ts. The device's day is read in its own
 * zone, which is right whenever he and the phone are in the same place, and off by at most a day
 * when they are not, which is the same tolerance the server's day has. */
const subscribe = () => () => {};

export default function Ago({ date, text }: { date: string; text: string }) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  if (!hydrated) return <>{text}</>;
  const today = new Date().toLocaleDateString('en-CA');
  const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86_400_000);
  return <>{Number.isFinite(days) ? daysAgoText(Math.max(0, days)) : text}</>;
}
