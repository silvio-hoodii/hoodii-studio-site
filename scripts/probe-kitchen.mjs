#!/usr/bin/env node
/* An interaction harness for /kitchen, run in a real browser against real pages.
 *
 * WHY THIS EXISTS. The 2026-08-16 handoff listed it as missing, after two bugs shipped that no gate
 * could see:
 *
 *   1. Step 4 of Honey Garlic Chicken rendered "2 tbsp olive oil" on the garlic step. Rows were keyed
 *      by ingredient ref, and ref is not unique within a step, so two React children shared a key and
 *      a stale row rode along. Typecheck, lint, validate and build all passed.
 *   2. render.mjs was not showing what the cook screen shows. It hid every `look` behind a flag while
 *      CookClient renders them unconditionally, so the tool built for reading a card the way he reads
 *      it was showing something else.
 *
 * Both were found by opening the page. Neither was reachable from a static gate, for the same reason
 * scripts/probe-gym.js exists: the gates check that the code is consistent with itself.
 *
 * NO WRITES, AND IT IS ENFORCED IN THE PAGE RATHER THAN PROMISED IN THIS COMMENT.
 *
 * The first version of this file said the guarantee was "structural rather than careful" and it was
 * neither: it patched nothing, and three POST routes exist under /kitchen/api, one of which
 * (`/finish`) consumes stock. `scripts/lint-probe-routes.mjs` walks only the gym. The gym had exactly
 * this incident, got a build gate for it, and the kitchen got a sentence. By this project's own
 * definition that is decoration, and an adversarial pass said so on the day it was written.
 *
 * `installWriteGuard` below replaces window.fetch in every tab before any check runs, and any POST,
 * PUT, PATCH or DELETE to /kitchen/api throws instead of leaving the browser. There is no development
 * database: KITCHEN_DATABASE_URL is the real Neon store, so an unguarded probe writes into his actual
 * stock and cook log. A check that cannot run without the guard is the only version of this that is
 * worth the sentence above it.
 *
 * NO DEPENDENCY. It drives Chrome over raw CDP with node's built-in WebSocket. Adding playwright to
 * this repo for one script would put a browser download into the deploy path.
 *
 * USAGE
 *   pnpm build && PORT=3007 pnpm start
 *   node scripts/probe-kitchen.mjs http://localhost:3007
 *   node scripts/probe-kitchen.mjs https://hoodii.studio
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = (process.argv[2] || 'http://localhost:3007').replace(/\/+$/, '');
const PORT = 9333;
const NL = String.fromCharCode(10);

/* Whatever chromium is already on this machine. Playwright's download cache is the usual one and a
 * real Chrome install works as well. Refuse rather than guess a path that does not exist. */
function findChrome() {
  const roots = [
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'ms-playwright'),
    process.env.HOME && join(process.env.HOME, '.cache', 'ms-playwright'),
  ].filter(Boolean);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const dirs = readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse();
    for (const d of dirs) {
      for (const rel of ['chrome-win64/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = join(root, d, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  for (const p of [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]) if (existsSync(p)) return p;
  return null;
}

const CHROME = findChrome();
if (!CHROME) {
  console.error('No chromium found. Install one, or run: npx playwright install chromium');
  process.exit(2);
}

const proc = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + PORT, '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + (process.env.TEMP || '/tmp') + '/probe-kitchen',
  // His phone is where every one of these pages is actually used, so that is the only width tested.
  '--window-size=390,844', 'about:blank',
], { stdio: 'ignore' });

async function openTab(url) {
  for (let i = 0; i < 60; i++) {
    /* IS THE SERVER UNDER TEST EVEN THIS BUILD? Added 2026-08-18, after a probe run reported 9 failures
 * against a `next start` from an earlier session that was still squatting on port 3007. Four of them
 * were, on 3002, 3007, 3009 and 3011, all serving old builds of this repo, and the `until curl` loop
 * that waited for "the server" was satisfied by the stale one instantly. Every failure it printed was
 * about code that had already been replaced.
 *
 * `.next/BUILD_ID` changes on every build, and Next serves that build's manifest under a path
 * containing it. If the server is running something else, that path 404s. So this is one request, and
 * it turns the worst failure mode of this file, a confident report about the wrong code, into a refusal
 * to start. It is skipped for a remote base, where the local BUILD_ID is not what is deployed. */
async function assertSameBuild(base) {
  if (!/^https?:\/\/localhost|^https?:\/\/127\.0\.0\.1/.test(base)) return;
  const { readFileSync } = await import('node:fs');
  let id = '';
  try { id = readFileSync(new URL('../.next/BUILD_ID', import.meta.url), 'utf8').trim(); } catch { return; }
  const res = await fetch(base + '/_next/static/' + id + '/_buildManifest.js').catch(() => null);
  if (res && res.ok) return;
  console.error('REFUSING TO PROBE. ' + base + ' is not serving this build (' + id + ').');
  console.error('Something else is on that port. `netstat -ano | grep LISTENING | grep :PORT` and use a free one.');
  process.exit(2);
}
await assertSameBuild(BASE);

try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(url), { method: 'PUT' });
      if (r.ok) return r.json();
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('chrome never came up');
}

