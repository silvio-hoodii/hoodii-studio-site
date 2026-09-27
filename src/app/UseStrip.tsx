'use client';

import { useEffect, useState } from 'react';
import { daysAgo } from '@/lib/day';

/* Which apps he opened, day by day, for the last 30 days. His own device only: the route is gated,
 * so a visitor gets a 401 and this renders nothing. Built on 2026-09-27 after an audit that had to
 * GUESS what he used from Vercel's request log; this is the answer it could not get, drawn.
 *
 * Every app gets a row even when it is empty, because an empty row is the finding: an app with a blank
 * month is the next thing to question. Darker is more opens that day.
 *
 * HTML cells, not an SVG: the labels were 7px text inside a scaled viewBox, which is the one
 * rendering trap every chart on this site has already paid for. A grid of spans is the size it says. */

const APPS: [string, string][] = [
  ['home', 'Index'], ['gym', 'Gym'], ['health', 'Health'], ['swim', 'Swim'], ['run', 'Run'], ['bike', 'Bike'],
  ['curio', 'Curio'], ['music', 'Music'], ['reading', 'Reading'], ['kitchen', 'Kitchen'],
];
const DAYS = 30;

export default function UseStrip() {
  const [rows, setRows] = useState<{ day: string; app: string; opens: number }[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/me/api/opens', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.ok) setRows(j.rows); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  if (!rows) return null;
  const days = Array.from({ length: DAYS }, (_, i) => daysAgo(DAYS - 1 - i));
  const count = new Map(rows.map((r) => [`${r.app}|${r.day}`, r.opens]));
  const first = rows[0]?.day;
  return (
    <section className="usestrip" aria-label="Apps I opened, last 30 days">
      <div className="hubq-label">Opened</div>
      <div>
        <div className="ugrid" role="img" aria-label="Which apps were opened on each of the last 30 days">
          {APPS.map(([key, label]) => (
            <div className="urow" key={key}>
              <span className="ul">{label}</span>
              {days.map((d) => {
                const n = count.get(`${key}|${d}`) ?? 0;
                /* Days before tracking began are left out, not drawn as "not opened". */
                const before = first ? d < first : true;
                return (
                  <i key={d} className={before ? 'u0' : n === 0 ? 'u1' : n === 1 ? 'u2' : n <= 3 ? 'u3' : 'u4'}
                    title={before ? undefined : `${d}: ${n === 1 ? 'once' : `${n} times`}`} />
                );
              })}
            </div>
          ))}
        </div>
        <div className="ukey">last 30 days</div>
      </div>
    </section>
  );
}
