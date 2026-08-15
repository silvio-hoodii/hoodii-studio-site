/* An interaction harness for /gym, run in a real browser against a real page.
 *
 * WHY THIS EXISTS. On 2026-08-14 Silvio trained, and afterwards: "I felt that the app was behaving
 * a little bit weird... when I switch exercises because I wanted to swap it, it always came back to
 * the default when I switch pages. I'm not really sure it's working well. You said it is but I
 * don't know what other test you need to do to make sure that it's working fine."
 *
 * He was right and I had no answer, because nothing here had ever tested an INTERACTION. The gates
 * are typecheck, lint, build, a recipe validator and a classname linter. Every one of them passes
 * on an app whose swap control silently resets and whose logged sets then become invisible. A
 * screenshot does not catch it either: the page looks correct in both states.
 *
 * WHAT IT MUST NEVER DO. There is no development database. GYM_DATABASE_URL points at the real
 * Neon store, so a write from a browser holding the unlock cookie lands in his actual training log.
 * `install()` therefore replaces window.fetch before any test runs: every POST to a gym write route
 * is recorded and answered locally, and NOTHING leaves the browser. If the patch is not in place a
 * test refuses to run rather than falling back to the network. Reads (plan, session) are allowed
 * through, because reading is free and the point is to test against real data.
 *
 * HOW TO RUN IT.
 *   pnpm dev            # or point at https://hoodii.studio
 *   agent-browser --session gymtest set viewport 390 844
 *   agent-browser --session gymtest open http://localhost:3001/gym
 *   agent-browser --session gymtest eval "$(cat scripts/probe-gym.js)"
 *   agent-browser --session gymtest eval "__probe.run()"
 *
 * Some tests reload the page. After a reload the harness is gone, so re-eval the file and call the
 * named test: `__probe.run('swapSurvivesReload:after')`. `run()` with no argument runs everything
 * that does not need a reload and tells you which ones it skipped.
 */
