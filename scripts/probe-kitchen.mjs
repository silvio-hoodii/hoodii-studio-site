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
import { existsSync, readdirSync } from 'node:fs';
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
  check('an optional garnish does not make its own ingredient optional', /fresh chilli/i.test(out),
    /fresh chilli/i.test(out) ? '' : 'the red chilli was not reported as missing');
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
  for (const path of ['/kitchen', '/kitchen/find', '/kitchen/shop', '/kitchen/want']) {
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
    c2.ws.close();
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
