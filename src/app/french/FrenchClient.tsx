'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import SaveBlocked from '@/components/SaveBlocked';
import type { FrenchSummary } from '@/lib/french/db';

/* Ported from LanguageOS/site/french.html's inline script, same interaction shape: a home screen
 * with counts + a full-screen review overlay, refreshed in place (no page navigation) after every
 * mutation. The server component passes the initial summary/activity so there is no fetch-on-mount
 * flash; this component only re-fetches after something changes. */

const BOOKS: Record<string, string> = {
  'easy-french': 'Easy French Step-by-Step',
  'all-in-one': 'Complete French All-in-One',
  dummies: 'French for Dummies',
};

interface QueueCard {
  id: string;
  front: string;
  back: string;
  es_hint: string | null;
  note: string | null;
  book: string | null;
  chapter: string | null;
  page: string | null;
  is_new: boolean;
  preview: Record<string, number>;
}

interface ActivityDay {
  date: string;
  reviewed: number;
}

/* The write that failed and is still owed. All three of this app's writes went out without anyone
 * checking the answer: `rate` did not even await the fetch before advancing the queue, so a rated
 * card left the screen whether or not the server took it, and there are no cards in this database
 * yet only because nothing has been ingested. `saveChapter` said "Logged." on a refusal and cleared
 * the form under it. `setExam` said nothing at all and left the old date on screen. */
type PendingWrite =
  | { kind: 'review'; card: QueueCard; rating: number }
  | { kind: 'chapter'; body: { book: string; chapter: string; title: string | null; pages: string | null } }
  | { kind: 'exam'; date: string | null };