(() => {
  const WRITE_ROUTES = ['/gym/api/set', '/gym/api/finish'];
  /* Stubbed too, so the unlock-and-flush path can be exercised without a password and without
     setting a real cookie. What is under test here is what the CLIENT does once the server has
     said yes, not whether the server says yes; that is the unlock route's own business. */
  const UNLOCK_ROUTE = '/kitchen/api/unlock';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Wait for a condition instead of guessing at a render. A fixed sleep passed on my laptop and
     failed on the dev server under load, which makes a test that reports an app defect when the
     app is fine: the harness has to be the most trustworthy thing in the room. Returns whatever the
     predicate returned, or null on timeout. */
  async function waitFor(fn, ms = 3000) {
    const until = Date.now() + ms;
    for (;;) {
      let v = null;
      try { v = fn(); } catch { v = null; }
      if (v) return v;
      if (Date.now() > until) return null;
      await sleep(50);
    }
  }

  /* React tracks input values on the DOM node, so assigning .value and firing 'input' is ignored.
     The native setter plus a bubbling event is the only thing it believes. */
  function type(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  /* A real focus/blur, not a dispatched 'blur'. React delegates at the root and listens for
     'focusout'; a synthetic 'blur' does not bubble, so the first version of this harness reported
     "0 writes" on four tests and I nearly filed it as an app bug. The corollary in
     HOODII/.agents/ENGINEERING.md applies: a surprising failure is first evidence about the test. */
  const blur = (el) => { el.focus(); el.blur(); };
  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* A set row whose weight box actually accepts input. Bodyweight exercises disable it, and the
     first version of this harness typed into the disabled one and reported "0 writes" as an app
     failure. Returns [row, weightInput, repsInput]. */
  function liveRow(root = document) {
    for (const row of $$('.set-row', root)) {
      const [w, r] = $$('input', row);
      if (w && !w.disabled) return [row, w, r];
    }
    return [null, null, null];
  }

  /* An exercise card, addressed by the name shown on it, which is what he sees. */
  function card(name) {
    return $$('.ex').find((e) => text($('.ex-name', e)) === name) || null;
  }
  const cardNames = () => $$('.ex').map((e) => text($('.ex-name', e)));

  const state = {
    calls: [],
    mode: 'ok', // 'ok' | 'locked' | 'offline'
    unlockOk: true,
    patched: false,
    /* When set, the session READ is answered from here instead of the network. The only way to
       exercise "resume a swap somebody logged on another device" without writing to his real log. */
    sessionRows: null,
  };

  function install() {
    if (state.patched) return 'already installed';
    const real = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = String(typeof input === 'string' ? input : input.url);
      const post = (init?.method || 'GET').toUpperCase() === 'POST';
      if (post && url.includes(UNLOCK_ROUTE)) {
        state.calls.push({ url, body: '(password withheld)', at: state.calls.length, mode: state.mode });
        return new Response('{"ok":true}', { status: state.unlockOk ? 200 : 401, headers: { 'content-type': 'application/json' } });
      }
      if (post && url.includes('/gym/api/session') && state.sessionRows) {
        state.calls.push({ url, body: '(session read, answered from fixture)', at: state.calls.length, mode: state.mode });
        return new Response(JSON.stringify({ ok: true, sets: state.sessionRows }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      const isWrite = post && WRITE_ROUTES.some((r) => url.includes(r));
      if (!isWrite) return real(input, init);
      let body = null;
      try { body = JSON.parse(init.body); } catch { body = init?.body ?? null; }
      state.calls.push({ url, body, at: state.calls.length, mode: state.mode });
      if (state.mode === 'offline') throw new TypeError('probe: simulated network failure');
      const status = state.mode === 'locked' ? 401 : 200;
      return new Response(JSON.stringify({ ok: status === 200 }), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    };
    state.patched = true;
    return 'installed';
  }

  const writes = () => state.calls.filter((c) => c.url.includes('/gym/api/set'));
  const finishes = () => state.calls.filter((c) => c.url.includes('/gym/api/finish'));
  function since() {
    const mark = state.calls.length;
    return () => state.calls.slice(mark);
  }

  /* Every test returns {pass, detail}. `detail` carries what was OBSERVED, not a restatement of the
     assertion: a failing test has to say what it saw or the next reader has to re-run it to find out. */
  const tests = {
    /* ---- structure ---- */

    async hierarchyIsVisible() {
      const groups = $$('.exgroup');
      if (!groups.length) return { pass: false, detail: 'no .exgroup on the page' };
      const g = groups.find((x) => $$('.ex', x).length >= 2) || groups[0];
      const label = $('.exgroup-label', g);
      const exName = $('.ex-name', g);
      const gs = getComputedStyle(g);
      const ls = getComputedStyle(label);
      const es = getComputedStyle(exName);
      /* The defect he reported, stated as something measurable: a group must be a stronger visual
         boundary than the exercises inside it. If the only thing separating two groups is weaker
         than the hairline separating two exercises, the exercises read as one flat list. */
      const second = $$('.ex', g)[1] || exName;
      const groupRule = { w: parseFloat(gs.borderTopWidth) || 0, c: gs.borderTopColor };
      const exRule = { w: parseFloat(getComputedStyle(second).borderTopWidth) || 0, c: getComputedStyle(second).borderTopColor };
      /* "Stronger" on this site does not mean thicker. Both rules are 1px; a section opens on the
         full-ink --foreground and rows are divided by the --border hairline. So the check is that a
         block HAS a boundary and that it is not the same one used between the rows inside it. */
      return {
        pass: groupRule.w > 0 && (groupRule.w > exRule.w || groupRule.c !== exRule.c),
        detail: {
          groupRule, exerciseRule: exRule,
          groupLabelPx: parseFloat(ls.fontSize), exerciseNamePx: parseFloat(es.fontSize),
          groupLabel: text(label), groupsOnPage: groups.length, exercisesOnPage: $$('.ex').length,
        },
      };
    },

    async warmupAndCooldownAreVisible() {
      const folds = $$('details.fold');
      const seen = folds.map((f) => ({
        summary: text($('summary', f)),
        open: f.open,
        renderedHeight: Math.round(f.getBoundingClientRect().height),
        visibility: getComputedStyle(f).visibility,
      }));
      const bad = seen.filter((s) => s.visibility === 'collapse' || s.visibility === 'hidden');
      const warm = seen.find((s) => /warmup/i.test(s.summary || ''));
      const cool = seen.find((s) => /cooldown/i.test(s.summary || ''));
      return {
        pass: bad.length === 0 && !!warm?.open && !!cool?.open,
        detail: { seen, invisible: bad },
      };
    },

    async dayTabsSwitch() {
      const tabs = $$('.tab');
      const before = text($('.count'));
      const other = tabs.find((t) => !t.classList.contains('on'));
      if (!other) return { pass: false, detail: 'only one tab' };
      const wanted = text(other);
      other.click();
      await sleep(400);
      const after = text($('.count'));
      const onNow = text($('.tab.on'));
      return { pass: before !== after && onNow === wanted, detail: { before, after, tabClicked: wanted, tabOnNow: onNow } };
    },

    async budgetFilters() {
      const full = $$('.budgets button').find((b) => text(b) === 'Full');
      const short = $$('.budgets button').find((b) => text(b) !== 'Full');
      if (!full || !short) return { pass: false, detail: 'no budget buttons' };
      full.click(); await sleep(250);
      const fullCount = $$('.ex').length;
      short.click(); await sleep(250);
      const shortCount = $$('.ex').length;
      full.click(); await sleep(250);
      const restored = $$('.ex').length;
      return {
        pass: shortCount < fullCount && restored === fullCount,
        detail: { full: fullCount, [`budget_${text(short)}`]: shortCount, restoredToFull: restored },
      };
    },

    /* ---- writing a set ---- */

    async typingASetPostsOnce() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched, refusing to write' };
      const [row, w] = liveRow();
      if (!row) return { pass: false, detail: 'no set row with an enabled weight box' };
      const owner = text($('.ex-name', row.closest('.ex')));
      const grab = since();
      type(w, '42'); blur(w);
      await sleep(150);
      const calls = grab();
      const body = calls[0]?.body;
      return {
        pass: calls.length === 1 && body?.weight === 42 && body?.setIdx === 1,
        detail: { calls: calls.length, exerciseOnCard: owner, body },
      };
    },

    async retypingReplacesTheQueuedWrite() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      state.mode = 'locked';
      const [row, w] = liveRow();
      if (!row) return { pass: false, detail: 'no set row with an enabled weight box' };
      const grab = since();
      type(w, '40'); blur(w); await sleep(120);
      type(w, '45'); blur(w); await sleep(120);
      type(w, '47'); blur(w); await sleep(200);
      const sent = grab();
      const queued = text($('.save-blocked'));
      state.mode = 'ok';
      /* Three refused attempts, but they must collapse to ONE owed write holding the last value,
         which is what the banner's count is asserting. */
      const countMatch = /(\d+)\s+set/.exec(queued || '');
      return {
        pass: sent.length === 3 && countMatch?.[1] === '1',
        detail: { attempts: sent.length, values: sent.map((c) => c.body.weight), bannerSays: queued },
      };
    },

    async markingDoneStartsTheRestTimer() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      const ex = $('.ex');
      const name = text($('.ex-name', ex));
      const btn = $('.done-toggle', ex);
      const wasOn = btn.classList.contains('on');
      if (wasOn) { btn.click(); await sleep(200); }
      const grab = since();
      btn.click();
      await sleep(300);
      const calls = grab();
      const bar = $('.timer-bar');
      const label = text($('.timer-label', bar));
      return {
        pass: calls.length === 1 && calls[0].body.done === true
          && !bar.classList.contains('off') && (label || '').startsWith(name),
        detail: {
          posted: calls[0]?.body, timerVisible: !bar.classList.contains('off'),
          timerLabel: label, exerciseOnCard: name, toggleOn: btn.classList.contains('on'),
        },
      };
    },

    async skipDismissesTheTimer() {
      const bar = $('.timer-bar');
      const before = !bar.classList.contains('off');
      $('button', bar).click();
      await sleep(200);
      return { pass: before && bar.classList.contains('off'), detail: { visibleBefore: before, visibleAfter: !bar.classList.contains('off') } };
    },

    /* ---- swapping ---- */

    async altPickerOpens() {
      const ex = $$('.ex').find((e) => $('.ex-swap .swap-toggle', e));
      if (!ex) return { pass: false, detail: 'no exercise offers alternatives' };
      $('.ex-swap .swap-toggle', ex).click();
      await waitFor(() => $('.swap-opt', ex));
      const opts = $$('.swap-opt', ex).map((o) => text($('.swap-opt-name', o)));
      return { pass: opts.length > 0, detail: { on: text($('.ex-name', ex)), alternatives: opts } };
    },

    async swapChangesTheCard() {
      const ex = $$('.ex').find((e) => $('.swap-opt', e)) || $$('.ex').find((e) => $('.ex-swap .swap-toggle', e));
      if (!ex) return { pass: false, detail: 'no swappable exercise' };
      if (!$('.swap-opt', ex)) { $('.ex-swap .swap-toggle', ex).click(); await waitFor(() => $('.swap-opt', ex)); }
      const slot = ex.dataset.slot;
      const before = text($('.ex-name', ex));
      const beforeEff = ex.dataset.eff;
      const beforeMeta = text($('.ex-meta', ex));
      const wanted = text($('.swap-opt-name', $('.swap-opt', ex)));
      $('.swap-opt', ex).click();
      await waitFor(() => {
        const c = $$('.ex').find((e) => e.dataset.slot === slot);
        return c && c.dataset.eff !== beforeEff ? c : null;
      });
      const card2 = $$('.ex').find((e) => e.dataset.slot === slot);
      /* Addressed by SLOT and asserted on the effective id, not on what the note says about the
         previous name. Swapping a card that is already swapped is a legitimate move and the note
         keeps naming the ORIGINAL slot, correctly: an earlier version of this test read that as a
         failure and it was the test that was wrong, twice, on live. */
      return {
        pass: !!card2 && card2.dataset.eff !== beforeEff && text($('.ex-name', card2)) === wanted && !!$('.swapped-note', card2),
        detail: {
          slot, from: before, to: wanted, effBefore: beforeEff, effAfter: card2?.dataset.eff,
          metaBefore: beforeMeta, metaAfter: card2 ? text($('.ex-meta', card2)) : null,
          note: card2 ? text($('.swapped-note', card2)) : null,
        },
      };
    },

    /* The one he reported. A swapped exercise must record what he ACTUALLY did, not the slot it
       replaced: the id and the name in one row have to agree, or every history view lies. */
    async swappedSetRecordsTheRightExercise() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      const swapped = $$('.ex').find((e) => $('.swapped-note', e));
      if (!swapped) return { pass: false, detail: 'nothing is swapped, run swapChangesTheCard first' };
      const shown = text($('.ex-name', swapped));
      const row = $('.set-row', swapped);
      if (!row) return { pass: false, detail: 'swapped exercise has no set rows' };
      const [, reps] = $$('input', row);
      const grab = since();
      type(reps, '9'); blur(reps);
      await sleep(200);
      const body = grab()[0]?.body;
      return {
        pass: !!body && body.exerciseName === shown && body.swappedFrom != null && body.exerciseId !== body.swappedFrom,
        detail: { nameOnScreen: shown, posted: body },
      };
    },

    async swappedExerciseGetsItsOwnSuggestion() {
      const swapped = $$('.ex').find((e) => $('.swapped-note', e));
      if (!swapped) return { pass: false, detail: 'nothing is swapped' };
      /* Waited for, not slept through. The suggestion arrives from a round trip to /gym/api/plan,
         and a fixed 600ms passed against a local build and failed against the deployed one, which
         is a test reporting an app defect that is really a slow network. */
      const sugg = await waitFor(() => $('.ex-suggest', swapped), 6000);
      return {
        pass: !!sugg,
        detail: { exercise: text($('.ex-name', swapped)), suggestion: text(sugg), note: sugg ? null : 'no suggestion after 6s' },
      };
    },

    async revertRestoresTheOriginal() {
      const swapped = $$('.ex').find((e) => $('.swapped-note', e));
      if (!swapped) return { pass: false, detail: 'nothing is swapped' };
      const original = (text($('.swapped-note', swapped)) || '').replace(/^Swapped from /, '').replace(/ ·.*$/, '');
      $('.swap-revert', swapped).click();
      await sleep(300);
      return { pass: cardNames().includes(original), detail: { original, namesNow: cardNames() } };
    },

    /* Needs a reload, so it is two halves. Call `:before`, then reload the page, re-eval this file,
       then call `:after` with the value `:before` returned. */
    /* The other half of persistence, and the half localStorage cannot cover: a set logged under an
       alternative carries `swapped_from`, so opening the same session anywhere has to bring the
       swap back with it. Driven from a fixture, because proving it against the real store would
       mean writing to his training log. */
    async logDerivedSwapHydrates() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      const ex = $$('.ex').find((e) => $('.ex-swap .swap-toggle', e) && $('.set-row', e));
      if (!ex) return { pass: false, detail: 'no swappable exercise that logs sets' };
      const slot = ex.dataset.slot;
      if (!$('.swap-opt', ex)) $('.ex-swap .swap-toggle', ex).click();
      const opt = await waitFor(() => $('.swap-opt', ex));
      if (!opt) return { pass: false, detail: { step: 'open the alt picker', slot, sawOptions: $$('.swap-opt', ex).length } };
      opt.click();
      const revert = await waitFor(() => {
        const c = $$('.ex').find((e) => e.dataset.slot === slot);
        return c && $('.swap-revert', c);
      });
      const swappedCard = $$('.ex').find((e) => e.dataset.slot === slot);
      if (!revert) return { pass: false, detail: { step: 'swap did not take', slot, effNow: swappedCard?.dataset.eff } };
      const altId = swappedCard.dataset.eff;
      const altName = text($('.ex-name', swappedCard));
      // Put it back, and clear this device's memory of it, so only the log can bring it back.
      revert.click();
      await sleep(350);
      try { localStorage.removeItem(`gym:swaps:${new Date().toISOString().slice(0, 10)}`); } catch {}
      const namesWhenReverted = cardNames();

      state.sessionRows = [
        { exercise_id: altId, set_idx: 1, weight: 100, reps: 5, done: true, swapped_from: slot },
      ];
      // Leaving and returning re-runs the hydrate, which is what a fresh page load would do.
      const tabs = $$('.tab');
      const here = tabs.find((t) => t.classList.contains('on'));
      const away = tabs.find((t) => !t.classList.contains('on'));
      if (!here || !away) return { pass: false, detail: { step: 'need two day tabs to force a re-hydrate', tabs: tabs.length } };
      away.click();
      await waitFor(() => !$$('.ex').some((e) => e.dataset.slot === slot));
      here.click();
      const back = await waitFor(() => {
        const c = $$('.ex').find((e) => e.dataset.slot === slot);
        return c && c.dataset.eff === altId ? c : null;
      }) || $$('.ex').find((e) => e.dataset.slot === slot);
      state.sessionRows = null;
      const reps = back ? $$('input', $('.set-row', back))[1]?.value : null;
      return {
        pass: back?.dataset.eff === altId && reps === '5',
        detail: {
          slot, altId, altName,
          namesWhenReverted: namesWhenReverted.slice(0, 4),
          showingAfterRehydrate: back ? text($('.ex-name', back)) : null,
          effAfterRehydrate: back?.dataset.eff,
          repsRestored: reps,
        },
      };
    },

    async 'swapSurvivesReload:before'() {
      const ex = $$('.ex').find((e) => $('.ex-swap .swap-toggle', e));
      if (!ex) return { pass: false, detail: 'no swappable exercise' };
      if (!$('.swap-opt', ex)) { $('.ex-swap .swap-toggle', ex).click(); await waitFor(() => $('.swap-opt', ex)); }
      const wanted = text($('.swap-opt-name', $('.swap-opt', ex)));
      const from = text($('.ex-name', ex));
      $('.swap-opt', ex).click();
      await waitFor(() => $$('.ex').some((e) => text($('.ex-name', e)) === wanted));
      sessionStorage.setItem('__probeSwap', JSON.stringify({ from, to: wanted }));
      return { pass: cardNames().includes(wanted), detail: { from, to: wanted, namesNow: cardNames(), next: 'reload, re-eval, run swapSurvivesReload:after' } };
    },

    async 'swapSurvivesReload:after'() {
      const raw = sessionStorage.getItem('__probeSwap');
      if (!raw) return { pass: false, detail: 'no :before was recorded in this tab' };
      const { from, to } = JSON.parse(raw);
      await sleep(800);
      const names = cardNames();
      return {
        pass: names.includes(to) && !names.includes(from),
        detail: { swappedTo: to, replacing: from, namesAfterReload: names, showing: names.includes(to) ? to : from },
      };
    },

    /* ---- refusal and recovery ---- */

    async refusedWriteRaisesTheBanner() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      state.mode = 'locked';
      const [row, w] = liveRow();
      if (!row) return { pass: false, detail: 'no set row with an enabled weight box' };
      type(w, '33'); blur(w);
      await sleep(300);
      const banner = $('.save-blocked');
      const claimsSaved = /session saved/i.test(document.body.innerText);
      state.mode = 'ok';
      return {
        pass: !!banner && !claimsSaved,
        detail: { bannerText: text(banner), alsoClaimsSaved: claimsSaved },
      };
    },

    async finishIsRefusedWhileAWriteIsOwed() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      state.mode = 'locked';
      const [row, w] = liveRow();
      if (!row) return { pass: false, detail: 'no set row with an enabled weight box' };
      type(w, '34'); blur(w); await sleep(300);
      const owed = !!$('.save-blocked');
      const finish = $$('button.primary').find((b) => /finish workout/i.test(text(b)));
      if (!finish) return { pass: false, detail: 'no finish button' };
      const grab = since();
      finish.click();
      await sleep(600);
      const said = /not finished/i.test(document.body.innerText);
      const claimsSaved = /session saved/i.test(document.body.innerText);
      const sentFinish = grab().filter((c) => c.url.includes('/finish')).length;
      state.mode = 'ok';
      /* The set is owed, so the finish must not even be attempted: finishing a session whose sets
         never landed would record an empty workout and call it done. */
      return {
        pass: owed && said && !claimsSaved && sentFinish === 0,
        detail: { aWriteWasOwed: owed, saysNotFinished: said, claimsSaved, finishPostsAttempted: sentFinish },
      };
    },

    /* The rest timer names the exercise it is resting from. After a swap that has to be the
       exercise he actually did, not the slot it replaced. */
    async swappedExerciseRestTimerNamesIt() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      let swapped = $$('.ex').find((e) => $('.swapped-note', e));
      if (!swapped) {
        // Makes its own, because revertRestoresTheOriginal runs before this one.
        const ex = $$('.ex').find((e) => $('.ex-swap .swap-toggle', e) && $('.done-toggle', e));
        if (!ex) return { pass: false, detail: 'no swappable exercise that logs sets' };
        if (!$('.swap-opt', ex)) { $('.ex-swap .swap-toggle', ex).click(); await waitFor(() => $('.swap-opt', ex)); }
        $('.swap-opt', ex).click();
        await waitFor(() => $$('.ex').some((e) => $('.swapped-note', e)));
        swapped = $$('.ex').find((e) => $('.swapped-note', e));
        if (!swapped) return { pass: false, detail: 'swap did not take' };
      }
      const shown = text($('.ex-name', swapped));
      const btn = $('.done-toggle', swapped);
      if (!btn) return { pass: false, detail: 'swapped exercise has no set rows' };
      if (btn.classList.contains('on')) { btn.click(); await sleep(250); }
      btn.click();
      await sleep(350);
      const label = text($('.timer-label'));
      return { pass: (label || '').startsWith(shown), detail: { nameOnScreen: shown, timerSays: label } };
    },

    async unlockingFlushesEverythingAndFinishes() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      const banner = $('.save-blocked');
      if (!banner) return { pass: false, detail: 'no banner up, run finishIsRefusedWhileAWriteIsOwed first' };
      state.mode = 'ok';
      state.unlockOk = true;
      const grab = since();
      const retry = $$('button', banner).find((b) => /try again|unlock/i.test(text(b)));
      if (!retry) return { pass: false, detail: { bannerText: text(banner), note: 'no retry or unlock button in the banner' } };
      const pw = $('input[type=password]', banner);
      if (pw) { type(pw, 'probe'); await sleep(80); }
      retry.click();
      await sleep(900);
      const after = grab();
      const saved = /session saved/i.test(document.body.innerText);
      return {
        pass: saved && after.filter((c) => c.url.includes('/finish')).length === 1,
        detail: {
          setsResent: after.filter((c) => c.url.includes('/set')).length,
          finishPosts: after.filter((c) => c.url.includes('/finish')).length,
          saysSaved: saved,
          bannerStillUp: !!$('.save-blocked'),
        },
      };
    },

    async finishPostsExactlyOnce() {
      const all = finishes();
      return {
        pass: all.length <= 1 || new Set(all.map((c) => JSON.stringify(c.body))).size === 1,
        detail: { finishCalls: all.length, bodies: all.map((c) => c.body) },
      };
    },
  };

  const NEEDS_RELOAD = new Set(['swapSurvivesReload:before', 'swapSurvivesReload:after']);

  async function run(only) {
    install();
    const names = only ? [only] : Object.keys(tests).filter((n) => !NEEDS_RELOAD.has(n));
    const out = {};
    for (const n of names) {
      try {
        out[n] = await tests[n]();
      } catch (e) {
        out[n] = { pass: false, detail: { threw: String(e && e.stack ? e.stack.split('\n')[0] : e) } };
      }
    }
    const failed = Object.entries(out).filter(([, v]) => !v.pass).map(([k]) => k);
    return JSON.stringify({
      ran: names.length,
      failed,
      skippedNeedsReload: only ? [] : [...NEEDS_RELOAD],
      results: out,
      totalWritesIntercepted: state.calls.length,
    });
  }

  window.__probe = { install, run, tests, state, helpers: { type, blur, text, card, cardNames, waitFor, sleep, $, $$ } };
  return install();
})();
