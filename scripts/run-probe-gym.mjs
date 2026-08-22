#!/usr/bin/env node
/**
 * Runs scripts/probe-gym.js in a real Chrome, over raw CDP.
 *
 *   node scripts/run-probe-gym.mjs http://localhost:3024        # everything
 *   node scripts/run-probe-gym.mjs https://hoodii.studio        # against production
 *   node scripts/run-probe-gym.mjs http://localhost:3024 typingASetPostsOnce   # one test
 *
 * WHY THIS EXISTS. The probe is the only test in this repo that presses a button, AGENTS.md
 * requires it after any /gym change, and its documented driver is agent-browser, which hangs on
 * this machine. So for two sessions the mandated gate was either skipped or driven by a throwaway
 * script written from scratch each time and thrown away again as "not repo material". The second of
 * those throwaways opened a background tab, which produced five false failures (see below), and
 * because the driver did not survive the session, neither did the knowledge of how it had been run.
 *
 * A gate nobody can run is not a gate. This is the driver, in the repo, with the two settings that
 * matter already correct.
 *
 * FOCUS IS THE SETTING THAT MATTERS. Chrome dispatches no focus or blur events for a document that
 * lacks system focus. In a background tab `el.focus()` still moves `document.activeElement`, so
 * everything looks right, but no `focusout` is emitted, React's delegated `onBlur` never runs, and
 * every test that types into a set records zero writes. On 2026-08-21 that was written up as "the
 * repo's only interaction test is dark on the write path" and queued as its own session. The app
 * was correct: with `Emulation.setFocusEmulationEnabled` on, all 22 pass on the same build. The
 * probe now refuses to run rather than reporting those failures, and this driver sets the flag.
 *
 * IT WRITES NOTHING. probe-gym.js patches window.fetch before any test runs and answers every POST
 * to a /gym write route locally. There is no development database, so a write that escaped would
 * land in his real training log. This driver adds nothing to that protection and must never be
 * given a way to bypass it.
 *
 * Requires Chrome listening on 127.0.0.1:9222. Exits non-zero if any test fails, so it can gate.
 */
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2];
const ONLY = process.argv[3] || null;
const PORT = Number(process.env.CDP_PORT || 9222);

if (!BASE) {
  console.error('usage: node scripts/run-probe-gym.mjs <base-url> [testName]');
  process.exit(2);
}
const SRC = readFileSync(join(HERE, 'probe-gym.js'), 'utf8');

const httpJson = (path, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: PORT, path, method }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch {
          resolve({ raw: body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });

const version = await httpJson('/json/version').catch(() => null);
if (!version?.Browser) {
  console.error(
    `No Chrome on 127.0.0.1:${PORT}. Start one with --remote-debugging-port=${PORT}, or set CDP_PORT.`,
  );
  process.exit(1);
}

const tab = await httpJson('/json/new?about:blank', 'PUT');
if (!tab.webSocketDebuggerUrl) {
  console.error('could not open a tab:', JSON.stringify(tab).slice(0, 300));
  process.exit(1);
}

const ws = new WebSocket(tab.webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();
const events = [];
const consoleLines = [];

ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(JSON.stringify(m.error)));
    else resolve(m.result);
  } else if (m.method === 'Runtime.consoleAPICalled') {
    consoleLines.push((m.params.args || []).map((a) => a.value ?? a.description).join(' '));
  } else if (m.method) {
    events.push(m);
  }
});

const send = (method, params = {}, timeout = 120_000) =>
  new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`${method} timed out`));
      }
    }, timeout);
  });

const evaluate = async (expression, timeout = 120_000) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeout);
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
};

