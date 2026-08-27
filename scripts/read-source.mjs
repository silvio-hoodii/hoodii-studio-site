#!/usr/bin/env node
/**
 * Read a published page in the real browser, for verifying a citation.
 *
 *   node scripts/read-source.mjs <url>                 print the rendered text
 *   node scripts/read-source.mjs <url> "<regex>"       print only the lines that match
 *
 * WHY THIS EXISTS. On 2026-08-22 a cue in content/swim/teaching.json was downgraded from "sourced" to
 * "convention" and the file was made to say that swimming.org "returns HTTP 403 to any fetch, so no
 * sentence from it can be quoted or checked by anyone reading this."
 *
 * That was wrong. It returns 403 to a plain fetcher. It loads perfectly in a real browser, and
 * Silvio said so immediately: "well you can use th cdp to chekc the claims that don return on you
 * regular tools." He is right, and it is the same lesson as "just install something" from
 * 2026-08-21: a tool saying no is not the world saying no.
 *
 * The correction cost more than the cue. Reading the page revealed that the file's own note about
 * it was wrong too: it claimed the Swim England framework teaches NINE core aquatic skills and
 * listed nine. The page names four. Nobody had ever opened it, because the fetcher 403'd and the
 * detail got written from memory instead. That is exactly the failure the citation was supposed to
 * prevent, sitting inside the citation.
 *
 * So: before writing "this source cannot be checked", check it here. Before trusting a note ABOUT a
 * source, read the source.
 *
 * Requires Chrome on 127.0.0.1:9222 (same as scripts/run-probe-gym.mjs):
 *   chrome --remote-debugging-port=9222 --user-data-dir=<a scratch dir>
 *
 * Read-only. Opens its own tab, reads, closes it, and leaves every other tab alone.
 */
import { request } from 'node:http';

const [URL_, GREP] = process.argv.slice(2);
if (!URL_) {
  console.error('usage: node scripts/read-source.mjs <url> [regex]');
  process.exit(2);
}

const CDP_PORT = process.env.CDP_PORT || '9222';
const SETTLE_MS = Number(process.env.SETTLE_MS || 6000);

function cdp(path) {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port: CDP_PORT, path, method: path.startsWith('/json/new') ? 'PUT' : 'GET' },
      (r) => {
        let d = '';
        r.on('data', (c) => { d += c; });
        r.on('end', () => {
          try { resolve(JSON.parse(d)); } catch { reject(new Error(d.slice(0, 120))); }
        });
      },
    );
    req.on('error', () => reject(new Error(
      `No Chrome on 127.0.0.1:${CDP_PORT}. Start one with --remote-debugging-port=${CDP_PORT}, or set CDP_PORT.`,
    )));
    req.end();
  });
}

let target;
try {
  target = await cdp('/json/new?' + encodeURIComponent('about:blank'));
} catch (e) {
  console.error(String(e.message));
  process.exit(2);
}

const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res) => {
  const i = ++id;
  pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
});
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
});
await new Promise((r) => ws.addEventListener('open', r));

await send('Page.enable');
await send('Page.navigate', { url: URL_ });
await new Promise((r) => setTimeout(r, SETTLE_MS));

const title = (await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })).result.value;
const body = String(
  (await send('Runtime.evaluate', {
    expression: "document.body.innerText.replace(/\\n{3,}/g,'\\n\\n')",
    returnByValue: true,
  })).result.value || '',
);

console.log(`TITLE:  ${title}`);
console.log(`URL:    ${URL_}`);
console.log(`LENGTH: ${body.length} characters of rendered text\n`);

if (GREP) {
  const re = new RegExp(GREP, 'i');
  const hits = body.split('\n').map((l) => l.trim()).filter((l) => l && re.test(l));
  console.log(`--- ${hits.length} line(s) matching /${GREP}/i ---`);
  for (const l of hits) console.log(l);
  if (!hits.length) console.log('(nothing matched: the wording may differ, print the whole page and look)');
} else {
  console.log(body);
}

await send('Page.close');
ws.close();
process.exit(0);
