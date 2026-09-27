import type { AdherenceDay } from '@/lib/health/types';

/* THE 30-DAY ATTENDANCE STRIP. A server component since 2026-09-27: it holds no state and sat in the
 * 'use client' chart file for no reason, shipping itself to the browser. The cells were `<button>`s
 * with no handler; they are spans with a title now, which is what they always were.
 *
 * `today` is passed in, computed on the server by `src/lib/day.ts`. It was
 * `new Date().toISOString().slice(0, 10)` once: UTC, against Calgary day cells, so from about 18:00
 * Calgary no cell matched and the ring marking today vanished every evening (05-small-apps H3).
 *
 * A day past the export horizon is its own state rather than "rest": an empty cell used to mean rest
 * whether he rested or the export had not reached that day, which turned a stalled sync into a month
 * of claimed rest days. `trained` counts a logged lift (see getLiftingAdherence), so a logged day is
 * always a trained one and `logged` only adds the hole-punch. */
export default function AdherenceStrip({ days, today }: { days: AdherenceDay[]; today: string }) {
  return (
    <div>
      <div className="strip">
        {days.map((d) => {
          const cls = ['strip-cell'];
          if (!d.known) cls.push('unknown');
          if (d.trained) cls.push('trained');
          if (d.logged) cls.push('logged');
          const state = d.trained && d.logged
            ? 'trained + logged'
            : d.trained
              ? 'trained, not logged'
              : !d.known
                ? 'no data yet'
                : 'rest';
          const label = `${d.date}: ${state}`;
          return (
            <span
              key={d.date}
              className={cls.join(' ')}
              style={d.date === today ? { borderColor: 'var(--signal)' } : undefined}
              title={label}
              role="img"
              aria-label={label}
            />
          );
        })}
      </div>
      <div className="strip-legend">
        <span className="key"><span className="swatch" /> rest</span>
        <span className="key"><span className="swatch trained" /> trained</span>
        <span className="key"><span className="swatch trained logged" /> trained + logged</span>
        {days.some((d) => !d.known) && (
          <span className="key"><span className="swatch unknown" /> no data</span>
        )}
      </div>
    </div>
  );
}