function human(d: number): string {
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

export default function FrenchClient({
  initialSummary,
  initialActivity,
  canEdit,
}: {
  initialSummary: FrenchSummary;
  initialActivity: ActivityDay[];
  /** Whether this device holds the cookie. Presentation only: see the note in page.tsx. */
  canEdit: boolean;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [activity, setActivity] = useState(initialActivity);
  const [reviewing, setReviewing] = useState(false);
  const [queue, setQueue] = useState<QueueCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [examOpen, setExamOpen] = useState(false);
  const [examDraft, setExamDraft] = useState(initialSummary.examDate ?? '');
  const [form, setForm] = useState({ book: 'easy-french', chapter: '', pages: '', title: '' });
  const [toast, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  /* State, not a ref: the banner reads what is owed while rendering.
   *
   * A LIST, one entry per kind. The first version kept a single slot and overwrote it, so rating a
   * card (refused, queued), closing the overlay and then logging a chapter (refused) discarded the
   * review with no trace while the banner went on claiming something was waiting. Found by an
   * adversarial pass on 2026-08-14. Gym solved the same problem with a keyed Map. */
  const [pending, setPending] = useState<PendingWrite[]>([]);
  const queueWrite = (w: PendingWrite) =>
    setPending((prev) => [...prev.filter((p) => p.kind !== w.kind), w]);

  function showToast(msg: string) {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 1900);
  }

  /* One place a write leaves this component, and it returns whether the server took it. Callers
   * decide what to render from that, which is the whole fix: nothing here may advance, clear a
   * form, or print a confirmation on the strength of a promise that merely resolved. */
  async function post(kind: PendingWrite['kind'], url: string, body: unknown): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setSaveErr(res.status === 401 ? 'locked' : `failed ${res.status}`);
        return false;
      }
      /* Only this kind is settled. Clearing the whole queue here would drop a review that is still
       * owed just because a chapter went through. */
      setPending((prev) => {
        const left = prev.filter((p) => p.kind !== kind);
        if (left.length === 0) setSaveErr(null);
        return left;
      });
      return true;
    } catch {
      setSaveErr('offline');
      return false;
    }
  }

  /* Reads, so the proxy lets them through, but an unchecked `.json()` on a 500 throws inside a
   * promise nobody awaited. `refresh()` is called un-awaited from three places. Leaving the last
   * good numbers on screen is the right failure here: this is a refresh, not a load. */
  const refresh = useCallback(async () => {
    try {
      const [sRes, aRes] = await Promise.all([
        fetch('/french/api/summary'),
        fetch('/french/api/activity'),
      ]);
      if (!sRes.ok || !aRes.ok) return;
      setSummary(await sRes.json());
      setActivity(await aRes.json());
    } catch {
      // keep what is on screen
    }
  }, []);

  async function startReview() {
    const res = await fetch('/french/api/queue').catch(() => null);
    if (!res?.ok) return showToast('Could not load the queue. Try again.');
    const q: QueueCard[] = await res.json();
    if (!q.length) return;
    setQueue(q);
    setIdx(0);
    setRevealed(false);
    setReviewing(true);
  }

  const endReview = useCallback(() => {
    setReviewing(false);
    refresh();
  }, [refresh]);

  function reveal() {
    if (revealed || idx >= queue.length) return;
    setRevealed(true);
  }

  /* Advance only once the rating is recorded. A review IS the network call, so blocking here costs
   * nothing that was ever going to work offline, and the alternative is a card that has visibly
   * left the queue while its schedule never moved. */
  function advance(card: QueueCard, r: number) {
    // Again -> the card comes back at the end of this same sitting.
    const nextQueue = r === 1 ? [...queue, card] : queue;
    setQueue(nextQueue);
    setIdx((i) => i + 1);
    setRevealed(false);
  }

  async function rate(r: number) {
    if (!revealed || idx >= queue.length) return;
    const card = queue[idx] as QueueCard;
    queueWrite({ kind: 'review', card, rating: r });
    if (!(await post('review', '/french/api/review', { id: card.id, rating: r }))) return;
    advance(card, r);
  }

  /* Re-sends whatever was refused. SaveBlocked calls this after a successful unlock, so unlocking
   * and saving stay one action rather than a password entry followed by a redo he has to work out. */
  async function retryPending(): Promise<boolean> {
    let allOk = true;
    for (const p of pending) {
      if (p.kind === 'review') {
        if (await post('review', '/french/api/review', { id: p.card.id, rating: p.rating })) advance(p.card, p.rating);
        else allOk = false;
      } else if (p.kind === 'chapter') {
        if (await post('chapter', '/french/api/chapter', p.body)) chapterSaved();
        else allOk = false;
      } else {
        if (await post('exam', '/french/api/exam', { date: p.date })) refresh();
        else allOk = false;
      }
    }
    return allOk;
  }

  useEffect(() => {
    if (!reviewing) return;
    if (idx >= queue.length && queue.length > 0) {
      const t = setTimeout(endReview, 1400);
      return () => clearTimeout(t);
    }
  }, [idx, queue.length, reviewing, endReview]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!reviewing) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(); }
      if (revealed && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key));
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewing, revealed, idx, queue]);

  /* The form is cleared and the confirmation printed here, in one place, so neither can happen on a
   * path where the server said no. Both used to sit directly after an unchecked fetch. */
  function chapterSaved() {
    setForm((f) => ({ book: f.book, chapter: '', pages: '', title: '' }));
    setLogOpen(false);
    showToast('Logged. Send a photo of the pages to make cards.');
    refresh();
  }

  async function saveChapter() {
    if (!form.chapter.trim()) return showToast('Which chapter?');
    const body = {
      book: form.book,
      chapter: form.chapter.trim(),
      title: form.title.trim() || null,
      pages: form.pages.trim() || null,
    };
    queueWrite({ kind: 'chapter', body });
    if (!(await post('chapter', '/french/api/chapter', body))) return;
    chapterSaved();
  }

  /* Was window.prompt, the only native OS dialog left on the site: a grey system box in a
   * typeface nothing else here uses, with a free-text field that accepts "next tuesday" and stores
   * it. A date input gets the phone's date wheel and cannot produce a string the server has to
   * guess at. */
  async function saveExam(date: string | null) {
    queueWrite({ kind: 'exam', date });
    if (!(await post('exam', '/french/api/exam', { date }))) return;
    setExamOpen(false);
    refresh();
  }

  const newCount = Math.min(summary.unseen, summary.newPerDay);
  /* Two different readers. He needs the instruction; a stranger needs to know that empty is the
   * design and not a broken page. The rule this app exists to enforce is the interesting half. */
  const tagline =
    summary.total === 0
      ? canEdit
        ? 'No cards yet. Do a section in the book, then send a photo of the page.'
        : 'Build three. Cards enter only from pages of a book I have actually sat down and worked, so this is empty until I do. The two versions before it were seeded with 1,359 cards and got one review.'
      : summary.learned === 0
        ? `${summary.total} card${summary.total === 1 ? '' : 's'} in, all still settling.`
        : `${summary.learned} of ${summary.total} cards holding past three weeks.`;
  const cardStat =
    summary.total === 0
      ? 'No cards yet.'
      : `${summary.total} total · ${summary.unseen} not yet seen · ${summary.reviewedToday} reviewed today`;

  const activityByDate = Object.fromEntries(activity.map((d) => [d.date, d.reviewed]));
  const cells: { date: string; level: string; value: number }[] = [];
  const nowMs = new Date().getTime();
  for (let i = 55; i >= 0; i--) {
    const d = new Date(nowMs - i * 86400000).toISOString().slice(0, 10);
    const v = activityByDate[d] || 0;
    const level = v === 0 ? '' : v < 5 ? 'a1' : v < 15 ? 'a2' : v < 30 ? 'a3' : 'a4';
    cells.push({ date: d, level, value: v });
  }

  const current = queue[idx];
  const finished = reviewing && idx >= queue.length && queue.length > 0;

  const kinds = new Set(pending.map((p) => p.kind));
  const pendingNoun =
    kinds.size !== 1 ? 'change' : kinds.has('review') ? 'review' : kinds.has('chapter') ? 'section' : 'change';
  const blocked = saveErr ? (
    <SaveBlocked
      err={saveErr}
      noun={pendingNoun}
      queued={pending.length}
      onRetry={retryPending}
      loginHref="/french/login"
    />
  ) : null;

  return (
    <>
      <div className="exam-strip">
        <div className="d">
          {summary.examDate
            ? (summary.daysToExam != null && summary.daysToExam >= 0
              ? <>TCF in <b className="tnum">{summary.daysToExam}</b> day{summary.daysToExam === 1 ? '' : 's'} · {summary.examDate}</>
              : `exam date ${summary.examDate} has passed`)
            : 'no exam date set'}
        </div>
        {canEdit && (
          <button type="button" onClick={() => setExamOpen((v) => !v)}>
            {examOpen ? 'cancel' : 'edit'}
          </button>
        )}
      </div>

      {canEdit && examOpen && (
        <div className="exam-edit">
          <label className="f" htmlFor="examdate">TCF exam date</label>
          <div className="row2">
            <input
              id="examdate"
              className="f"
              type="date"
              value={examDraft}
              onChange={(e) => setExamDraft(e.target.value)}
            />
            <div className="exam-actions">
              <button type="button" className="primary" onClick={() => void saveExam(examDraft || null)}>
                Save
              </button>
              {summary.examDate && (
                <button type="button" className="ghost" onClick={() => void saveExam(null)}>
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <h1>Français</h1>
      <p className="lede">{tagline}</p>

      {/* The same banner is mounted twice: once here for the home screen writes, and once inside
        * the review overlay, which is a fixed full-screen layer this would otherwise sit behind. */}
      {!reviewing && blocked}

      <div className="section" style={{ marginTop: 22, paddingTop: 0, borderTop: 'none' }}>
        <div className="counts">
          {/* Green only when there is something to be green about. --signal means a value that is
              true right now, and a zero in the live colour claims liveness where there is none: this
              page currently shows 0 due and 0 new, and both were rendering green. */}
          <div className="c-due"><b className={`tnum${summary.dueNow > 0 ? ' live' : ''}`}>{summary.dueNow}</b><span>Due</span></div>
          <div className="c-new"><b className={`tnum${newCount > 0 ? ' live' : ''}`}>{newCount}</b><span>New</span></div>
          <div className="c-str"><b className="tnum">{summary.streak}</b><span>Day streak</span></div>
        </div>
        <button type="button" className="primary" disabled={!summary.queueSize} onClick={startReview}>
          {summary.queueSize ? `Review ${summary.queueSize}` : summary.total === 0 ? 'No cards yet' : 'Nothing due today'}
        </button>
      </div>

      <div className="section">
        <h2>The book</h2>
        {summary.lastChapter ? (
          <>
            <p className="lastch">
              {BOOKS[summary.lastChapter.book] || summary.lastChapter.book} · ch. {summary.lastChapter.chapter}
              <br /><em>{summary.lastChapter.title || ''}</em>
            </p>
            <p className="empty">{summary.chapters} section{summary.chapters === 1 ? '' : 's'} logged.</p>
          </>
        ) : (
          <p className="empty">No sections logged yet.</p>
        )}
        {canEdit && (
          <button type="button" className="ghost" onClick={() => setLogOpen((v) => !v)}>Log a section I finished</button>
        )}
        {canEdit && logOpen && (
          <div>
            <label className="f">Book</label>
            <select className="f" value={form.book} onChange={(e) => setForm({ ...form, book: e.target.value })}>
              {Object.entries(BOOKS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <div className="row2">
              <div>
                <label className="f">Chapter</label>
                <input className="f" inputMode="numeric" placeholder="7" value={form.chapter}
                  onChange={(e) => setForm({ ...form, chapter: e.target.value })} />
              </div>
              <div>
                <label className="f">Pages</label>
                <input className="f" placeholder="52-58" value={form.pages}
                  onChange={(e) => setForm({ ...form, pages: e.target.value })} />
              </div>
            </div>
            <label className="f">What it covered</label>
            <input className="f" placeholder="-er verbs, present tense" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div style={{ height: 12 }} />
            <button type="button" className="primary" onClick={saveChapter}>Save</button>
          </div>
        )}
      </div>

      <div className="section">
        <h2>Cards</h2>
        <p className="empty">{cardStat}</p>
        <div className="act">
          {cells.map((c) => <i key={c.date} className={c.level} title={`${c.date}: ${c.value}`} />)}
        </div>
        <p className="empty" style={{ marginTop: 10, fontSize: 14 }}>
          {/* First person, like the rest of the site. This was addressed to "you", which on a
            * public page reads as an instruction to the reader. */}
          Cards come from pages I have actually worked. I photograph the page, send it over, and it
          lands here. Nothing is ever bulk-loaded.
        </p>
      </div>

      <div className={`rev${reviewing ? ' on' : ''}`}>
        <div className="rev-top">
          <span className="prog">{finished ? '' : reviewing ? `${idx + 1} / ${queue.length}` : ''}</span>
          {!finished && current?.is_new && <span className="tag">New</span>}
          <button type="button" onClick={endReview}>close</button>
        </div>
        {finished ? (
          <div className="face">
            <div className="done">
              <div className="big">C&apos;est tout.</div>
              <p>{queue.length} card{queue.length === 1 ? '' : 's'} reviewed.</p>
            </div>
          </div>
        ) : current ? (
          <>
            <div className="face" onClick={reveal}>
              <div className="fr">{current.front}</div>
              {!revealed && <div className="hint">tap to reveal</div>}
              {revealed && (
                <>
                  <div className="en">{current.back}</div>
                  {current.es_hint && <div className="es">{current.es_hint}</div>}
                  {current.note && <div className="note">{current.note}</div>}
                  {current.book && (
                    <div className="src">
                      {(BOOKS[current.book] || current.book).toUpperCase()}
                      {current.chapter ? ` · CH ${current.chapter}` : ''}
                      {current.page ? ` · P${current.page}` : ''}
                    </div>
                  )}
                </>
              )}
            </div>
            {/* `reviewing &&`, because .rev stays in the DOM as display:none and the copy outside
              * this overlay is the one that shows on the home screen. Two role="alert" regions and
              * two password fields coexisted before. */}
            {reviewing && blocked}
            <div className={`rate${revealed ? ' on' : ''}`}>
              <button type="button" className="r1" onClick={() => rate(1)}><b>Again</b><i>{current.preview?.again != null ? human(current.preview.again) : ''}</i></button>
              <button type="button" className="r2" onClick={() => rate(2)}><b>Hard</b><i>{current.preview?.hard != null ? human(current.preview.hard) : ''}</i></button>
              <button type="button" className="r3" onClick={() => rate(3)}><b>Good</b><i>{current.preview?.good != null ? human(current.preview.good) : ''}</i></button>
              <button type="button" className="r4" onClick={() => rate(4)}><b>Easy</b><i>{current.preview?.easy != null ? human(current.preview.easy) : ''}</i></button>
            </div>
          </>
        ) : null}
      </div>

      <div className={`toast${toast ? ' on' : ''}`}>{toast}</div>
    </>
  );
}
