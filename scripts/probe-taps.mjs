#!/usr/bin/env node
/**
 * THE 44px TAP FLOOR, MEASURED. And the sub-tab chip row, and horizontal overflow.
 *
 *   node scripts/probe-taps.mjs <base-url> [path ...]
 *   node scripts/probe-taps.mjs http://localhost:3031
 *
 * WHY THIS EXISTS. The repo has fixed the under-44px class at least NINE separate times, each fix a
 * comment plus a min-height in one selector: globals.css site-footer, `.chip`, curio `.src`, music
 * `.more summary`, reading `.acts`, `.rtab`, `.tier-src`, kitchen `.prov summary`, `.plainlist a`.
 * It keeps coming back because nothing measures. The 2026-08-26 UX audit found seven more instances
 * in one automated sweep and its first recommendation was to make that sweep a script (08-ux-ui P2-1):
 * "A floor that is only prose will be under-run again; this one is measurable in 30 lines."
 *
 * `reading.css` states the rule in its own words: "44px, the tap floor. Eight controls on this site
 * were found under it by measuring every control on every page, so a new surface starts at the floor."
 * That sentence has been true and unenforced since it was written.
 *
 * IT ALSO MEASURES TWO OTHER GEOMETRIC FAILURES THIS SURFACE HAS ACTUALLY SHIPPED, because the same
 * page visit answers all three and a probe nobody runs is worth nothing:
 *
 *   HORIZONTAL OVERFLOW. `.kos .dots` was a no-wrap flex row with a 26px min-width, so a fourteen-step
 *   recipe scrolled sideways on the cook screen. Measured, not estimated: the audit found it by
 *   arithmetic on the CSS, which is not a thing that happens twice.
 *
 *   THE SUB-TAB CHIP ROW. /swim has FIVE sub-tabs and not six, because the chips end at 317px of a
 *   390px screen and `.subtabs` has neither wrap nor scroll, so the deep dive had to become its own
 *   route. That ceiling is a real design constraint with no mechanism behind it: a sixth chip would
 *   simply vanish off the right edge.
 *
 * READ-ONLY BY CONSTRUCTION. It navigates and measures. It clicks nothing and submits nothing, so
 * unlike `probe-gym.js` it needs no write stubs and cannot reach his data. Raw CDP over the global
 * WebSocket, no new dependency, same pattern as `scripts/probe-kitchen.mjs`.
 *
 * DECLARED EXCEPTIONS, and each one is a decision rather than a tolerance. See ALLOW below.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

/* The floor is 44. The THRESHOLD is 43, because a browser reports 43.5 for a box styled at 44 with a
 * fractional line-height and rounding a real pass into a failure is how a checker gets switched off. */
const FLOOR = 43;
const WIDTH = 390;
const HEIGHT = 844;

/* Controls allowed under the floor, by selector, with the reason. A path added here is a design
 * decision on the record, not paperwork.
 *
 * `.rowaction` on the hub: the arrow at the end of a row whose whole 44px-plus row is the tap target,
 *   so the glyph is decoration inside a control that already passes.
 * `.work` inline links: `work.css` argues these deliberately, because a link inside a sentence cannot
 *   be 44px tall without breaking the line spacing of the paragraph it lives in, and the sentence is
 *   the content. The floor is for controls a thumb aims at, not for words a reader follows.
 * `.asof`: a date annotation inside a verdict chip. Not a control at all; it inherits the chip's box.
 */
const ALLOW = [
  /\browaction\b/,
  /\bquiet-inline\b/,
  /\basof\b/,
  /* A HEATMAP CELL CANNOT BE 44px AND STILL BE A HEATMAP. The attendance strip on /health draws 30
   * day cells and the French activity strip 56, across a 350px content column. Thirty cells at 44px
   * is four rows, which stops being a strip and starts being a calendar, and the whole point of the
   * shape is that a month is one glance.
   *
   * It is an exception rather than a violation because the VALUE is reachable another way: every cell
   * is a `<button>` with an aria-label carrying its date and state, which is what the 2026-08-26 audit
   * praised it for while criticising the French strip's `title` tooltips, since `title` never fires on
   * touch. If a strip cell ever becomes the only route to something, it stops qualifying for this line. */
  /\bstrip-cell\b/,
];

