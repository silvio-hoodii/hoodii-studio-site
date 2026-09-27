'use client';

import { useEffect, useState } from 'react';
import { daysAgo } from '@/lib/day';

/* Which apps he opened, day by day, for the last 30 days. His own device only: the route is gated,
 * so a visitor gets a 401 and this renders nothing. Built on 2026-09-27 after an audit that had to
 * GUESS what he used from Vercel's request log; this is the answer it could not get, drawn.
 *
 * Every app gets a row even when it is empty, because an empty row is the finding: an app with a blank
 * month is the next thing to question. Darker is more opens that day. */

const APPS: [string, string][] = [
  ['gym', 'Gym'], ['health', 'Health'], ['swim', 'Swim'], ['run', 'Run'], ['bike', 'Bike'],
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
  const c = 7;
  const g = 2;
  const left = 52;
  const W = left + DAYS * (c + g);
  const H = APPS.length * (c + g + 2);
  return (
    <section className="usestrip" aria-label="Apps I opened, last 30 days">
      <div className="hubq-label">Opened</div>
      <div>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Which apps were opened on each of the last 30 days">
          {APPS.map(([key, label], r) => (
            <g key={key}>
              <text x={0} y={r * (c + g + 2) + c} className="ul">{label}</text>
              {days.map((d, i) => {
                const n = count.get(`${key}|${d}`) ?? 0;
                /* Days before tracking began are left out, not drawn as "not opened". */
                const before = first ? d < first : true;
                return (
                  <rect key={d} x={left + i * (c + g)} y={r * (c + g + 2)} width={c} height={c} rx="1"
                    fill="currentColor" opacity={before ? 0 : n === 0 ? 0.08 : n === 1 ? 0.45 : n <= 3 ? 0.7 : 1} />
                );
              })}
            </g>
          ))}
        </svg>
        <div className="ukey">last 30 days, since tracking began {first ?? 'today'}</div>
      </div>
    </section>
  );
}