function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params = {}) => new Promise((res) => {
    const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate threw');
    }
    return r.result?.result?.value;
  };
  return { ws, ready, send, evaluate };
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log((ok ? 'ok    ' : 'FAIL  ') + name + (detail ? '   ' + detail : ''));
};

const PASTE = [
  'Tuna, caper and chilli spaghetti', 'Serves 2', '', 'Ingredients',
  '150g spaghetti or linguine', '1 tbsp olive oil', '1 garlic clove, sliced',
  '1 red chilli, deseeded and finely chopped', '1 tbsp drained capers',
  'small bunch of parsley, finely chopped', '145g tuna in spring water, drained',
  '90g rocket', 'half a lemon, juiced', '', 'Method', '1. Cook the spaghetti for 9-11 mins.',
].join(NL);

const FIND_BOX = '[...document.querySelectorAll("details")].find(x => x.textContent.indexOf("Or paste the recipe") !== -1)';

/* Installed on every tab, and every check goes through a helper that refuses to proceed without it.
 * Returns the guard's own report so a test can assert that nothing was even attempted. */
const WRITE_GUARD = `
  (() => {
    if (window.__probeGuard) return 'already';
    window.__probeGuard = { blocked: [] };
    const real = window.fetch;
    window.fetch = function (input, init) {
      const url = String(typeof input === 'string' ? input : (input && input.url) || '');
      const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD' && url.indexOf('/kitchen/api') !== -1) {
        window.__probeGuard.blocked.push(method + ' ' + url);
        return Promise.reject(new Error('probe write guard: refused ' + method + ' ' + url));
      }
      return real.apply(this, arguments);
    };
    return 'installed';
  })()
`;

/* `Page.addScriptToEvaluateOnNewDocument`, NOT a plain evaluate.
 *
 * The first version evaluated the guard straight after connecting, which put it into a JS context the
 * page then threw away when its own document loaded. On localhost that raced in our favour and the
 * probe read as green; against production it lost the race and `window.__probeGuard` was undefined.
 *
 * A guard that is present or absent depending on how fast a server answers is worse than no guard,
 * because it reads as protection. This registers it as a document-start script, so every document in
 * the tab, including after any navigation, gets it before a single page script runs.
 *
 * It was caught by the check that reports what the guard blocked. A guarantee nothing verifies is the
 * thing this whole file exists to argue against, and it very nearly shipped inside the guard itself. */
async function guarded(c) {
  await c.send('Page.enable');
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: WRITE_GUARD });
  // Reload so the just-registered script actually runs against this document.
  await c.send('Page.reload', { ignoreCache: false });
  for (let i = 0; i < 40; i++) {
    const state = await c.evaluate('window.__probeGuard ? "installed" : "no"');
    if (state === 'installed') return c;
    await sleep(500);
  }
  throw new Error('write guard did not install; refusing to run against a real database');
}

const target = await openTab(BASE + '/kitchen/want');
const conn = connect(target);
await conn.ready;
const { ws, evaluate } = conn;
await guarded(conn);
await sleep(2500);

