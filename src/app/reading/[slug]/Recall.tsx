'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import type { Card, Pack } from '@/lib/reading/types';
import { cardKindLabel } from '@/lib/reading/types';

/* The recall deck: one card at a time, you say whether you knew it, and the miss report tells you
 * which stretch of the book to re-read.
 *
 * localStorage and no API route, matching what this app already did and what /curio does for reads.
 * There is nothing here worth a database: grades are per-device, per-book, and losing them costs one
 * run of a deck. Writing them to Neon would mean an auth cookie on a page whose whole appeal is that
 * a stranger can open it, which is a bad trade for a number that means nothing to anyone else.
 *
 * localStorage IS the state, read through useSyncExternalStore rather than copied into useState on
 * mount. The copy version is the obvious one and it is wrong twice: React 19 flags the synchronous
 * setState inside the effect as a cascading render, and a value duplicated into component state
 * goes stale the moment the same book is open in a second tab. The server snapshot is an empty
 * string, so the server and the first hydration render agree, and the real value arrives on the
 * commit after. That is what the third argument is for.
 *
 * The self-grade is the point and it is not a shortcut. Nobody types an answer to "how does the
 * novel open"; you either had it or you did not, and only the reader knows which. Multiple choice
 * would measure recognition, which is the thing a book you have read always passes.
 */

type Grade = 'got' | 'missed';
type Grades = Record<string, Grade>;

/* A same-tab event, because `storage` only fires in OTHER tabs. Without it a grade would write
   through to localStorage and the deck would not notice its own write. */
const CHANGED = 'readingos:grades';

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb);
  window.addEventListener(CHANGED, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(CHANGED, cb);
  };
}

export default function Recall({ pack }: { pack: Pack }) {
  const key = `readingos:finish:${pack.slug}`;

  /* The snapshot is the raw string, not the parsed object. getSnapshot has to return something
     stable by value or React re-renders forever, and JSON.parse hands back a new object every
     call. */
  const raw = useSyncExternalStore(
    subscribe,
    () => { try { return window.localStorage.getItem(key) ?? ''; } catch { return ''; } },
    () => '',
  );

  const grades: Grades = useMemo(() => {
    if (!raw) return {};
    try { return JSON.parse(raw)?.grades ?? {}; } catch { return {}; }
  }, [raw]);

  const write = (next: Grades) => {
    try {
      window.localStorage.setItem(key, JSON.stringify({ grades: next }));
    } catch { /* a full or blocked store is not a reason to break the page */ }
    window.dispatchEvent(new Event(CHANGED));
  };

  const [order, setOrder] = useState<string[]>(() => pack.cards.map((c) => c.id));
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);

  const byId = useMemo(() => new Map(pack.cards.map((c) => [c.id, c])), [pack.cards]);
  const card: Card | undefined = byId.get(order[at] ?? '');

  const graded = Object.keys(grades).length;
  const got = Object.values(grades).filter((g) => g === 'got').length;
  const missedIds = Object.entries(grades).filter(([, g]) => g === 'missed').map(([id]) => id);

  const grade = (g: Grade) => {
    if (!card) return;
    write({ ...grades, [card.id]: g });
    setShown(false);
    setAt((i) => i + 1);
  };

  const run = (ids: string[], shuffle = false) => {
    setOrder(shuffle ? [...ids].sort(() => Math.random() - 0.5) : ids);
    setAt(0);
    setShown(false);
  };

  const done = at >= order.length;
  const unit = pack.unit === 'part' ? 'part' : 'ch';

  /* Only the sections you actually missed something in, grouped, with the recap for each. That
     grouping is the whole reason the packs carry sections at all: "you missed four" is a score, and
     "you missed four, all of them in the trial, here is what happens in it" is a next action. */
  const misses = useMemo(
    () =>
      pack.sections
        .map((s) => {
          const ids = missedIds.filter((id) => byId.get(id)?.sec === s.id);
          return {
            section: s,
            count: ids.length,
            chapters: [...new Set(ids.map((id) => byId.get(id)!.ch))].sort((a, b) => a - b),
          };
        })
        .filter((m) => m.count > 0),
    [missedIds, pack.sections, byId],
  );

  if (done) {
    const pct = graded ? Math.round((got / graded) * 100) : 0;
    return (
      <div className="result">
        <p className="score">
          <span className="tnum">{got}</span> of <span className="tnum">{graded}</span>{' '}
          <span className="pct">({pct}%)</span>
        </p>

        {misses.length ? (
          <>
            <p className="body">What you missed, and where it lives. Read the stretch, not the card.</p>
            {misses.map((m) => (
              <div className="miss" key={m.section.id}>
                <div className="mh">
                  <span className="mt">{m.section.title}</span>
                  <span className="mc">
                    {unit} {m.section.from}
                    {m.section.to !== m.section.from ? ` to ${m.section.to}` : ''} · {m.count} missed
                  </span>
                </div>
                <p className="body">{m.section.recap}</p>
                <p className="mch">Missed on {unit} {m.chapters.join(', ')}</p>
              </div>
            ))}
          </>
        ) : graded ? (
          <p className="body">Nothing missed. Nothing to re-read.</p>
        ) : (
          <p className="body">No cards graded yet.</p>
        )}

        <div className="acts">
          {missedIds.length > 0 && (
            <button type="button" onClick={() => run(missedIds)}>
              Redo the {missedIds.length} I missed
            </button>
          )}
          <button type="button" onClick={() => run(pack.cards.map((c) => c.id))}>
            Run all {pack.cards.length} again
          </button>
          <button type="button" onClick={() => run(pack.cards.map((c) => c.id), true)}>
            Shuffle all
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => { write({}); run(pack.cards.map((c) => c.id)); }}
          >
            Forget my grades
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="deck">
      <div className="prog">
        <span className="tnum">{at + 1}</span> of <span className="tnum">{order.length}</span>
        {graded > 0 && <span className="sofar">{got} right so far</span>}
      </div>

      {card && (
        <div className="card">
          <div className="chips">
            <span className="chip-kind">{cardKindLabel[card.kind]}</span>
            <span className="chip-ch">{unit} {card.ch}</span>
          </div>
          <p className="q">{card.q}</p>

          {shown ? (
            <>
              <p className="a">{card.a}</p>
              <div className="acts">
                <button type="button" onClick={() => grade('missed')}>Missed it</button>
                <button type="button" onClick={() => grade('got')}>Knew it</button>
              </div>
            </>
          ) : (
            <div className="acts">
              <button type="button" onClick={() => setShown(true)}>Show me</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