function findChrome() {
  const roots = [
    join(process.env.LOCALAPPDATA || '', 'ms-playwright'),
    join(process.env.USERPROFILE || '', 'AppData', 'Local', 'ms-playwright'),
    join(process.env.HOME || '', '.cache', 'ms-playwright'),
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const d of readdirSync(root).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
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

const BASE = (process.argv[2] || '').replace(/\/$/, '');
if (!BASE) {
  console.error('usage: node scripts/probe-taps.mjs <base-url> [path ...]');
  process.exit(2);
}

/* THE DEFAULT PATH LIST IS EVERY SUB-TAB, not every route. A route's sub-tabs render different
 * controls, and measuring only the default tab is how six of eight surfaces go unmeasured. */
const DEFAULT_PATHS = [
  '/',
  /* `?s=now` is listed even though bare `/health` now resolves to it no longer: the default moved
     from Now to Weight on 2026-08-28 and the bare path stopped covering the streak tab, so a tab
     with three blocks in it would have gone unmeasured on the strength of a list written when the
     default was something else. Measure the tab, not the default. */
  '/health', '/health?s=weight', '/health?s=now', '/health?s=plan', '/health?s=volume',
  '/health/deep',
  '/gym',
  /* `coachme` AND `coachthem` WERE BOTH WRONG UNTIL 2026-09-03 and neither is a sub-tab id. The
     real ones are `me` and `teach` (SUB_TABS in src/app/swim/page.tsx). An unrecognised `?s=` value
     falls back to the Now tab rather than erroring, so this list measured Now three times and
     reported coverage of two coaching tabs it had never loaded. Same shape as `/work`, which was in
     this list for weeks and is not a route: a path that silently resolves to something else passes
     every geometric check, because the thing it measured really is a clean page.
     `assertSubTabsExist` below is the gate now. */
  '/swim', '/swim?s=plan', '/swim?s=how', '/swim?s=me', '/swim?s=teach',
  '/swim/deep', '/swim/records',
  '/run', '/run?s=plan', '/run?s=how',
  '/bike', '/bike?s=plan', '/bike?s=how',
  '/kitchen', '/kitchen/find', '/kitchen/shop', '/kitchen/want',
  '/french', '/curio', '/music',
  '/reading', '/reading/shelf', '/reading/want', '/reading/about', '/reading/finished',
  /* THE FOUR CASE STUDIES, ONE PATH EACH. This list said `/work` until 2026-08-28 and THERE IS NO
     `/work` ROUTE: it renders the 404, which has a header, a heading and one link, and the old
     readiness gate passed it as a measured surface for as long as the list has existed. So four
     published pages went unmeasured while the run reported covering them. */
  '/work/brixel', '/work/kitchen', '/work/themoment', '/work/versatile',
  /* THE GATE ITSELF WAS NEVER IN THIS LIST. Four login pages existed for a year, each with a
     password field and a submit button, which is exactly the shape the 44px floor exists for, and
     none of them was ever measured here. The 2026-09-04 audit measured them only because its own
     scratch driver added them by hand, which is the same "the measured set is not the real set"
     failure this list already records twice above (`/work`, and the two wrong swim sub-tabs).
     They are one route as of 2026-09-04. `?to=` is carried because the eyebrow and the exit link
     are both derived from it, so the bare path renders a page with one fewer control on it. */
  '/login', '/login?to=/reading/shelf',
  /* Not a route anyone navigates to on purpose, and it renders a code plus a copy control on a
     phone, which is the only reason it is here rather than left out. */
  '/callback',
];
const PATHS = process.argv.length > 3 ? process.argv.slice(3) : DEFAULT_PATHS;

/* A PATH THAT IS NOT A PATH IS A FALSE PASS, and this cost a run on 2026-08-28.
 *
 * Git Bash rewrites a bare leading slash into a Windows path, so `node scripts/probe-taps.mjs <base>
 * /health /gym` arrived here as `C:/Program Files/Git/health`. Both mangled paths fetched something
 * that was not the page, measured 2121px, found no small controls and reported "ok". Two green lines
 * about nothing, in the middle of a real run whose other three lines were correct, which is the
 * hardest kind to notice.
 *
 * AGENTS.md already records this class for `shoot.mjs` ("needs MSYS_NO_PATHCONV=1 in Git Bash") as a
 * thing to remember. Remembering is not a mechanism. This refuses instead. */
const mangled = PATHS.filter((p) => !p.startsWith('/'));
if (mangled.length) {
  console.error(`Not a path: ${mangled.join(', ')}`);
  console.error('Git Bash rewrote a leading slash into a Windows path. Prefix the command with');
  console.error('MSYS_NO_PATHCONV=1, or quote each path. Refusing rather than measuring the wrong URL:');
  console.error('a mangled path fetches something that is not the page and reports ok.');
  process.exit(2);
}

/* A `?s=` VALUE THAT IS NOT A SUB-TAB IS THE SAME FALSE PASS, and it cost more than the mangled
 * path did because it lasted longer. Found 2026-09-03: this list carried `/swim?s=coachme` and
 * `/swim?s=coachthem`, and the real ids are `me` and `teach`. Every route here reads its sub-tab
 * from `?s=` and falls back to the first tab when the value is unrecognised, so both paths fetched
 * the Now tab. The run measured Now three times and printed two ok lines about coaching tabs it had
 * never loaded. Nothing was broken and nothing could have caught it: the page it measured is real
 * and clean, which is exactly why a fallback is dangerous in a checker's path list.
 *
 * THE IDS ARE READ FROM THE PAGES rather than restated here, because a second copy of the tab list
 * is the thing that drifted in the first place. Regex over the source and not an import: this script
 * runs on plain node with no build step, which is why it has no dependencies. If a page's array is
 * renamed the parse returns nothing and this refuses, which is the right direction to fail. */
const SUBTAB_SOURCES = [
  ['/health', 'src/app/health/page.tsx', 'TABS'],
  ['/swim', 'src/app/swim/page.tsx', 'SUB_TABS'],
  ['/run', 'src/app/run/page.tsx', 'SUB_TABS'],
  ['/bike', 'src/app/bike/page.tsx', 'SUB_TABS'],
];
{
  const problems = [];
  const known = new Map();
  for (const [route, file, arrayName] of SUBTAB_SOURCES) {
    if (!existsSync(file)) { problems.push(`${route}: ${file} is not there any more`); continue; }
    const src = readFileSync(file, 'utf8');
    const m = new RegExp(`const ${arrayName}\\s*=\\s*\\[([\\s\\S]*?)^\\]`, 'm').exec(src);
    if (!m) { problems.push(`${route}: could not find \`const ${arrayName} = [...]\` in ${file}`); continue; }
    const ids = [...m[1].matchAll(/id:\s*'([a-z0-9-]+)'/g)].map((x) => x[1]);
    if (!ids.length) { problems.push(`${route}: ${arrayName} in ${file} parsed to zero ids`); continue; }
    known.set(route, new Set(ids));
  }
  for (const p of PATHS) {
    const q = /^([^?]+)\?s=([^&]+)$/.exec(p);
    if (!q) continue;
    const ids = known.get(q[1]);
    if (!ids) { problems.push(`${p}: no sub-tab list is known for ${q[1]}`); continue; }
    if (!ids.has(q[2])) {
      problems.push(`${p}: "${q[2]}" is not a sub-tab of ${q[1]}. Real ids: ${[...ids].join(', ')}. `
        + 'It would silently render the default tab and pass.');
    }
  }
  if (problems.length) {
    console.error('Sub-tab paths that would measure the wrong page:');
    for (const x of problems) console.error(`  ${x}`);
    process.exit(2);
  }
}

const CHROME = findChrome();
if (!CHROME) {
  console.error('No chromium found. Install one, or run: npx playwright install chromium');
  process.exit(2);
}

const PORT = 9333 + (process.pid % 200);
const proc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  '--headless=new',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  `--user-data-dir=${join(process.env.TEMP || '/tmp', `probe-taps-${process.pid}`)}`,
  `--window-size=${WIDTH},${HEIGHT}`,
  'about:blank',
], { stdio: process.env.PROBE_TAPS_DEBUG ? 'inherit' : 'ignore' });