try {
  /* ---- 1. the paste box exists at all ----
   * wantByUrl has answered a 403 with "copy the ingredient list here instead" since the day it was
   * written, and for days there was no box to copy into. A promise inside an error message is a
   * feature claim, and this is the check that it is not a bluff. */
  check('paste box renders', await evaluate('!!document.querySelector("textarea[name=\'text\']")'));

  await evaluate(
    '(() => { const d = ' + FIND_BOX + ';'
    + ' d.open = true;'
    + ' const ta = d.querySelector("textarea[name=\'text\']");'
    + ' ta.value = ' + JSON.stringify(PASTE) + ';'
    + ' ta.dispatchEvent(new Event("input", { bubbles: true }));'
    + ' d.querySelector("form").requestSubmit(); return true; })()',
  );

  let out = '';
  for (let i = 0; i < 40; i++) {
    out = await evaluate(
      '(() => { const d = ' + FIND_BOX + ';'
      + ' const b = [...d.querySelectorAll(".box")];'
      + ' return b.length ? b.map(x => x.innerText).join(String.fromCharCode(10)) : ""; })()',
    ) || '';
    if (out) break;
    await sleep(500);
  }

  /* ---- 2. a pasted recipe scores against the LIVE stock fold ----
   * Both assertions below are things this app got wrong THIS WEEK, and both are a false "you have
   * it", which law 5 in .agents/ENGINEERING.md names as the worse direction of error:
   *
   *   fresh chilli: BBC's "1 red chilli ... plus extra to serve (optional)" read as an optional line,
   *     so the dish said "you can make this now" in a kitchen with no chilli, and named no gap at all.
   *   capers: he said out loud that the piccata rebuild used the whole jar. Nothing wrote it down and
   *     the app kept offering caper dishes for eight days afterwards. */
  check('a pasted recipe is scored', Boolean(out), out ? '' : 'no result box ever rendered');
  /* ---- REMOVED 2026-08-21: this check was untestable at this surface, in both of its forms ----
   *
   * It began as `/fresh chilli/i.test(out)`, meaning "the red chilli was reported as missing", and it
   * was RED before any of today's work. Two independent reasons, and neither was a bug in the app:
   *
   *   1. There is no `fresh chilli` term in `stock/aliases.json`, in any version. Diffed `_knownGaps`
   *      against the commit before today's: byte-identical. So "1 red chilli" resolved to UNKNOWN and
   *      that phrase could never appear no matter what the matcher did.
   *   2. The premise expired. He bought a 225 g bag of jalapenos on 2026-08-19 and a jalapeno is a
   *      fresh chilli, so "a kitchen with no chilli" stopped being true. `red chilli` now maps to
   *      `jalapeno`, which is the honest answer, and the line is correctly HAD.
   *
   * It was then repointed to assert the weaker invariant, that the line is accounted for SOMEWHERE.
   * That is the right invariant and this is the wrong place to assert it: `/kitchen/want`'s result box
   * renders `missing` and `haveVia` only. It never lists `have` or `unknown`, so an ingredient the
   * matcher resolves correctly is legitimately absent from the text, and the check cannot tell a
   * silently dropped line from a correctly matched one. It went red for a passing app.
   *
   * Deleted rather than left failing. This repo has already recorded how a permanent warning trains
   * its reader to ignore the harness, and a red check that is about nothing is the same defect as a
   * green one that is about nothing, which is its oldest failure mode.
   *
   * WHAT IS STILL UNGUARDED, said out loud so it is not mistaken for covered: nothing asserts that
   * every ingredient line reaches one of have / missing / unknown. The original 2026-08-12 bug was a
   * line vanishing while the dish claimed ready and named no gap. Closing this properly needs the
   * accounting on screen, which is a want-page change (`counted` is already computed by
   * scoreRecipe and rendered nowhere), not a probe change. */
  check('a stock row he emptied out loud is respected', /capers/i.test(out),
    /capers/i.test(out) ? '' : 'capers were not reported as missing');

  /* ---- 3. the paste survives the round trip ----
   * An uncontrolled textarea comes back empty once the action returns, so fixing one wrong line
   * would mean copying the whole recipe off the page again. */
  const kept = await evaluate('document.querySelector("textarea[name=\'text\']").value.length');
  check('the pasted text is still in the box afterwards', kept > 100, kept + ' chars');

  /* ---- 4. every kitchen page answers at phone width with no sideways scroll ----
   * globals.css once carried overflow:hidden for the deleted WebGL room and shipped /kitchen
   * completely unscrollable on a phone, with the content present and measurable the whole time.
   * Measuring a page's height is not testing that it scrolls. */
  /* THE LONGEST OFFERED DISH IS IN THIS LOOP, and it was not until 2026-08-28.
   *
   * The loop visited /kitchen, /kitchen/find, /kitchen/shop and /kitchen/want, which is every
   * kitchen page EXCEPT the one DESIGN.md says matters most: the step screen he actually cooks from.
   * So when `.kos .dots` overflowed at thirteen steps the probe reported the whole surface fitting a
   * phone, and gnocchi was being offered with fourteen. The audit found it by arithmetic on the CSS
   * (02-kitchen P1-4), which is not a thing that happens twice.
   *
   * FOUND, NOT NAMED. The longest recipe on disk changes with every card added, and a hardcoded id
   * would test the geometry of whatever used to be longest. Reading the files here rather than
   * asking the page keeps the probe read-only. */
  const longestDish = (() => {
    const dir = join(process.cwd(), 'content', 'kitchen', 'recipes');
    let best = null;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      try {
        const r = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        if (r.provenance?.cookedResult === 'failed') continue;
        const n = (r.steps || []).length;
        if (!best || n > best.n) best = { id: r.id || f.replace(/\.json$/, ''), n };
      } catch { /* a card this probe cannot parse is the validator's problem, not this loop's */ }
    }
    return best;
  })();
  if (!longestDish) {
    check('a dish page could be found to measure', false, 'no parseable recipe in content/kitchen/recipes');
  } else {
    console.log(`  (longest dish for the fit loop: ${longestDish.id}, ${longestDish.n} steps)`);
  }

  const FIT_PATHS = ['/kitchen', '/kitchen/find', '/kitchen/shop', '/kitchen/want'];
  /* `?step=` AND NOT THE OVERVIEW. The step progress dots, which are what overflowed, only render
     once cooking has started: `CookClient` keeps the step in the URL as `?step=N` so a reload
     mid-cook does not lose his place. The first version of this addition visited the bare dish page,
     which fits at any recipe length because it has no dots on it, and would have passed on the exact
     build the audit found broken. Mid-recipe, so the dots are all rendered and none is the first or
     last special case. */
  if (longestDish) FIT_PATHS.push(`/kitchen/${longestDish.id}?step=${Math.ceil(longestDish.n / 2)}`);

  for (const path of FIT_PATHS) {
    const t2 = await openTab(BASE + path);
    const c2 = connect(t2);
    await c2.ready;
    await guarded(c2);

    /* WAIT FOR CONTENT BEFORE JUDGING LAYOUT, and assert that it arrived.
     *
     * The first version of this loop slept two seconds and measured. /kitchen/shop scores 2,835
     * recipes against the live stock fold on every request, took longer than that, and reported
     * "0px tall, fits a 390px screen". A blank page has no horizontal overflow, so it PASSED. That
     * is a false pass inside the harness written to catch false passes, and it is the same shape as
     * every bug in this repo's history: the check was true and it was about nothing.
     *
     * So height is now an assertion rather than a detail printed beside one. */
    let tall = 0;
    for (let i = 0; i < 40; i++) {
      /* `document.body` is null until the document is parsed, and the write guard now installs the
       * instant the tab connects, which is EARLIER than the first version measured. Read it defensively
       * and let the loop wait, rather than throwing on a page that is merely still arriving. */
      tall = await c2.evaluate('document.body ? document.body.scrollHeight : 0');
      if (tall > 300) break;
      await sleep(500);
    }
    const wide = await c2.evaluate('document.documentElement.scrollWidth > window.innerWidth + 1');
    check(path + ' renders something', tall > 300, tall + 'px tall');
    check(path + ' fits a 390px screen', tall > 300 && !wide, wide ? 'the page scrolls sideways' : '');

    /* THE NAV MUST NOT WRAP. Added 2026-08-18, and it is the only check here that came from him
     * looking at the thing rather than from a crash: "are those 4 pages/section making sense i dont
     * think so", and before that "i dont know how navigation works". Four sentence-length labels
     * wrapped onto two lines at 390px, which is what turned a set of tabs into four loose links.
     * Height, not label text, because the failure was geometric and a future fifth tab would
     * reintroduce it silently. */
    /* Count the distinct top edges of the nav's children. That is the exact question, and the first
     * version of this check was not it: it divided the strip's height by its line-height, read 2.6 on
     * a nav that sits on a single row, and called it a wrap. The 47px is three 44px tap targets, which
     * is deliberate. A check that is true and about nothing is this repo's oldest failure mode, and it
     * got written into the harness built to catch it. */
    const nav = JSON.parse(await c2.evaluate(
      'JSON.stringify((function(){var n=document.querySelector(".kosnav");'
      + 'if(!n)return {rows:0,tabs:0};var tops={};var k=n.children;'
      + 'for(var i=0;i<k.length;i++){tops[Math.round(k[i].getBoundingClientRect().top)]=1;}'
      + 'return {rows:Object.keys(tops).length,tabs:k.length};})())',
    ) || '{}');
    /* ONLY ON THE PAGES THAT HAVE A NAV. The cook screen deliberately carries no `.kosnav`: it is one
       step filling the screen with a back arrow, and putting three index tabs on it is the wall this
       surface exists to avoid. Adding the dish page to this loop made the check report "0 tabs across
       0 rows" as a failure, which is a checker complaining that a page is built the way it was
       designed. `path.startsWith` rather than a second list, so a new index page joins automatically
       and a new cook-shaped page does not. */
    const hasNav = !path.includes('?step=');
    if (hasNav) {
      check(path + ' nav sits on one line', nav.rows === 1, nav.tabs + ' tabs across ' + nav.rows + ' rows');
    }

    /* ---- THE HOME PAGE MUST BE READING THE ENGINE ----
     *
     * Added 2026-08-21. For ten days /kitchen scored the 36 hand-built cook cards and announced
     * "2 ready to cook" while /kitchen/find scored 2,835 corpus recipes against the same fridge and
     * found hundreds. One tap apart. His verdict: "I might as well just search for a recipe online
     * and go by that then. What's the point of all this?"
     *
     * This is the second time two kitchen surfaces have answered one question from their own code.
     * `isOfferable()` was extracted into lib after they disagreed by 14x; that fix unified the gate
     * and left them reading different LIBRARIES, so it returned at 85x and nothing noticed for ten
     * days. A prose rule saying "the home page should use the corpus" would not have caught it
     * either, because the code looked deliberate and every comment on it was true.
     *
     * Two assertions, because either one alone is fakeable. The corpus rows must be PRESENT, and the
     * headline number must be too large to have come from a 36-card library. 20 is chosen well below
     * the real figure and well above anything the card path could ever reach: only 7 cards are
     * offerable and the ceiling is 36. */
    if (path === '/kitchen') {
      const rows = Number(await c2.evaluate('document.querySelectorAll(".mealrow").length'));
      check('/kitchen shows dishes from the corpus, not only cook cards', rows > 0,
        rows + ' corpus rows');
      const head = Number(await c2.evaluate(
        '(function(){var e=document.querySelector(".sec .live");'
        + 'return e?parseInt(e.textContent.replace(/[^0-9]/g,""),10)||0:0;})()',
      ));
      check('/kitchen headline counts the corpus, not the card library', head > 20,
        head + ' claimed cookable now'
        + (head > 20 ? '' : ', which is card-library scale and means the front page regressed'));
    }
    c2.ws.close();
  }

  /* ---- the shopping list is a list, not an essay ----
   * `/kitchen/shop` was an analysis of what would unlock the most dishes, and he went to it looking for
   * a shopping list. This asserts that the page now opens on rows with a tick-off, above the analysis.
   * It never PRESSES the button: the write guard would block it and report the attempt, which is the
   * correct outcome and not a test. */
  {
    const t3 = await openTab(BASE + '/kitchen/shop');
    const c3 = connect(t3);
    await c3.ready;
    await guarded(c3);
    let shape = { rows: 0, got: 0, addBox: 0, foldBeforeList: true };
    for (let i = 0; i < 40; i++) {
      shape = JSON.parse(await c3.evaluate(
        'JSON.stringify((function(){'
        + 'var rows=document.querySelectorAll(".meallist .mealrow").length;'
        + 'var got=[].filter.call(document.querySelectorAll("button"),function(b){return /got it/i.test(b.textContent||"");}).length;'
        + 'var addBox=[].filter.call(document.querySelectorAll("input"),function(i){return i.getAttribute("aria-label")==="Add to the shopping list";}).length;'
        + 'var fold=document.querySelector("details.fold");'
        + 'var firstRow=document.querySelector(".meallist .mealrow");'
        + 'var foldBeforeList=!!(fold&&firstRow&&fold.compareDocumentPosition(firstRow)&Node.DOCUMENT_POSITION_FOLLOWING);'
        + 'return {rows:rows,got:got,addBox:addBox,foldBeforeList:foldBeforeList};})())',
      ) || '{}');
      if (shape.rows > 0 && shape.addBox > 0) break;
      await sleep(500);
    }
    check('the shopping list has rows', shape.rows > 0, shape.rows + ' rows');
    check('every open row can be ticked off', shape.got > 0, shape.got + ' Got it buttons');
    check('he can add something himself', shape.addBox === 1, shape.addBox + ' add boxes');
    check('the list comes before the analysis', !shape.foldBeforeList, shape.foldBeforeList ? 'the fold is above the first row' : '');
    c3.ws.close();
  }
  /* ---- 5. nothing tried to write, and the guard is the thing saying so ----
   * Reported rather than assumed. If a future check does POST to a write route this goes red and
   * names it, instead of the write silently landing in his stock log. */
  const blocked = await evaluate('JSON.stringify(window.__probeGuard.blocked)');
  const list = JSON.parse(blocked || '[]');
  check('no check attempted a write to /kitchen/api', list.length === 0, list.join(', '));
} finally {
  ws.close();
  proc.kill();
}

const bad = results.filter((r) => !r.ok);
console.log('-'.repeat(70));
console.log(results.length + ' checks, ' + bad.length + ' failed');
process.exit(bad.length ? 1 : 0);
