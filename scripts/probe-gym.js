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
 * IF THAT `eval "$(cat ...)"` FAILS with "Argument list too long", this file has outgrown the
 * shell's argument limit, which happened on 2026-08-16. Serve it and eval it by URL instead:
 *   cp scripts/probe-gym.js public/__probe-tmp.js && pnpm build && pnpm start
 *   agent-browser --session gymtest eval "fetch('/__probe-tmp.js').then(r=>r.text()).then(t=>{(0,eval)(t); return typeof __probe})"
 *   rm public/__probe-tmp.js          # BEFORE committing. It must never ship.
 *
 * START FROM A CLEAN BROWSER. `localStorage.clear()` then reload before a full run. Swaps and the
 * finished state persist, so poking at the page by hand first makes three of these fail with
 * "session already saved" and look like app defects. They are not.
 *
 * THE PAGE MUST HAVE FOCUS, and `run()` now refuses to start if it does not. Chrome fires no focus
 * or blur events for an unfocused document, so in a background tab `el.focus()` moves
 * `document.activeElement` while emitting no `focusout`, React's delegated `onBlur` never runs, and
 * five write-path tests report zero writes. That reads exactly like an app that has stopped saving.
 * It happened: those five were carried into a handoff on 2026-08-21 as a real defect and queued for
 * their own session, and the app had been correct all along. Driving over CDP, send
 * `Emulation.setFocusEmulationEnabled {enabled:true}` before navigating.
 *
 * Some tests reload the page. After a reload the harness is gone, so re-eval the file and call the
 * named test: `__probe.run('swapSurvivesReload:after')`. `run()` with no argument runs everything
 * that does not need a reload and tells you which ones it skipped.
 *
 * THE PAGE REPLAYS ITS RETRY QUEUE ON MOUNT since 2026-09-27, out of localStorage, BEFORE anything
 * evaluated after load can patch fetch. So a queued probe write left in localStorage would be posted
 * to the real store by the next load of /gym in that browser. scripts/run-probe-gym.mjs therefore
 * installs this file with Page.addScriptToEvaluateOnNewDocument, so every load is stubbed from its
 * first byte, refuses to run if the origin already holds a queue it did not write, and clears the
 * queue keys when it ends. `run()` clears them too. Driving this file by hand, clear `gym:queue:*`
 * from localStorage before you close the tab.
 */