/* PUT to /json/new, retried, and NOTHING ELSE as the readiness check.
 *
 * The first version waited on `GET /json/version` before doing anything, and that call never returned
 * on this machine even while Chrome's own log said "DevTools listening on ws://127.0.0.1:9401". Thirty
 * seconds of a loop failing against a port that was open. `scripts/probe-kitchen.mjs` has worked here
 * for weeks and does it differently: it opens a tab with PUT and retries THAT, so the readiness check
 * and the first useful call are the same request. Copying the shape that works beats debugging the
 * shape that does not, and it removes a handshake that was buying nothing. */
async function openTab(url) {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
      if (r.ok) return r.json();
    } catch { /* not up yet */ }
    await sleep(400);
  }
  throw new Error('chrome never came up');
}

async function closeTab(id) {
  try { await fetch(`http://127.0.0.1:${PORT}/json/close/${id}`); } catch { /* it is going away anyway */ }
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
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate threw');
    return r.result?.result?.value;
  };
  return { ws, ready, send, evaluate };
}

/* One expression, evaluated in the page. Returns JSON so nothing is inferred on this side.
 *
 * `getBoundingClientRect` and not offsetHeight: a control's tap target is what a thumb can hit, which
 * includes padding and any transform, and offsetHeight misses both. Zero-size elements are skipped
 * because a hidden control is not a small one. */
