#!/usr/bin/env node
/**
 * Screenshots a page in a real 390x844 phone viewport, over raw CDP.
 *
 *   node scripts/shoot.mjs http://localhost:3047/gym out.png
 *   node scripts/shoot.mjs http://localhost:3047/gym out.png ".fold:last-of-type"
 *   node scripts/shoot.mjs https://hoodii.studio/gym out.png "" 2400   # tall viewport, whole page
 *
 * WHY THIS EXISTS. Every visual defect found in /gym on 2026-08-27 (a carry reading as 130 reps, a
 * five-year list with no years, an em dash arriving from Postgres) was invisible to typecheck, lint,
 * build, the validator suite and all 25 probe checks. Reading the rendered screen is the only gate
 * that catches them, and the driver for it had been written from scratch and thrown away three times
 * in a single day. A gate nobody can run is not a gate. Same reasoning as run-probe-gym.mjs, which
 * is the sibling of this file and shares its CDP plumbing.
 *
 * SCROLLING, NOT CLIPPING. Page.captureScreenshot's `clip` is in document space, not viewport space,
 * and got the coordinates wrong twice when the page had scrolled. So this scrolls the selector to the
 * top of a real viewport and shoots the viewport. What lands in the PNG is what his phone shows.
 *
 * Requires Chrome listening on 127.0.0.1:9222, and it opens a NEW tab and closes it again. His own
 * tabs are not touched. Set CDP_PORT to override.
 *
 * ON GIT BASH: pass MSYS_NO_PATHCONV=1 or the shell eats the leading slash of a path argument.
 */
import { writeFileSync } from 'node:fs';

const [url, outPath, selector = '', height = 844] = process.argv.slice(2);
if (!url || !outPath) {
  console.error('usage: node scripts/shoot.mjs <url> <out.png> [selector] [viewportHeight]');
  process.exit(2);
}

const PORT = Number(process.env.CDP_PORT || 9222);
const WIDTH = 390;

async function httpJson(path, method = 'GET') {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, { method });
  if (!res.ok) throw new Error(`CDP ${method} ${path} -> ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const version = await httpJson('/json/version').catch(() => null);
if (!version) {
  console.error(`No Chrome on 127.0.0.1:${PORT}. Start one with --remote-debugging-port=${PORT}.`);
  process.exit(1);
}

const tab = await httpJson('/json/new?about:blank', 'PUT');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let nextId = 1;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.text || 'evaluate threw');
  return result.value;
};

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH, height: Number(height), deviceScaleFactor: 2, mobile: true,
  });

  // THEME=light|dark forces prefers-color-scheme. Every surface here is theme-aware and the
  // un-stamped "system" state is the one most viewers get, so a shot in one theme has checked half
  // the page. Chrome inherits the OS setting unless told otherwise.
  const theme = process.env.THEME;
  if (theme) {
    await send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: theme }],
    });
  }

  await send('Page.navigate', { url });
  // Wait for the document to finish and for React to have painted something.
  for (let i = 0; i < 60; i++) {
    const ready = await evaluate(`document.readyState === 'complete' && !!document.querySelector('main, body > div')`)
      .catch(() => false);
    if (ready) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 700));

  if (selector === 'bottom') {
    // No CSS selector reaches "the end of the page", and :last-of-type matches the last SIBLING,
    // which on /gym is a nested details rather than the final panel. This is the honest way to ask.
    const at = await evaluate(`(() => {
      window.scrollTo(0, document.body.scrollHeight);
      return { scrollY: Math.round(window.scrollY), docHeight: Math.round(document.body.scrollHeight) };
    })()`);
    console.log(`scrolled to bottom (y ${at.scrollY} of ${at.docHeight})`);
    await new Promise((r) => setTimeout(r, 250));
  } else if (selector) {
    const found = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'start', behavior: 'instant' });
      window.scrollBy(0, -8);
      return { text: (el.textContent || '').slice(0, 120), top: Math.round(el.getBoundingClientRect().top) };
    })()`);
    if (!found) {
      console.error(`selector not found: ${selector}`);
      process.exitCode = 1;
    } else {
      console.log(`scrolled to ${selector} (top ${found.top}px): ${found.text.replace(/\s+/g, ' ').trim()}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(outPath, Buffer.from(data, 'base64'));
  const title = await evaluate('document.title');
  console.log(`${WIDTH}x${height} shot of ${url} -> ${outPath}  (title: ${title})`);
} finally {
  ws.close();
  await httpJson(`/json/close/${tab.id}`).catch(() => {});
}