const waitForLoad = async (ms = 30_000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (events.some((e) => e.method === 'Page.loadEventFired')) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

await new Promise((r) => ws.addEventListener('open', r, { once: true }));

let exitCode = 0;
try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  /* The flag whose absence cost a week. See the header. */
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });

  events.length = 0;
  await send('Page.navigate', { url: `${BASE}/gym` });
  await waitForLoad();
  await new Promise((r) => setTimeout(r, 1200));

  /* START FROM A CLEAN BROWSER, per the probe's own header: swaps and the finished state persist in
     localStorage, and leftovers make three tests fail with "session already saved" and look like
     app defects. */
  await evaluate('localStorage.clear(); 1');
  events.length = 0;
  await send('Page.reload');
  await waitForLoad();
  await new Promise((r) => setTimeout(r, 1500));

  const installed = await evaluate(`${SRC}\n; typeof __probe`);
  if (installed !== 'object') {
    console.error('probe did not install, got:', installed);
    console.error(consoleLines.slice(-10).join('\n'));
    process.exit(1);
  }

  /* Served build vs the tab's, so a stale `next start` from an earlier session cannot answer for
     the code under test. Four of them were found listening on this machine on 2026-08-18 and a
     probe run against one printed nine confident failures about code already replaced. */
  const buildId = await evaluate(
    `(self.__next_f || []).flat().join('').match(/buildId["\\\\:]+([A-Za-z0-9_-]{8,})/)?.[1] ?? null`,
  ).catch(() => null);
  if (buildId) console.log(`build served: ${buildId}`);

  /* THE PAIR NOTHING HAS EVER RUN. `swapSurvivesReload` is two halves with a real page reload
     between them: :before makes a swap and records it in sessionStorage, :after asserts the swap
     came back. `run()` skips both, because after a reload the harness is gone from the page, so the
     only way to run them is to re-eval the file and call the second half by name. No driver had
     ever done that, which is why the swap-resets-on-reload defect he found by training on
     2026-08-14 had a test that was never executed. sessionStorage survives the reload; localStorage
     is cleared before :before and not between the halves. */
  if (ONLY === 'swapSurvivesReload') {
    const before = JSON.parse(await evaluate(`__probe.run('swapSurvivesReload:before')`, 120_000));
    console.log(`:before  ${before.failed.length ? 'FAIL' : 'pass'}  ${JSON.stringify(before.results['swapSurvivesReload:before']?.detail ?? null)}`);
    events.length = 0;
    await send('Page.reload');
    await waitForLoad();
    await new Promise((r) => setTimeout(r, 1800));
    await evaluate(`${SRC}\n; typeof __probe`);
    const after = JSON.parse(await evaluate(`__probe.run('swapSurvivesReload:after')`, 120_000));
    console.log(`:after   ${after.failed.length ? 'FAIL' : 'pass'}  ${JSON.stringify(after.results['swapSurvivesReload:after']?.detail ?? null)}`);
    exitCode = before.failed.length || after.failed.length ? 1 : 0;
    ws.close();
    await httpJson(`/json/close/${tab.id}`).catch(() => {});
    process.exit(exitCode);
  }

  const raw = await evaluate(ONLY ? `__probe.run(${JSON.stringify(ONLY)})` : '__probe.run()', 300_000);
  const result = typeof raw === 'string' ? JSON.parse(raw) : raw;

  if (result.refusedToRun) {
    console.error('PROBE REFUSED TO RUN');
    console.error(result.refusedToRun);
    exitCode = 1;
  } else {
    console.log(`${result.ran} ran, ${result.failed.length} failed`);
    if (result.skippedNeedsReload?.length) {
      console.log(`skipped (need a reload, run them by name): ${result.skippedNeedsReload.join(', ')}`);
    }
    for (const name of result.failed) {
      console.log(`\nFAIL  ${name}`);
      console.log(`      ${JSON.stringify(result.results?.[name]?.detail ?? null)}`);
    }
    console.log(`\nwrites intercepted (none left the browser): ${result.totalWritesIntercepted}`);
    if (result.failed.length) exitCode = 1;
  }
} catch (e) {
  console.error('FAILED:', e.message);
  exitCode = 1;
} finally {
  ws.close();
  await httpJson(`/json/close/${tab.id}`).catch(() => {});
}

process.exit(exitCode);