/* One expression, evaluated in the page. Returns JSON so nothing is inferred on this side.
 *
 * WRAPPED IN try/catch INSIDE THE PAGE. `document.body` is null until the document is parsed and the
 * retry loop below is supposed to wait that out, so a throw on the first attempt killed the whole run
 * on 2026-08-28. probe-kitchen.mjs's own comment says to read the document defensively and let the
 * loop wait rather than throwing on a page that is merely still arriving.
 *
 * WHAT COUNTS AS A CONTROL, and this narrowing came from the first full sweep printing FIFTY track
 * names off /music as failures. Those are plain inline links inside a text row: a 19px box is what an
 * `<a>` inside a sentence measures, and `work.css` already argues in prose that such a link cannot be
 * 44px tall without breaking the paragraph's line spacing. The floor is for a control a thumb AIMS at,
 * which in CSS terms is one that has been given a box: display block, flex, inline-flex, grid, or a
 * form element. An inline link takes the line's height and is followed by reading, not by aiming.
 *
 * So the rule reads computed display rather than a class list. A class list would have to name every
 * surface; this distinguishes the two things by what they actually are, and it means a future inline
 * link needs no exception entry while a future BUTTON cannot hide behind one.
 *
 * `getBoundingClientRect` and not offsetHeight: a tap target includes padding and any transform. */