(() => {
  /* EVERY write route under /gym/api, /swim/api AND /bike/api must be listed here. A route missing from this
     list is not stubbed, so the probe posts it to the real Neon store for real.
     /gym/api/note was added to the app on 2026-08-16 and not to this list, and the first probe of
     the note box went out over the network. It was refused, but only because the browser had no
     unlock cookie: with one, a test would have written a fake note into his actual log. Adding a
     write route means adding it here in the same change.
     /swim/api/baseline is the same route /gym/api/swim-baseline was: it moved on 2026-08-26 when
     swim left /gym, and scripts/lint-probe-routes.mjs was widened to keep watching it there.
     /bike/api/ride was added on 2026-08-27, BEFORE anything calls it: /bike is Phase C and has no
     page. A route listed here that no test exercises costs nothing; a route this list is missing on
     the day somebody builds the form costs a fake ride in the real store. */
  const WRITE_ROUTES = [
    '/gym/api/set',
    '/gym/api/finish',
    '/gym/api/note',
    '/swim/api/baseline',
  ];
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
  /* `.ex[data-slot]`, not `.ex`. Every real exercise card carries data-slot (its programme slot id)
     and data-eff (the exercise actually showing after a swap); nothing else on the page does.
     On 2026-08-27 a notes block reused `.ex` and this helper silently went from 10 exercises to 28,
     with every test still green. See exSelectorMeansExercise below, which is the gate. */
  const cardNames = () => $$('.ex[data-slot]').map((e) => text($('.ex-name', e)));

  /* ON window, since 2026-09-27, so a second evaluation of this file (the driver installs it at
     document start AND evaluates it after load) shares one record of calls and one fetch patch. */
  const state = window.__probeState || (window.__probeState = {
    calls: [],
    mode: 'ok', // 'ok' | 'locked' | 'offline' | 'conflict' (409) | 'error' (500)
    unlockOk: true,
    patched: false,
    /* True when this file ran before the page's own scripts, which is the only state in which a
       replay on mount is caught by the stub. The reload test refuses to run without it. */
    startedAtDocumentStart: document.readyState === 'loading',
    /* When set, the session READ is answered from here instead of the network. The only way to
       exercise "resume a swap somebody logged on another device" without writing to his real log. */
    sessionRows: null,
    /* The session read can be slowed (ms) or failed (500), to watch the page before it has the
       server's sets and after it could not get them. */
    sessionDelay: 0,
    sessionFail: false,
    /* ONE-SHOT ANSWERS for the fake server, consumed in order by the first write whose URL contains
       `route`: { route, status?, delay? }. A delay lets one response land after a later one. */
    plan: [],
  });

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
      if (post && url.includes('/gym/api/session') && (state.sessionRows || state.sessionDelay || state.sessionFail)) {
        if (state.sessionDelay) await sleep(state.sessionDelay);
        if (state.sessionFail) {
          state.calls.push({ url, body: '(session read, failed on purpose)', at: state.calls.length, mode: state.mode, status: 500 });
          return new Response('{"ok":false}', { status: 500, headers: { 'content-type': 'application/json' } });
        }
        if (state.sessionRows) {
          state.calls.push({ url, body: '(session read, answered from fixture)', at: state.calls.length, mode: state.mode });
          return new Response(JSON.stringify({ ok: true, sets: state.sessionRows }), {
            status: 200, headers: { 'content-type': 'application/json' },
          });
        }
        return real(input, init);
      }
      const isWrite = post && WRITE_ROUTES.some((r) => url.includes(r));
      if (!isWrite) return real(input, init);
      let body = null;
      try { body = JSON.parse(init.body); } catch { body = init?.body ?? null; }
      const call = { url, body, at: state.calls.length, mode: state.mode, sentAt: performance.now() };
      state.calls.push(call);
      const i = state.plan.findIndex((p) => url.includes(p.route));
      const once = i >= 0 ? state.plan.splice(i, 1)[0] : null;
      if (once?.delay) await sleep(once.delay);
      if (state.mode === 'offline' && !once?.status) {
        call.status = 'network';
        call.respondedAt = performance.now();
        throw new TypeError('probe: simulated network failure');
      }
      const status = once?.status
        ?? (state.mode === 'locked' ? 401 : state.mode === 'conflict' ? 409 : state.mode === 'error' ? 500 : 200);
      call.status = status;
      call.respondedAt = performance.now();
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

  /* THE BOXES ARE DISABLED UNTIL THE SESSION READ ANSWERS, since 2026-09-27, and `.tabs` says which
     state the page is in. Every test waits for it, or a test that types first finds no enabled box
     and reports an app defect that is really a slow read. */
  const settled = () => waitFor(() => ($('.tabs')?.dataset.session ?? 'ready') !== 'loading', 10000);

  /* Leave no owed write behind for the next test: with the server answering ok, press the banner's
     own retry. A queue left from an earlier test is laid over the server's answer on every hydrate,
     which would make a fixture read back the wrong number. */
  async function drain() {
    const prevMode = state.mode;
    state.mode = 'ok';
    for (let i = 0; i < 3 && $('.save-blocked'); i++) {
      const b = $$('button', $('.save-blocked')).find((x) => /try again/i.test(text(x)));
      if (!b) break;
      b.click();
      await waitFor(() => !$('.save-blocked'), 2000);
    }
    state.mode = prevMode;
  }

  /* Leave the tab and come back, which re-runs the session read. */
  async function rehydrate() {
    const tabs = $$('.tab');
    const here = tabs.find((t) => t.classList.contains('on'));
    const away = tabs.find((t) => !t.classList.contains('on'));
    if (!here || !away) return false;
    away.click();
    await settled();
    here.click();
    await settled();
    await sleep(100);
    return true;
  }

  /* A card that logs a weight, addressed by slot so it can be found again after a re-render. */
  function weightedCard() {
    for (const c of $$('.ex[data-slot]')) {
      if ($('.swapped-note', c)) continue;
      const row = $('.set-row', c);
      const w = row && $$('input', row)[0];
      if (w && !w.disabled && !/BW/.test(w.placeholder)) return c;
    }
    return null;
  }
  const cardBySlot = (slot) => $$('.ex[data-slot]').find((e) => e.dataset.slot === slot) || null;
  const firstInputs = (c) => $$('input', $('.set-row', c));

  function clearQueueKeys() {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('gym:queue:')) localStorage.removeItem(k);
      }
    } catch { /* nothing to clear */ }
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

    /* All five training routes are reachable from here, and the nav does NOT answer to `.tab`.
       Both halves are real defects that happened. Silvio, 2026-08-16: "There is no way for me to go
       to conditioning other than actually type in the URL... it's not evident that it's a clickable
       piece of text." The fix put chips at the top of both pages. The first version of those chips
       carried className="tab", which is what dayTabsSwitch selects, so the harness clicked through,
       navigated off /gym, and SEVENTEEN tests failed with "no set row" and "no note box". A cascade
       like that says something is broken but not what. This says what.

       WAS TWO CHIPS UNTIL 2026-08-27: Workout and The week, pointing at /gym and
       /gym/conditioning. That second route is deleted and its contents are four routes now, so this
       asserts the five that exist. Asserting a COUNT and the exact set, not just "contains /gym",
       because a nav that quietly loses a route is the failure this test is for, and a nav that
       still lists a deleted one is the other half of it.
       Does not navigate, so it stays in the normal run. */
    async surfaceNavIsPresentAndDistinct() {
      const nav = $('.surface-nav');
      if (!nav) return { pass: false, detail: 'no .surface-nav on the page' };
      const want = ['/gym', '/swim', '/run', '/bike', '/health'];
      const links = $$('.surf-tab', nav);
      const hrefs = links.map((a) => new URL(a.href).pathname);
      const missing = want.filter((w) => !hrefs.includes(w));
      const extra = hrefs.filter((h) => !want.includes(h));
      const dayTabTexts = $$('.tab').map((t) => text(t));
      /* "conditioning" stays in this regex on purpose. It is the word that leaked last time, and a
         test that stops looking for the specific string that broke it is a test that has forgotten
         why it exists. */
      const leaked = dayTabTexts.filter((t) => /workout|conditioning|swim|run|bike|body/i.test(t || ''));
      return {
        pass:
          links.length === want.length &&
          missing.length === 0 &&
          extra.length === 0 &&
          leaked.length === 0 &&
          links.filter((a) => a.classList.contains('on')).length === 1,
        detail: { hrefs, missing, extra, dayTabTexts, leakedIntoDayTabs: leaked, activeCount: links.filter((a) => a.classList.contains('on')).length },
      };
    },

    /* THE WHOLE DAY IS ALWAYS SHOWN. Replaced budgetFilters on 2026-08-22.
     *
     * The old test drove the 25/45/60 chips and asserted that a short budget HID exercises. That
     * behaviour is gone: he pointed out the cap only ever removed everything after the main lift,
     * and that it made him predict a session length before starting it, which he gets wrong both
     * ways. The day is one ordered list now and he ticks what he did.
     *
     * So this asserts the opposite of what it used to: nothing on this page hides an exercise, and
     * the sentence naming what to cut first names exercises that are actually rendered. A drop
     * order that names a block the page does not show would be the same class of lie the cap was. */
    async wholeDayIsShown() {
      if ($('.budgets')) return { pass: false, detail: 'the time-budget chips are back' };
      const before = $$('.ex').length;
      if (!before) return { pass: false, detail: 'no exercises rendered at all' };

      /* THE DROP-ORDER SENTENCE IS GONE, 2026-08-27, and this test changed WITH it rather than being
       * deleted. Silvio, holding the page: "the walls of text are all still there ... the text after
       * pull heavy is useless, etc etc". Measured at 390px, 296px and 624 characters of prose sat
       * between the day title and the first exercise, and that sentence was 80px of it.
       *
       * Its JOB has to survive the cut or the cut was a regression: he ran out of time twice (notes
       * #7, #11) and something has to tell him which end to drop. Two things already did, at zero
       * height, which is what made removing the sentence safe rather than lossy:
       *
       *   - every block prints its position, "1/7" ... "7/7"  (.exgroup-n)
       *   - every accessory block carries an "optional" tag    (.tag.opt)
       *
       * So this now asserts the replacement is really there. If a future session deletes the tags,
       * this fails instead of the page quietly losing the answer.
       *
       * AND IT ASSERTS THE SENTENCE HAS NOT COME BACK. Restoring it would reverse a ruling he made
       * after being shown the measurement; per ENGINEERING.md, absence here is a decision, and the
       * only kind of decision that holds is one something checks. */
      if ($('.drop-order')) {
        return { pass: false, detail: 'the .drop-order sentence is back. He cut it on 2026-08-27 after seeing it measured at 80px; the block counters and the "optional" tags carry its job now.' };
      }
      /* A DAY BLOCK IS AN `.exgroup` THAT CARRIES A POSITION COUNTER, and the first version of this
       * check got that wrong: it counted `.exgroup` and found 9 against 7 blocks. Unlike `.ex`,
       * `.exgroup` is a DECLARED shared idiom (training.css says so) and the note box and the notes
       * list both use it legitimately. So the discriminator is `.exgroup-n`, the same way `.ex`
       * needs `data-slot`.
       *
       * The counter also states the total, "1/7", so the page says how many blocks it believes it
       * has. Reading the denominator and counting the blocks is a real check: a dropped block makes
       * the two disagree, which is the failure this test exists for now that the drop-order sentence
       * is not here to name the tail. */
      const positionEls = $$('.exgroup-n');
      const groups = positionEls.map((el) => el.closest('.exgroup')).filter(Boolean);
      const claimedTotal = Number((text(positionEls[0]) || '').split('/')[1] || 0);
      const optionalTags = $$('.tag.opt').length;

      /* Nothing may collapse the list. Waiting a beat and recounting catches a late effect that
         filters blocks after hydration, which is exactly how the budget used to arrive. */
      await sleep(400);
      const after = $$('.ex').length;
      return {
        pass:
          after === before &&
          groups.length > 0 &&
          claimedTotal === groups.length,
          /* `optionalTags > 0` was the fourth operand until 2026-09-06. The week has no accessory blocks now (every block is a
             main pair, on his ruling that optional means skipped), so the tag's ABSENCE is the correct
             state and asserting its presence would fail the right programme. It stays in `detail`. */
        detail: {
          rendered: before,
          afterSettle: after,
          blocksRendered: groups.length,
          blocksTheCounterClaims: claimedTotal,
          optionalTags,
          dropOrderSentence: 'absent, as ruled 2026-08-27',
        },
      };
    },

    /* EVERY PARTNER CARD SAYS WHY IT IS THERE, checked ON THE SCREEN.
       Added 2026-08-28. content/gym/validate.mjs accepts EITHER a whyHere or an open question on a
       position-2 exercise, and until today only the first of those rendered. So the 2026-08-27
       rewrite moved seven of thirteen partners onto the open branch, the gate stayed green, and the
       majority of partner cards silently went back to saying nothing. On Tuesday four of five showed
       no reason, and Tuesday is the day he wrote "why is there db standing calf here".

       A GATE THAT ACCEPTS AN INVISIBLE ALTERNATIVE CANNOT MEASURE REACH, and that is why this check
       is here rather than in the validator: the validator reads the FILE and the failure was on the
       SCREEN. AGENTS.md's account of this feature is that it shipped, validated, rendered, named the
       questioned partner in 10 of 11 cases, and he asked the same question five more times over nine
       days. Nothing was broken then either.

       A PARTNER is any card after the first inside one block. Read from the DOM rather than from
       program.json, because what is being asserted is what he can see. Navigates nothing, writes
       nothing. */
    async everyPartnerShowsAReason() {
      /* EVERY SESSION, NOT THE ONE THAT HAPPENS TO BE ON SCREEN, since 2026-09-03. The two-session
         week has one session whose blocks are all solo lifts, and dayTabsSwitch runs before this and
         leaves whichever tab it clicked active. On that session this test counted zero partners and
         failed on `partners > 0`, which is a fact about test order and not about the page. So it
         walks every tab and puts the original one back. */
      const tabs = $$('.tab');
      const original = tabs.find((t) => t.classList.contains('on'));
      const missing = [];
      let partners = 0;
      const countHere = () => {
        for (const b of $$('.exgroup')) {
          const cards = $$('.ex[data-slot]', b);
          for (let i = 1; i < cards.length; i++) {
            partners++;
            const card = cards[i];
            if (!$('.ex-why', card)) {
              missing.push(text($('.ex-name', card)) || card.getAttribute('data-slot') || '?');
            }
          }
        }
      };
      if (!tabs.length) countHere();
      for (const t of tabs) { t.click(); await sleep(300); countHere(); }
      if (original) { original.click(); await sleep(300); }
      return {
        pass: partners > 0 && missing.length === 0,
        detail: {
          partnersOnScreen: partners,
          showingNoReason: missing,
          note: missing.length
            ? 'a partner card renders no reason: the file may satisfy the gate while the screen says nothing'
            : 'every partner names why it is there',
        },
      };
    },

    /* `.ex` MEANS AN EXERCISE, and nothing else on this page may answer to it.
       Added 2026-08-27, the day a "what you have written" notes block shipped using `.ex` for its
       rows. Every test passed. cardNames() went from 10 entries to 28, wholeDayIsShown compared a
       count against itself and saw no change, and the harness was counting his notes as exercises.

       The discriminator is data-slot, which GymClient puts on every real card and nothing else has.
       Same family as surfaceNavIsPresentAndDistinct: on this surface a class name is an API, and
       this is the third time it has been borrowed (`.tab` cost 17 failing tests, then swap-revert).
       Does not navigate and writes nothing. */
    async exSelectorMeansExercise() {
      const all = $$('.ex');
      const real = $$('.ex[data-slot]');
      const strays = all
        .filter((e) => !e.hasAttribute('data-slot'))
        .map((e) => (text($('.ex-name', e)) || e.className || '?').slice(0, 60));
      return {
        pass: all.length > 0 && strays.length === 0,
        detail: {
          totalDotEx: all.length,
          realExercises: real.length,
          strays,
          note: strays.length ? 'something that is not an exercise is answering to .ex' : 'clean',
        },
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

    /* THE ALTERNATIVES ARE VISIBLE CHIPS since 2026-09-06, not a picker behind a tap. The three cases
       below drive `.alt-chip` directly; there is no toggle to open. Renamed from altPickerOpens. */
    async altChipsAreVisible() {
      const ex = $$('.ex').find((e) => $('.ex-swap .alt-chip', e));
      if (!ex) return { pass: false, detail: 'no exercise offers alternatives' };
      const opts = $$('.alt-chip', ex).map(text);
      return { pass: opts.length > 0, detail: { on: text($('.ex-name', ex)), alternatives: opts } };
    },

    async swapChangesTheCard() {
      const ex = $$('.ex').find((e) => $('.ex-swap .alt-chip', e));
      if (!ex) return { pass: false, detail: 'no swappable exercise' };
      const slot = ex.dataset.slot;
      const before = text($('.ex-name', ex));
      const beforeEff = ex.dataset.eff;
      const beforeMeta = text($('.ex-meta', ex));
      const wanted = text($('.alt-chip', ex));
      $('.alt-chip', ex).click();
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
      const ex = $$('.ex').find((e) => $('.ex-swap .alt-chip', e) && $('.set-row', e));
      if (!ex) return { pass: false, detail: 'no swappable exercise that logs sets' };
      const slot = ex.dataset.slot;
      const opt = $('.alt-chip', ex);
      if (!opt) return { pass: false, detail: { step: 'find an alternative chip', slot } };
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
      /* Every swap key, not one built from the UTC date: the page keys swaps by its Calgary session
         date, which differs from the UTC one every evening. */
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith('gym:swaps:')) localStorage.removeItem(k);
        }
      } catch {}
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
      const ex = $$('.ex').find((e) => $('.ex-swap .alt-chip', e));
      if (!ex) return { pass: false, detail: 'no swappable exercise' };
      const wanted = text($('.alt-chip', ex));
      const from = text($('.ex-name', ex));
      $('.alt-chip', ex).click();
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

    /* THE RETRY QUEUE SURVIVES A RELOAD (LD2), in two halves like swapSurvivesReload.
     *
     * :before writes a set with the server offline, so it is queued and mirrored to localStorage.
     * The driver then reloads. The page replays the queue ON MOUNT, before anything evaluated after
     * load could patch fetch, so this refuses to run unless this file was installed at document start
     * (scripts/run-probe-gym.mjs does it with Page.addScriptToEvaluateOnNewDocument): otherwise the
     * replay would reach the real store. :after asserts the replay posted the same set, and clears
     * the queue keys whatever happened. */
    async 'queueSurvivesReload:before'() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      if (!state.startedAtDocumentStart) {
        return { pass: false, detail: 'REFUSED: this file was not installed at document start, so the replay after the reload would go to the real store. Run it through scripts/run-probe-gym.mjs.' };
      }
      await drain();
      clearQueueKeys();
      const c = weightedCard();
      if (!c) return { pass: false, detail: 'no weighted card' };
      const [w] = firstInputs(c);
      state.mode = 'offline';
      type(w, '77'); blur(w);
      await sleep(300);
      let stored = null;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('gym:queue:')) stored = { key: k, value: localStorage.getItem(k) };
        }
      } catch {}
      const ok = !!stored && /"weight":77/.test(stored.value || '');
      sessionStorage.setItem('__probeQueue', JSON.stringify({ eff: c.dataset.eff, weight: 77 }));
      return {
        pass: ok,
        detail: { storedKey: stored?.key ?? null, holdsTheSet: ok, next: 'reload, re-eval, run queueSurvivesReload:after' },
      };
    },

    async 'queueSurvivesReload:after'() {
      const raw = sessionStorage.getItem('__probeQueue');
      if (!raw) { clearQueueKeys(); return { pass: false, detail: 'no :before was recorded in this tab' }; }
      const { eff, weight } = JSON.parse(raw);
      const replayed = await waitFor(() => state.calls.find((c) => c.url.includes('/gym/api/set')
        && c.body?.exerciseId === eff && c.body?.weight === weight), 6000);
      let left = 0;
      try {
        for (let i = 0; i < localStorage.length; i++) if ((localStorage.key(i) || '').startsWith('gym:queue:')) left++;
      } catch {}
      clearQueueKeys();
      sessionStorage.removeItem('__probeQueue');
      return {
        pass: !!replayed && replayed.status === 200 && left === 0,
        detail: { replayedOnMount: !!replayed, status: replayed?.status ?? null, queueKeysLeftAfterReplay: left },
      };
    },

    /* ---- filling an empty rest, 2026-09-05 ------------------------------------------------------
     *
     * The control answering the most-repeated complaint in the note log: six notes over twelve days
     * asking why a main lift sits alone on a two or three minute rest, ending in #54, "Why no
     * superset again?", written after he had supersetted three blocks himself that evening.
     *
     * FOUR CASES, AND TWO OF THEM WATCH IT REFUSE. A gate seen only permitting has not been seen to
     * work. The two that matter most are `fillOnlyWhereThereIsARest` (a paired block and a short
     * accessory must offer nothing) and `fillSetCarriesTheLeadLift` (the write must name the lift
     * whose rest it was done in, or the row is indistinguishable from an off-plan set and the whole
     * point of the column is lost). */

    async fillOffersOnlyLegalPartners() {
      const t = $('.fill-toggle');
      /* NO FILLABLE BLOCK IS THE DESIGNED STATE since 2026-09-06: every lifting block is a pair, and
         the one solo block of each session, the jump primer, is never filled (fill.ts skips role
         primer since 2026-09-27; before that this comment said "every block is a pair" while the
         control was showing on both primers). No control is a pass, not a missing feature. The cases
         below still exercise it whenever a solo lifting block exists. */
      if (!t) return { pass: true, detail: 'every block is paired, nothing to fill; control correctly absent' };
      t.click();
      const list = await waitFor(() => $('.fill-list'));
      if (!list) return { pass: false, detail: 'the chooser did not open' };
      const names = $$('.fill-opt-name', list).map(text);
      /* The list is computed on the server against validate.mjs's own station and adjacency rules,
         so this cannot check legality from here. What it CAN check is that the list is real: an
         empty one renders no control at all, so a control with nothing under it is a bug. */
      return {
        pass: names.length > 0,
        detail: { offered: names.length, first: names.slice(0, 5) },
      };
    },

    async fillOnlyWhereThereIsARest() {
      /* THE REFUSING HALF. Every block that already has two exercises is a rest with somebody in
         it, and must not offer to fill it again; the same goes for a 45-second accessory. The test
         is structural: a `.fill` may not appear inside a block whose exercise count is 2. */
      const groups = $$('.exgroup');
      if (!groups.length) return { pass: false, detail: 'no blocks rendered' };
      const wrong = [];
      const onPrimer = [];
      for (const g of groups) {
        const n = $$('.ex[data-slot]', g).length;
        if (n >= 2 && $('.fill-toggle', g)) wrong.push(text($('.exgroup-label', g)));
        /* A primer's rest is recovery for the next jump. `data-role` is on every day block. */
        if (g.dataset.role === 'primer' && $('.fill-toggle', g)) onPrimer.push(text($('.exgroup-label', g)));
      }
      return {
        pass: wrong.length === 0 && onPrimer.length === 0,
        detail: wrong.length || onPrimer.length
          ? { offeredOnAPairedBlock: wrong, offeredOnAPrimer: onPrimer }
          : { blocks: groups.length, primers: groups.filter((g) => g.dataset.role === 'primer').length, ok: 'no paired block and no primer offers to be filled' },
      };
    },

    async fillDrawsSetRows() {
      let opt = $('.fill-opt');
      if (!opt) {
        const t = $('.fill-toggle');
        if (!t) return { pass: true, detail: 'every block is paired, nothing to fill; control correctly absent' };
        t.click();
        opt = await waitFor(() => $('.fill-opt'));
      }
      if (!opt) return { pass: false, detail: 'the chooser did not open' };
      const picked = text($('.fill-opt-name', opt));
      opt.click();
      const filled = await waitFor(() => $('.fill.filled'));
      if (!filled) return { pass: false, detail: { picked, problem: 'nothing rendered after picking' } };
      const rows = $$('.set-row', filled).length;
      /* THREE, matching the lead lift, because every block in the week is three sets since his note
         #46 and a partner doing fewer is not sharing the rest, it is a thing done afterwards. */
      return { pass: rows === 3, detail: { picked, rows, shownAs: text($('.fill-name', filled)) } };
    },

    /* ---- WHAT COMES BACK AFTER A RELOAD, which the four cases above never asked. -------------------
     *
     * They all stub every write, so there was never a fill row to read back, and the first shipped
     * version was audited by fixture on 2026-09-05 and found to DROP logged fill sets in two cases:
     * a fill whose lead was on a block that later became paired (the render returned null before it
     * looked at the fill), and a fill whose lead is not on the tab being shown (neither on a card nor
     * in the off-plan list, just gone). Same fixture trick as swapSurvivesReload: answer the session
     * read from `state.sessionRows`, leave the tab and come back to force the hydrate. */

    async fillSurvivesHydrateOnASoloBlock() {
      const solo = $$('.exgroup').find((g) => $$('.ex[data-slot]', g).length === 1 && $('.fill-toggle', g));
      if (!solo) return { pass: true, detail: 'every block is paired, nothing to fill; control correctly absent' };
      const lead = $('.ex[data-slot]', solo).dataset.slot;
      state.sessionRows = [
        { exercise_id: lead, set_idx: 1, weight: 100, reps: 5, done: true, swapped_from: null, off_plan: false, fill_for: null },
        { exercise_id: 'probe-fill-x', exercise_name: 'Probe Fill', set_idx: 1, weight: null, reps: 12, done: true, swapped_from: null, off_plan: true, fill_for: lead },
        { exercise_id: 'probe-fill-x', exercise_name: 'Probe Fill', set_idx: 2, weight: null, reps: 11, done: false, swapped_from: null, off_plan: true, fill_for: lead },
      ];
      const tabs = $$('.tab'); const here = tabs.find((t) => t.classList.contains('on')); const away = tabs.find((t) => !t.classList.contains('on'));
      if (!here || !away) return { pass: false, detail: 'need two tabs' };
      away.click(); await sleep(300); here.click();
      const filled = await waitFor(() => $$('.fill.filled').find((f) => text($('.fill-name', f)) === 'Probe Fill'));
      state.sessionRows = null;
      if (!filled) return { pass: false, detail: { lead, problem: 'fill did not render after re-hydrate' } };
      const reps = $$('.set-row', filled).map((r) => $$('input', r)[1]?.value);
      const onLeadBlock = filled.closest('.exgroup') === solo;
      return { pass: onLeadBlock && reps[0] === '12' && reps[1] === '11', detail: { lead, reps, onLeadBlock } };
    },

    async fillOnABlockThatBecamePairedStillShows() {
      /* The lead is the FIRST exercise of a two-exercise block: the RDL after knee raises joined it.
         A fill logged there before the pairing must still render its sets, not vanish. */
      const paired = $$('.exgroup').find((g) => $$('.ex[data-slot]', g).length === 2);
      if (!paired) return { pass: false, detail: 'no paired block on this tab to test against' };
      const lead = $('.ex[data-slot]', paired).dataset.slot;
      state.sessionRows = [
        { exercise_id: 'probe-fill-y', exercise_name: 'Probe Fill Y', set_idx: 1, weight: 20, reps: 9, done: true, swapped_from: null, off_plan: true, fill_for: lead },
      ];
      const tabs = $$('.tab'); const here = tabs.find((t) => t.classList.contains('on')); const away = tabs.find((t) => !t.classList.contains('on'));
      away.click(); await sleep(300); here.click();
      const filled = await waitFor(() => $$('.fill.filled').find((f) => text($('.fill-name', f)) === 'Probe Fill Y'));
      state.sessionRows = null;
      return {
        pass: !!filled && filled.closest('.exgroup') === paired,
        detail: filled ? { lead, rendered: 'on its block' } : { lead, problem: 'a fill on a now-paired block was dropped from the screen' },
      };
    },

    async fillWhoseLeadIsNotOnThisTabGoesToTheList() {
      state.sessionRows = [
        { exercise_id: 'probe-fill-z', exercise_name: 'Probe Fill Z', set_idx: 1, weight: 30, reps: 8, done: true, swapped_from: null, off_plan: true, fill_for: 'not-a-lead-on-any-day' },
      ];
      const tabs = $$('.tab'); const here = tabs.find((t) => t.classList.contains('on')); const away = tabs.find((t) => !t.classList.contains('on'));
      away.click(); await sleep(300); here.click();
      const inList = await waitFor(() => $$('.extra-item').find((e) => /Probe Fill Z/.test(text(e))));
      state.sessionRows = null;
      /* Not on a card (its lead is nowhere), so the honest place is the off-plan list. Absent from
         both is the defect: two sets he did, invisible. */
      return { pass: !!inList && !$$('.fill.filled').some((f) => /Probe Fill Z/.test(text(f))), detail: { inList: !!inList, text: inList ? text(inList) : null } };
    },

    async fillSetCarriesTheLeadLift() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      const filled = $('.fill.filled') || await (async () => {
        const t = $('.fill-toggle');
        if (!t) return null;
        t.click();
        const opt = await waitFor(() => $('.fill-opt'));
        if (opt) opt.click();
        return waitFor(() => $('.fill.filled'));
      })();
      if (!filled) {
        if (!$('.fill-toggle')) return { pass: true, detail: 'every block is paired, nothing to fill; control correctly absent' };
        return { pass: false, detail: 'could not get a filled rest on screen' };
      }
      const before = state.calls.length;
      const [w] = $$('input', $('.set-row', filled));
      if (!w) return { pass: false, detail: 'no weight box in the filled rest' };
      type(w, '35'); blur(w);
      await sleep(400);
      const posted = state.calls.slice(before).filter((c) => c.url.includes('/gym/api/set'));
      if (!posted.length) return { pass: false, detail: 'nothing was written' };
      /* `install` ALREADY PARSED IT. Line 155 does `JSON.parse(init.body)` and stores the object, so
         parsing again turns it into the string "[object Object]" and throws. Cost one run. */
      const body = posted[posted.length - 1].body;
      /* `fillFor` NAMES THE LEAD, and it is what separates this row from an off-plan set. Without it
         the set rehydrates into the loose list at the bottom of the page instead of onto the card,
         which is the exact failure the column was added to prevent. */
      return {
        pass: typeof body.fillFor === 'string' && body.fillFor.length > 0 && body.setIdx === 1,
        detail: { fillFor: body.fillFor ?? null, exerciseId: body.exerciseId, setIdx: body.setIdx },
      };
    },

    /* ---- the 2026-09-27 audit: saves that lost data, and the fake server's other answers ---------
     *
     * LD1: a blur is not a save. An empty box tapped and left posted nulls over a set already logged.
     * LD6: two quick saves of one set could land out of order. L16/L17: a refused or waiting value
     * must not sit on screen as if it were the server's. Each drains the queue first, because a value
     * owed from an earlier test is laid over every hydrate and would make a fixture read back wrong. */

    async emptyBlurDoesNotPost() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      await drain();
      const row = $$('.set-row').find((r) => {
        const [w, rp] = $$('input', r);
        return w && rp && !w.disabled && !rp.disabled && w.value === '' && rp.value === '';
      });
      if (!row) return { pass: false, detail: 'no empty set row with both boxes enabled' };
      const [w, rp] = $$('input', row);
      const grab = since();
      blur(w); blur(rp); blur(w);
      await sleep(300);
      const posted = grab().filter((c) => c.url.includes('/gym/api/set'));
      return {
        pass: posted.length === 0,
        detail: { posts: posted.length, bodies: posted.map((c) => c.body), exercise: text($('.ex-name', row.closest('.ex'))) },
      };
    },

    async unchangedBlurDoesNotPostAndAChangeDoes() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      /* THE CARD'S LAST SET ROW, not its first. Earlier tests type into the first row of the first
         weighted card, and a value the app asked for and has not seen confirmed is laid over every
         hydrate (L17), which is correct app behaviour and made this read back an earlier test's
         number instead of the fixture's. The last row is touched by nothing before this. The queue is
         drained and its storage cleared too, so nothing owed can ride in. */
      await drain();
      clearQueueKeys();
      const c0 = weightedCard();
      if (!c0) return { pass: false, detail: 'no weighted card' };
      const slot = c0.dataset.slot;
      const eff = c0.dataset.eff;
      const idx = $$('.set-row', c0).length;
      const FIX = 137;
      state.sessionRows = [
        { exercise_id: eff, exercise_name: 'x', set_idx: idx, weight: FIX, reps: 5, done: false, swapped_from: null, off_plan: false, fill_for: null },
      ];
      if (!(await rehydrate())) { state.sessionRows = null; return { pass: false, detail: 'need two tabs' }; }
      const lastW = () => { const rows = $$('.set-row', cardBySlot(slot)); return rows[idx - 1] ? $$('input', rows[idx - 1])[0] : null; };
      const shown = await waitFor(() => (lastW()?.value === String(FIX) ? String(FIX) : null), 5000);
      state.sessionRows = null;
      const w = lastW();
      const valueAfterRehydrate = w?.value ?? null;
      if (!w) return { pass: false, detail: { problem: 'the row vanished after rehydrate', slot, idx } };
      const grab = since();
      blur(w);
      await sleep(300);
      const afterBlur = grab().filter((x) => x.url.includes('/gym/api/set')).length;
      type(w, String(FIX + 5)); blur(w);
      await sleep(300);
      const sets = grab().filter((x) => x.url.includes('/gym/api/set'));
      return {
        pass: shown === String(FIX) && afterBlur === 0 && sets.length === 1
          && sets[0].body.weight === FIX + 5 && sets[0].body.setIdx === idx,
        detail: {
          fixture: FIX, setIdx: idx, valueAfterRehydrate, postsOnUnchangedBlur: afterBlur,
          postsAfterChange: sets.length, sent: sets[0]?.body?.weight ?? null, sentSetIdx: sets[0]?.body?.setIdx ?? null,
        },
      };
    },

    async inputsWaitForTheSessionRead() {
      state.sessionDelay = 900;
      const tabs = $$('.tab');
      const away = tabs.find((t) => !t.classList.contains('on'));
      if (!away) { state.sessionDelay = 0; return { pass: false, detail: 'need two tabs' }; }
      away.click();
      await sleep(120);
      const flag = $('.tabs')?.dataset.session;
      const inputs = $$('.set-row input');
      const enabledWhileLoading = inputs.filter((i) => !i.disabled).length;
      await settled();
      state.sessionDelay = 0;
      const enabledAfter = $$('.set-row input').filter((i) => !i.disabled).length;
      return {
        pass: flag === 'loading' && inputs.length > 0 && enabledWhileLoading === 0 && enabledAfter > 0,
        detail: { flagWhileLoading: flag, inputs: inputs.length, enabledWhileLoading, enabledAfter },
      };
    },

    async aFailedSessionReadIsSaid() {
      state.sessionFail = true;
      const tabs = $$('.tab');
      const away = tabs.find((t) => !t.classList.contains('on'));
      if (!away) { state.sessionFail = false; return { pass: false, detail: 'need two tabs' }; }
      away.click();
      const said = await waitFor(() => $('.read-failed'), 4000);
      const flag = $('.tabs')?.dataset.session;
      const enabled = $$('.set-row input').filter((i) => !i.disabled).length;
      state.sessionFail = false;
      const again = said && $$('button', said).find((b) => /load again/i.test(text(b)));
      if (again) again.click();
      const cleared = await waitFor(() => !$('.read-failed') && $('.tabs')?.dataset.session === 'ready', 6000);
      return {
        pass: !!said && flag === 'failed' && enabled > 0 && !!cleared,
        detail: { said: text(said), flag, enabledAfterFailure: enabled, clearedByLoadAgain: !!cleared },
      };
    },

    async twoQuickSavesLandInOrder() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      await drain();
      const c = weightedCard();
      if (!c) return { pass: false, detail: 'no weighted card' };
      const [w] = firstInputs(c);
      state.plan.push({ route: '/gym/api/set', delay: 600 });
      const grab = since();
      type(w, '61'); blur(w);
      await sleep(80);
      type(w, '62'); blur(w);
      await sleep(200);
      const whileFirstOut = grab().filter((x) => x.url.includes('/gym/api/set')).length;
      await waitFor(() => grab().filter((x) => x.url.includes('/gym/api/set')).length >= 2 && grab().every((x) => x.respondedAt), 3000);
      const sets = grab().filter((x) => x.url.includes('/gym/api/set'));
      const [a, b] = sets;
      return {
        pass: whileFirstOut === 1 && sets.length === 2 && a.body.weight === 61 && b.body.weight === 62
          && b.sentAt >= a.respondedAt && w.value === '62',
        detail: {
          inFlightWhileTheFirstWasOut: whileFirstOut, posts: sets.length,
          order: sets.map((x) => x.body.weight), secondSentAfterFirstAnswered: b ? b.sentAt >= a.respondedAt : null,
          onScreen: w.value,
        },
      };
    },

    async aRefusedSetGoesBackToTheServerValue() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      await drain();
      const c0 = weightedCard();
      if (!c0) return { pass: false, detail: 'no weighted card' };
      const slot = c0.dataset.slot;
      state.sessionRows = [
        { exercise_id: c0.dataset.eff, exercise_name: 'x', set_idx: 1, weight: 100, reps: 5, done: false, swapped_from: null, off_plan: false, fill_for: null },
      ];
      await rehydrate();
      state.sessionRows = null;
      const [w] = firstInputs(cardBySlot(slot));
      await waitFor(() => w.value === '100', 3000);
      state.plan.push({ route: '/gym/api/set', status: 409 });
      type(w, '120'); blur(w);
      const back = await waitFor(() => (w.value === '100' ? w.value : null), 3000);
      const banner = text($('.save-blocked'));
      const retry = $('.save-blocked') && $$('button', $('.save-blocked')).find((b) => /try again/i.test(text(b)));
      if (retry) retry.click();
      const cleared = await waitFor(() => !$('.save-blocked'), 3000);
      return {
        pass: back === '100' && /another card/i.test(banner || '') && !!cleared,
        detail: { valueAfter409: w.value, banner, bannerClearedByTryAgain: !!cleared },
      };
    },

    async aServerErrorIsQueuedNotDropped() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      await drain();
      const c = weightedCard();
      if (!c) return { pass: false, detail: 'no weighted card' };
      const [w] = firstInputs(c);
      state.mode = 'error';
      type(w, '71'); blur(w);
      await sleep(300);
      const banner = text($('.save-blocked'));
      state.mode = 'ok';
      const grab = since();
      await drain();
      const resent = grab().filter((x) => x.url.includes('/gym/api/set') && x.body.weight === 71 && x.status === 200).length;
      return {
        pass: /500/.test(banner || '') && /1 set/.test(banner || '') && resent === 1 && w.value === '71',
        detail: { banner, resentAndLanded: resent, onScreen: w.value },
      };
    },

    async waitingValuesSurviveATabSwitch() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      await drain();
      const c0 = weightedCard();
      if (!c0) return { pass: false, detail: 'no weighted card' };
      const slot = c0.dataset.slot;
      const [w0] = firstInputs(c0);
      state.mode = 'locked';
      type(w0, '130'); blur(w0);
      await sleep(250);
      /* The server still says 40: the 130 never landed. */
      state.sessionRows = [
        { exercise_id: c0.dataset.eff, exercise_name: 'x', set_idx: 1, weight: 40, reps: 5, done: false, swapped_from: null, off_plan: false, fill_for: null },
      ];
      await rehydrate();
      state.sessionRows = null;
      const [w] = firstInputs(cardBySlot(slot));
      const shown = w.value;
      state.mode = 'ok';
      await drain();
      return {
        pass: shown === '130',
        detail: { serverSaid: 40, waiting: 130, onScreenAfterTabSwitch: shown },
      };
    },

    /* ---- the three controls nothing drove, 2026-09-27 (U2) ---- */

    async offPlanBoxSendsOffPlan() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      await drain();
      const name = $('.extra-name');
      const [wt, rp] = $$('.extra-num');
      const add = $$('.extra-row button').find((b) => /add set/i.test(text(b)));
      if (!name || !rp || !add) return { pass: false, detail: 'no off-plan box' };
      type(name, 'Probe Knee Raise'); type(wt, ''); type(rp, '10');
      await sleep(100);
      const grab = since();
      add.click();
      await sleep(400);
      const posted = grab().filter((c) => c.url.includes('/gym/api/set'));
      const b = posted[0]?.body;
      const listed = $$('.extra-item').some((e) => /Probe Knee Raise/.test(text(e)));
      /* `offPlan: true` is what routes the write to the append and stamps `off_plan`, which the
         store's overwrite guard compares (LD3). No `setIdx`: the server picks it. */
      return {
        pass: posted.length === 1 && b?.offPlan === true && b?.exerciseId === 'probe-knee-raise' && b?.reps === 10
          && !('setIdx' in (b || {})) && listed,
        detail: { posts: posted.length, body: b, listedOnScreen: listed },
      };
    },

    async oneMoreSetAddsARowThatSaves() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      await drain();
      const c = $$('.ex[data-slot]').find((e) => $('.add-set', e));
      if (!c) return { pass: false, detail: 'no "+ one more set" control' };
      const slot = c.dataset.slot;
      const before = $$('.set-row', c).length;
      $('.add-set', c).click();
      await sleep(200);
      const card2 = cardBySlot(slot);
      const rows = $$('.set-row', card2);
      const after = rows.length;
      const last = rows[rows.length - 1];
      const [, reps] = $$('input', last);
      const grab = since();
      type(reps, '7'); blur(reps);
      await sleep(300);
      const posted = grab().filter((x) => x.url.includes('/gym/api/set'));
      return {
        pass: after === before + 1 && posted.length === 1 && posted[0].body.setIdx === after && posted[0].body.reps === 7,
        detail: { rowsBefore: before, rowsAfter: after, sentSetIdx: posted[0]?.body?.setIdx ?? null },
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
        const ex = $$('.ex').find((e) => $('.ex-swap .alt-chip', e) && $('.done-toggle', e));
        if (!ex) return { pass: false, detail: 'no swappable exercise that logs sets' };
        $('.alt-chip', ex).click();
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

    /* "RAN OUT OF TIME" SENDS THE OTHER ENDING, and a finish the server has no session for is SAID.
       The fake server answers the finish 409, which is what /gym/api/finish now returns when no
       session row exists for that date and day (L1). The page used to print "Session saved." over an
       update that touched nothing; it must say nothing is logged, and must not land a finish, so
       finishPostsExactlyOnce still counts one. */
    async ranOutOfTimeSendsCutShortAndA409IsSaid() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      state.mode = 'ok';
      const btn = $$('button.ghost').find((b) => /ran out of time/i.test(text(b)));
      if (!btn) return { pass: false, detail: 'no "Ran out of time" button (session already saved?)' };
      state.plan.push({ route: '/gym/api/finish', status: 409 });
      const grab = since();
      btn.click();
      await sleep(700);
      const fin = grab().filter((c) => c.url.includes('/gym/api/finish'));
      const line = text($('.finish-blocked'));
      const claimsSaved = /session saved/i.test(document.body.innerText);
      return {
        pass: fin.length === 1 && fin[0].body?.status === 'cutshort' && /no set is logged/i.test(line || '') && !claimsSaved,
        detail: { finishPosts: fin.length, sentStatus: fin[0]?.body?.status ?? null, lineUnderButton: line, claimsSaved },
      };
    },

    /* Builds its own precondition rather than inheriting one, the same way
       swappedExerciseRestTimerNamesIt does above.

       It used to require that finishIsRefusedWhileAWriteIsOwed had just run. That test ends with
       `state.mode = 'ok'`, and swappedExerciseRestTimerNamesIt runs between the two and clicks a
       done-toggle, whose write then SUCCEEDS and clears the banner. So a full `run()` reported this
       as failed every single time while it passed whenever it was run by hand, which is the worst
       thing a gate can do: a permanent false red teaches you to read the failure list and shrug. */
    async unlockingFlushesEverythingAndFinishes() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      let banner = $('.save-blocked');
      if (!banner) {
        state.mode = 'locked';
        const [row, w] = liveRow();
        if (!row) return { pass: false, detail: 'no set row with an enabled weight box' };
        type(w, '36'); blur(w); await sleep(300);
        const finish = $$('button.primary').find((b) => /finish workout/i.test(text(b)));
        if (!finish) return { pass: false, detail: 'no finish button' };
        finish.click();
        await sleep(600);
        banner = $('.save-blocked');
        if (!banner) return { pass: false, detail: 'could not raise the save-blocked banner' };
      }
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

    /* The note box sends what he typed, then empties. Added with the box on 2026-08-16. */
    async noteBoxPostsWhatWasTyped() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      state.mode = 'ok';
      const box = $('.note-box');
      if (!box) return { pass: false, detail: 'no note box on the page' };
      const body = 'probe note: racks taken, used the smith instead';
      type(box, body);
      await sleep(120);
      const btn = $$('.note-actions button').find((b) => /save note/i.test(text(b)));
      if (!btn) return { pass: false, detail: 'no save button' };
      const grab = since();
      btn.click();
      await sleep(600);
      const posted = grab().filter((c) => c.url.includes('/gym/api/note'));
      return {
        pass: posted.length === 1 && posted[0].body?.body === body && $('.note-box').value === '',
        detail: { posts: posted.length, sentBody: posted[0]?.body ?? null, boxCleared: $('.note-box').value === '' },
      };
    },

    /* A REFUSED note stays in the box.
     *
     * This is the one behaviour here that differs from a set on purpose, so it gets its own test.
     * A queued set can be re-read off the screen, because the input holds the value. A note is a
     * sentence he said once; clearing the box on a write that never landed loses it from the world.
     * So `saveNote` clears only when the write returns true, and this proves it stays otherwise. */
    async aRefusedNoteStaysInTheBox() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      const box = $('.note-box');
      if (!box) return { pass: false, detail: 'no note box on the page' };
      const body = 'probe note: this one must survive a refusal';
      state.mode = 'locked';
      type(box, body);
      await sleep(120);
      const btn = $$('.note-actions button').find((b) => /save note/i.test(text(b)));
      btn.click();
      await sleep(600);
      const stillThere = $('.note-box').value === body;
      const banner = !!$('.save-blocked');
      state.mode = 'ok';
      return {
        pass: stillThere && banner,
        detail: { textSurvived: stillThere, bannerRaised: banner, valueNow: $('.note-box').value.slice(0, 40) },
      };
    },

    /* THE PER-EXERCISE CAPTURE SENDS THE EXERCISE, AND THE EXERCISE IS THE WHOLE POINT. Added
     * 2026-08-31 with gym_note.exercise_id and gym_note.kind.
     *
     * The column exists because eleven of his 37 notes record work gym_set cannot express, and the
     * join back to which exercise he meant was a guess every time (#6 "Why is there db standing calf
     * here" needed the day, the block and a guess). If this control posts without `exerciseId` the
     * column stays null forever and the whole change is decoration, which nothing else here can see:
     * the note lands, the panel closes, the confirmation appears, and the row is as useless as before.
     *
     * ALSO ASSERTS THAT THE CARD'S OWN ID IS THE ONE SENT. `saveExerciseNote` takes the slot id to
     * close the panel and the EFFECTIVE id to send, which differ after a swap, and getting that pair
     * backwards is where four of the five defects found on 2026-08-14 lived. `data-eff` on the card is
     * what the app believes it is doing; this compares the payload against it. */
    async exerciseNotePostsTheExerciseAndKind() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched, refusing to write' };
      state.mode = 'ok';
      const toggle = $('.exnote-toggle');
      if (!toggle) return { pass: false, detail: 'no per-exercise capture control on the page' };
      const cardEl = toggle.closest('.ex');
      const expectId = cardEl?.getAttribute('data-eff');
      toggle.click();
      await sleep(200);
      const panel = $('.exnote-open');
      if (!panel) return { pass: false, detail: 'the panel did not open' };
      const kindBtn = $$('.exnote-kind', panel).find((b) => /skipped/i.test(text(b)));
      if (!kindBtn) return { pass: false, detail: 'no Skipped kind button' };
      kindBtn.click();
      await sleep(80);
      const box = $('.exnote-box', panel);
      const body = 'probe note: skipped it, someone was on the machine';
      type(box, body);
      await sleep(120);
      const send = $$('.exnote-actions button', panel).find((b) => /^send$/i.test(text(b)));
      if (!send) return { pass: false, detail: 'no send button' };
      const grab = since();
      send.click();
      await sleep(600);
      const posted = grab().filter((c) => c.url.includes('/gym/api/note'));
      const sent = posted[0]?.body ?? null;
      /* The panel must close on a landed write, so a second thought about the same exercise starts
         from an empty box rather than from the last one. */
      const closed = !$('.exnote-open');
      return {
        pass: posted.length === 1
          && sent?.body === body
          && sent?.kind === 'skipped'
          && !!sent?.exerciseId
          && sent.exerciseId === expectId
          && closed,
        detail: {
          posts: posted.length,
          sentExerciseId: sent?.exerciseId ?? null,
          cardDataEff: expectId,
          sentKind: sent?.kind ?? null,
          bodyMatched: sent?.body === body,
          panelClosed: closed,
        },
      };
    },

    /* A REFUSED per-exercise note keeps its text AND its panel, for the reason the end-of-session box
     * has its own refusal test: the input is the only copy of a sentence he said once. If the panel
     * closed on a refusal the text would be gone from the screen and from the world at the same time,
     * and the retry queue would be holding the only remaining copy. */
    async aRefusedExerciseNoteKeepsItsPanel() {
      if (!state.patched) return { pass: false, detail: 'fetch not patched' };
      const toggle = $('.exnote-toggle');
      if (!toggle) return { pass: false, detail: 'no per-exercise capture control on the page' };
      toggle.click();
      await sleep(200);
      const panel = $('.exnote-open');
      if (!panel) return { pass: false, detail: 'the panel did not open' };
      const body = 'probe note: this one must survive a refusal';
      type($('.exnote-box', panel), body);
      await sleep(120);
      state.mode = 'locked';
      $$('.exnote-actions button', panel).find((b) => /^send$/i.test(text(b))).click();
      await sleep(600);
      const stillOpen = !!$('.exnote-open');
      const survived = stillOpen && $('.exnote-box').value === body;
      const banner = !!$('.save-blocked');
      state.mode = 'ok';
      /* Leave the surface as it was found, so ordering between tests cannot matter. */
      const cancel = $$('.exnote-actions button').find((b) => /cancel/i.test(text(b)));
      if (cancel) cancel.click();
      await sleep(120);
      return {
        pass: survived && banner,
        detail: { panelStillOpen: stillOpen, textSurvived: survived, bannerRaised: banner },
      };
    },

    /* EXACTLY ONE LANDED FINISH across a full run, since 2026-09-27. It passed on any number of posts
       as long as their bodies matched, so a finish sent three times read green. Refused attempts
       (401, 409, no network) are counted separately: they are the tests above doing their job.
       Meaningful only after unlockingFlushesEverythingAndFinishes, which is the one test that lands
       a finish; run by name alone it reports 0 and fails. */
    async finishPostsExactlyOnce() {
      const all = finishes();
      const landed = all.filter((c) => c.status === 200);
      return {
        pass: landed.length === 1,
        detail: { landedFinishes: landed.length, attempts: all.length, bodies: landed.map((c) => c.body) },
      };
    },
  };

  const NEEDS_RELOAD = new Set([
    'swapSurvivesReload:before', 'swapSurvivesReload:after',
    'queueSurvivesReload:before', 'queueSurvivesReload:after',
  ]);

  /* CAN THIS PAGE EVEN PRODUCE A BLUR? Asked before any test runs, and the answer is measured, not
   * assumed.
   *
   * Chrome does not dispatch focus or blur for a document that lacks system focus. A driver that
   * opens a background tab therefore gets a page where `el.focus()` still moves
   * `document.activeElement`, so everything LOOKS focused, but no `focusout` is ever emitted,
   * React's delegated `onBlur` never runs, and every test that types into a set records zero
   * writes. That is indistinguishable from an app that has stopped saving.
   *
   * It cost this project a week. Five tests were reported as failing on a clean HEAD on 2026-08-21,
   * were written into a handoff as "the repo's only interaction test is dark on the write path",
   * and were queued as their own session. The app was correct the whole time. With focus emulation
   * on, all 22 pass.
   *
   * So the class is eliminated rather than documented: a harness that cannot blur REFUSES TO RUN.
   * The alternative, a note in the header telling the next driver to remember, is exactly the kind
   * of rule HOODII/.agents/ENGINEERING.md records as never having held.
   *
   * The check is empirical and not `document.hasFocus()`, because hasFocus reports the document and
   * this needs to know about the EVENT, which is the thing the tests actually depend on. */
  async function canBlur() {
    const probeInput = document.createElement('input');
    probeInput.setAttribute('aria-hidden', 'true');
    probeInput.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
    document.body.appendChild(probeInput);
    let sawFocusOut = false;
    const onFocusOut = () => { sawFocusOut = true; };
    probeInput.addEventListener('focusout', onFocusOut);
    try {
      probeInput.focus();
      probeInput.blur();
      await sleep(60);
    } finally {
      probeInput.removeEventListener('focusout', onFocusOut);
      probeInput.remove();
    }
    return { ok: sawFocusOut, hasFocus: document.hasFocus() };
  }

  async function run(only) {
    install();
    const focus = await canBlur();
    if (!focus.ok) {
      /* Returned in the same shape as a result set so a driver that only prints the JSON still
         shows it, and `ran: 0` so nothing can read this as a pass. */
      return JSON.stringify({
        ran: 0,
        failed: ['HARNESS: this page cannot fire blur'],
        refusedToRun:
          'focus()+blur() on a scratch input produced no focusout event, so React onBlur will never fire and every ' +
          'write-path test would report zero writes and look like an app bug. The page does not have system focus. ' +
          'Fix the DRIVER, not the app: over CDP send Emulation.setFocusEmulationEnabled {enabled:true} (or ' +
          'Page.bringToFront) before navigating. With agent-browser, use a visible session and keep its window ' +
          'frontmost. Verified 2026-08-21: 5 failed without it, 0 failed with it, same build.',
        documentHasFocus: focus.hasFocus,
        totalWritesIntercepted: state.calls.length,
      });
    }
    const names = only ? [only] : Object.keys(tests).filter((n) => !NEEDS_RELOAD.has(n));
    const out = {};
    for (const n of names) {
      try {
        await settled();
        out[n] = await tests[n]();
      } catch (e) {
        out[n] = { pass: false, detail: { threw: String(e && e.stack ? e.stack.split('\n')[0] : e) } };
      }
    }
    /* Nothing this run queued may outlive it: the next load of /gym in this browser would replay it,
       and a load the driver did not stub would send it to the real store. The :before half of the
       reload pair is the one exception, because its whole point is a queue that survives. */
    if (only !== 'queueSurvivesReload:before') clearQueueKeys();
    const failed = Object.entries(out).filter(([, v]) => !v.pass).map(([k]) => k);
    return JSON.stringify({
      ran: names.length,
      failed,
      skippedNeedsReload: only ? [] : [...NEEDS_RELOAD],
      results: out,
      totalWritesIntercepted: state.calls.length,
    });
  }

  window.__probe = { install, run, canBlur, tests, state, clearQueueKeys, helpers: { type, blur, text, card, cardNames, waitFor, sleep, settled, drain, $, $$ } };
  return install();
})();
