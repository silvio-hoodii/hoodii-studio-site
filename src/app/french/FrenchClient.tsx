'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

function human(d: number): string {
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

export default function FrenchClient({
  initialSummary,
  initialActivity,
}: {
  initialSummary: FrenchSummary;
  initialActivity: ActivityDay[];
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [activity, setActivity] = useState(initialActivity);
  const [reviewing, setReviewing] = useState(false);
  const [queue, setQueue] = useState<QueueCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [form, setForm] = useState({ book: 'easy-french', chapter: '', pages: '', title: '' });
  const [toast, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 1900);
  }

  const refresh = useCallback(async () => {
    const [s, a] = await Promise.all([
      fetch('/french/api/summary').then((r) => r.json()),
      fetch('/french/api/activity').then((r) => r.json()),
    ]);
    setSummary(s);
    setActivity(a);
  }, []);

  async function startReview() {
    const q: QueueCard[] = await fetch('/french/api/queue').then((r) => r.json());
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

  async function rate(r: number) {
    if (!revealed || idx >= queue.length) return;
    const card = queue[idx] as QueueCard;
    fetch('/french/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: card.id, rating: r }),
    });
    // Again -> the card comes back at the end of this same sitting.
    const nextQueue = r === 1 ? [...queue, card] : queue;
    setQueue(nextQueue);
    setIdx((i) => i + 1);
    setRevealed(false);
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

  async function saveChapter() {
    if (!form.chapter.trim()) return showToast('Which chapter?');
    await fetch('/french/api/chapter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        book: form.book,
        chapter: form.chapter.trim(),
        title: form.title.trim() || null,
        pages: form.pages.trim() || null,
      }),
    });
    setForm({ book: form.book, chapter: '', pages: '', title: '' });
    setLogOpen(false);
    showToast('Logged. Send a photo of the pages to make cards.');
    refresh();
  }

  async function setExam() {
    const cur = summary.examDate || '';
    const v = window.prompt('TCF exam date (YYYY-MM-DD), blank to clear:', cur);
    if (v === null) return;
    await fetch('/french/api/exam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: v.trim() || null }),
    });
    refresh();
  }

  const newCount = Math.min(summary.unseen, summary.newPerDay);
  const tagline =
    summary.total === 0
      ? 'No cards yet. Do a section in the book, then send a photo of the page.'
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
        <button type="button" onClick={setExam}>edit</button>
      </div>

      <h1>Français</h1>
      <p className="lede">{tagline}</p>

      <div className="section" style={{ marginTop: 22, paddingTop: 0, borderTop: 'none' }}>
        <div className="counts">
          <div className="c-due"><b className="tnum">{summary.dueNow}</b><span>Due</span></div>
          <div className="c-new"><b className="tnum live">{newCount}</b><span>New</span></div>
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
        <button type="button" className="ghost" onClick={() => setLogOpen((v) => !v)}>Log a section I finished</button>
        {logOpen && (
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
          Cards come from pages you actually worked. Photograph the page, send it over, and it lands
          here. Nothing is ever bulk-loaded.
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