/* NOTHING ESCAPABLE GOES INSIDE THE INJECTED EXPRESSION. The page returns raw textContent and Node
 * formats it, below. That rule cost three runs today, and the third is why it is a rule rather than a
 * fix:
 *
 *   1. The label collapse was written as a backslash-s character class. Inside a template literal JS
 *      resolves that to a bare "s" before Chrome ever sees the string, so the injected code was
 *      /s+/g and every label came back with its letter s replaced by a space. "No study behind this"
 *      printed as "No  tudy behind thi ". The findings were real and unreadable.
 *   2. Rewriting it as an explicit class did not help: backslash-t and backslash-n resolve to a real
 *      tab and a real newline, and a literal newline inside a regex literal is a syntax error, so the
 *      run threw "Invalid regular expression: missing /".
 *   3. The comment EXPLAINING both of those, written inside the template literal, contained the same
 *      sequences and broke the file's own syntax.
 *
 * Same family as the two BACKSPACE bytes baked into a regex on 2026-08-27, which made /friday/i unable
 * to match "Friday" while every gate in this repo passed. An expression built as a string in one
 * language and executed in another has two escape layers and no compiler watching the seam. So:
 * measuring happens in the page, formatting happens in Node, and this comment lives out here. A
 * FOURTH instance landed the same day: an explanatory comment written inside the expression
 * contained a backtick, which terminates the template literal, and the script died with
 * "Cannot read properties of undefined". Prose about the page belongs out here too.
 *
 * ONE RULE INSIDE THE EXPRESSION IS WORTH STATING FROM OUT HERE. A checkbox or radio is allowed to
 * be small when its wrapping `<label>` is not: clicking a label toggles the control it wraps, so the
 * label IS the tap target and the box is a glyph inside it. /swim's pull-buoy checkbox is the live
 * case, a 20px input inside `.training .baseline-check`, which is already 44px deliberately.
 * Enlarging the native box instead would produce a 44px checkbox, which is not a thing anyone has
 * seen. The label has to actually clear the floor: a small checkbox inside a small label is still a
 * finding, so the code checks rather than assumes. */
const MEASURE = `JSON.stringify((function () {
  try {
    if (!document.body) return { height: 0 };
    var doc = document.documentElement;
    var tabs = document.querySelector('.subtabs') || document.querySelector('.surf-nav') || document.querySelector('.kosnav');
    var tabInfo = null;
    if (tabs && tabs.children && tabs.children.length) {
      var kids = Array.prototype.slice.call(tabs.children);
      var tops = {}, right = 0;
      kids.forEach(function (k) {
        var r = k.getBoundingClientRect();
        tops[Math.round(r.top)] = 1;
        right = Math.max(right, Math.round(r.right));
      });
      tabInfo = {
        n: kids.length,
        rows: Object.keys(tops).length,
        rightEdge: right,
        clipped: tabs.scrollWidth > tabs.clientWidth + 1
      };
    }
    var BOXED = { block: 1, flex: 1, 'inline-flex': 1, grid: 1, 'inline-grid': 1, 'inline-block': 1, 'list-item': 1 };
    var FORMS = { INPUT: 1, SELECT: 1, TEXTAREA: 1, BUTTON: 1, SUMMARY: 1 };
    var small = [];
    Array.prototype.slice.call(document.querySelectorAll('a,button,summary,input,select,textarea,[role=button]'))
      .forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        if (r.height >= ${FLOOR}) return;
        var disp = getComputedStyle(el).display;
        if (!FORMS[el.tagName] && !BOXED[disp]) return;
        if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
          var lab = el.closest('label');
          if (lab && lab.getBoundingClientRect().height >= ${FLOOR}) return;
        }
        small.push({
          label: (el.textContent || '').slice(0, 400),
          cls: String(el.className || ''),
          tag: el.tagName.toLowerCase(),
          disp: disp,
          w: Math.round(r.width),
          h: Math.round(r.height * 10) / 10
        });
      });
    return {
      height: document.body.scrollHeight,
      overflow: doc.scrollWidth - window.innerWidth,
      tabs: tabInfo,
      small: small,
      /* PROOF THE PAGE RENDERED, and it is not the height. See the readiness gate below: the height
         floor was 300px against an 844px emulated viewport, so a page that had not painted reported
         exactly 844 and cleared the floor. These two cannot be produced by an unpainted document.
         Every page on this site has a header, a nav and a footer, so the anchor count is never
         zero and the body text is never short on a page that actually arrived. */
      controls: document.querySelectorAll('a,button,summary,input,select,textarea').length,
      chars: (document.body.innerText || '').length,
      /* WHAT THE BROWSER ACTUALLY GOT, so a failure names its own cause. Without these three, every
         non-arrival printed the same "rendered nothing measurable", and the three causes seen on one
         run needed a screenshot each to tell apart: a 404 (title "Silvio Neyra", "Nothing lives at
         this address"), a firewall challenge, and a page that had simply not painted yet. */
      title: document.title || '',
      href: String(location.href),
      head: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 120)
    };
  } catch (e) {
    return { height: 0, err: String(e && e.message || e) };
  }
})())`;

if (process.env.PROBE_TAPS_DEBUG) console.log(`devtools port ${PORT}, chrome ${CHROME}`);

let fail = 0;
/* Tap-floor and geometry findings only, kept apart from non-arrivals so the closing advice can
   follow the kind of failure rather than assuming every red line is a CSS problem. */
let tapFail = 0;
let measured = 0;
const report = [];

for (const path of PATHS) {
  /* THE STATUS CODE, ASKED FOR DIRECTLY, BEFORE THE BROWSER IS INVOLVED. Added 2026-09-04.
   *
   * The readiness gate below used to carry this job and could not do it. It inferred "did this path
   * resolve to a real page" from the SIZE of what rendered, `controls >= 3 && chars >= 200`, and
   * those two numbers were chosen against the app surfaces, which are long. Measured on this build:
   *
   *     /work (the 404)   1 control    103 chars      must fail
   *     /login            5 controls   123 chars      must pass
   *     /callback         2 controls   181 chars      must pass
   *
   * There is no pair of thresholds that separates those three. Adding `/login` to the path list
   * made the gate report "rendered nothing measurable" about a page that had rendered completely,
   * which is a false FAILURE, and the same heuristic tuned any looser starts admitting the 404,
   * which is the false PASS it was written to stop. Its own comment says the floor "could be
   * raised past 844, but that is the instance and not the class" and then picks two more numbers.
   *
   * A 404 is not a small page. It is a 404, and it says so in one byte that no threshold can
   * disagree with. So the two questions are separated: HTTP status answers "is this a route", and
   * the DOM check below answers only "did it paint". Neither is now guessing at the other's job,
   * and no number here is tuned to the length of any particular page.
   *
   * `redirect: 'manual'` on purpose: a path in this list that has become a redirect is a stale
   * list, not a pass, and following it would measure a different page while reporting this one.
   * That is what let `/work` sit here for weeks measuring the 404. */
  let status = null;
  let statusErr = null;
  try {
    const res = await fetch(BASE + path, { redirect: 'manual' });
    status = res.status;
  } catch (e) {
    statusErr = String((e && e.message) || e);
  }
  if (status !== 200) {
    console.log(`FAIL  ${path}  did not answer 200 (${statusErr ? `fetch failed: ${statusErr}` : `HTTP ${status}`})`);
    if (status === 404) console.log('        Not a route. Fix DEFAULT_PATHS, not the CSS.');
    else if (status === 429) console.log('        The Vercel firewall. Probe a local `pnpm start`, not the live domain.');
    else if (status && status >= 300 && status < 400) console.log('        A redirect. This path moved: update DEFAULT_PATHS to where it went.');
    fail++;
    continue;
  }

  const target = await openTab(BASE + path);
  const c = connect(target);
  await c.ready;
  await c.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true,
  });

  /* WAIT FOR CONTENT AND ASSERT IT ARRIVED. probe-kitchen.mjs wrote down what happens otherwise: it
   * slept two seconds, measured /kitchen/shop before it had rendered, and reported "0px tall, fits a
   * 390px screen". A blank page has no overflow and no small controls, so it PASSES every check here.
   * A false pass inside a checker is worse than no checker. */
  /* MEASURE UNTIL IT STOPS CHANGING. Not "wait for the document", and not "wait for fonts.ready".
   *
   * TWO FALSE PASSES CAME OUT OF THIS ONE WAIT, both on the first real runs.
   *
   * First version broke as soon as the document had height, which can be before IBM Plex Mono has
   * loaded. Every chip in a nav is mono and the fallback is narrower: measured at 390px on /reading,
   * the four chips reported a 324px right edge before the font and 374px after, against a 350px
   * content box. So it said "ok, 4 chips to 324px" about a row that is clipped, while the identical
   * row on /reading/about reported the failure correctly, purely because that page is longer and its
   * height gate was met later. One page passed and one failed on the same markup.
   *
   * Second version awaited `document.fonts.ready` and got 324 on BOTH, consistently wrong: that
   * promise resolves before the swapped font has reflowed the layout here.
   *
   * So the wait is not for an event, it is for the answer to stop moving. Read, pause, read again, and
   * accept only when two consecutive reads agree on every number this script reports. That covers the
   * font swap, late hydration, an image settling and whatever comes next, none of which have to be
   * enumerated. Geometry measured in the wrong typeface is not geometry, and a probe that races the
   * page is a probe that reports whichever answer it happened to catch. */
  const key = (x) => JSON.stringify([
    x?.height ?? 0, x?.overflow ?? 0, x?.tabs?.rightEdge ?? 0, x?.tabs?.rows ?? 0, (x?.small || []).length,
    x?.controls ?? 0, x?.chars ?? 0,
  ]);
  /* WHETHER THE PAGE IS THERE AT ALL, and it is a THIRD false pass out of this one wait.
   *
   * The readiness test was `height > 300`, and the emulated viewport is 844px tall. So a document
   * that had not painted reported `document.body.scrollHeight` of exactly 844, cleared the 300 floor,
   * held that value across two reads, was declared stable, and passed every check: a blank page has
   * no overflow, no clipped nav and no small controls. Measured 2026-08-28 on the live domain: a full
   * 31-path run reported "31 of 31, 0 findings" with TWELVE paths at exactly 844px, and /curio,
   * measured on its own moments later, is 9458px. The same twelve pass individually.
   *
   * The floor could be raised past 844, but that is the instance and not the class: the next viewport
   * height would defeat it again, and a real page shorter than the floor would start failing. So the
   * evidence is now something an unpainted document cannot produce.
   *
   * NARROWED ON 2026-09-04 to ask ONLY "did it paint", because the status check above now answers
   * "is this a route". It was `controls >= 3 && chars >= 200`, and those numbers were doing both
   * jobs: the 200-character floor existed to exclude the 404, and it therefore also excluded
   * /login, a complete page with 5 controls and 123 characters on it.
   *
   * One control and forty characters is the floor now. An unpainted document produces zero and
   * zero, which is the only thing this needs to separate: a 404 or a challenge never reaches here.
   * The floor is deliberately far below every real page rather than just below the shortest one,
   * so adding a terser page later does not re-tune it. */
  const arrived = (x) => (x?.controls ?? 0) >= 1 && (x?.chars ?? 0) >= 40;
  let m = null;
  let prev = null;
  let stable = false;
  for (let i = 0; i < 30; i++) {
    m = JSON.parse((await c.evaluate(MEASURE)) || '{}');
    if (arrived(m) && prev && key(m) === key(prev)) { stable = true; break; }
    prev = m;
    await sleep(600);
  }
  if (!stable && arrived(m)) {
    console.log(`      (${path}: geometry never settled across 30 reads, reporting the last one)`);
  }
  c.ws.close();
  await closeTab(target.id);

  if (!arrived(m)) {
    console.log(
      `FAIL  ${path}  rendered nothing measurable (${m?.height ?? 0}px tall, ` +
      `${m?.controls ?? 0} control(s), ${m?.chars ?? 0} char(s) of text)`,
    );
    /* THE THREE CAUSES SEEN ON ONE RUN, and they need telling apart before anyone edits any CSS.
       A 404 is a wrong path in the list below. A challenge is this script tripping the site's OWN
       firewall: rule 4 is 150 non-/_next/ requests a minute per IP and a 33-path run at full speed
       exceeds it, so a LIVE run measures the challenge page and a local run does not. Anything else
       is a page that never painted. */
    console.log(`        title "${m?.title ?? ''}"  at ${m?.href ?? '(no url)'}`);
    console.log(`        text: ${m?.head ?? ''}`);
    if (/nothing lives at this address/i.test(m?.head ?? '')) {
      console.log('        That is the 404. The path is not a route: fix DEFAULT_PATHS, not the CSS.');
    } else if (/challenge|verify|checking your browser/i.test(m?.head ?? '')) {
      console.log('        That is the Vercel firewall. Probe a local `pnpm start`, not the live domain.');
    }
    fail++;
    continue;
  }
  measured++;

  const smalls = (m.small || []).filter((s) => !ALLOW.some((re) => re.test(s.cls)));
  const allowed = (m.small || []).length - smalls.length;

  /* WHAT THE ALLOWLIST IS HIDING, on demand. A broad regex silently swallowing dozens of real
   * findings is the exact failure this whole script exists to prevent, so the exceptions are
   * inspectable rather than a count to be trusted:  PROBE_TAPS_SHOW_ALLOWED=1 */
  if (process.env.PROBE_TAPS_SHOW_ALLOWED && allowed) {
    const byClass = {};
    for (const s of (m.small || []).filter((x) => ALLOW.some((re) => re.test(x.cls)))) {
      const k = `${s.tag}.${s.cls.split(' ').find((c) => ALLOW.some((re) => re.test(c))) || s.cls}`;
      byClass[k] = (byClass[k] || 0) + 1;
    }
    for (const [k, n] of Object.entries(byClass)) console.log(`      allowed x${n}  ${k}`);
  }

  const lines = [];
  if (m.overflow > 1) {
    lines.push(`the page scrolls sideways by ${m.overflow}px`);
  }
  if (m.tabs?.clipped) {
    lines.push(`the ${m.tabs.n} nav chips are clipped: they need more than the ${WIDTH}px screen`);
  } else if (m.tabs && m.tabs.rightEdge > WIDTH - 12) {
    lines.push(`the ${m.tabs.n} nav chips reach ${m.tabs.rightEdge}px of ${WIDTH}, so a further one will not fit`);
  }
  /* The page hands back raw textContent; the collapse happens here, in a normal source file where
     an escape means what it says. See the note in MEASURE for why. */
  const label = (t, tag) => (String(t || '').replace(/\s+/g, ' ').trim().slice(0, 44) || tag);

  for (const s of smalls) {
    lines.push(`${s.h}px tall, under the ${FLOOR}px floor: <${s.tag} display:${s.disp}> "${label(s.label, s.tag)}"  .${s.cls.split(' ')[0] || '(no class)'}`);
  }

  if (lines.length) {
    console.log(`FAIL  ${path}`);
    for (const l of lines) console.log(`        ${l}`);
    fail += lines.length;
    tapFail += lines.length;
    report.push({ path, lines });
  } else {
    const tab = m.tabs ? `, ${m.tabs.n} chips to ${m.tabs.rightEdge}px` : '';
    console.log(`ok    ${path}   ${m.height}px tall${tab}${allowed ? `, ${allowed} declared exception(s)` : ''}`);
  }
}

proc.kill();

console.log('-'.repeat(70));
console.log(`${measured} of ${PATHS.length} path(s) measured at ${WIDTH}x${HEIGHT}, ${fail} finding(s)`);
/* THE CLOSING ADVICE FOLLOWS THE KIND OF FAILURE, and it did not. Every failing run ended with
   "raise the min-height", including the run whose only failure was a path that is a 404, which is
   advice to edit CSS in response to a wrong entry in a list. Wrong instructions under a correct
   finding are how a checker teaches people to ignore it. */
if (tapFail) {
  console.log('A control under the floor is one a thumb misses while holding something else. Raise the');
  console.log('min-height, or add its selector to ALLOW in this file with the reason, which puts the');
  console.log('exception in a diff instead of in somebody\'s judgement.');
}
if (fail > tapFail) {
  console.log('A path that rendered nothing is not a styling problem. Read the title and text printed');
  console.log('under it: a 404 means the path list is wrong, a challenge means this run tripped the');
  console.log('site firewall and belongs against a local `pnpm start`.');
}
process.exit(fail ? 1 : 0);
