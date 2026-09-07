/* Price grocery terms in Silvio's logged-in Walmart.ca. One own tab, closed after, his tabs alone.
 * usage: node scripts/walmart-price.mjs "peanut butter" "honey" ...
 * Exists because KitchenOS forbids guessing a price. */
import { request } from 'node:http';

const TERMS = process.argv.slice(2);
const PORT = process.env.CDP_PORT || '9222';
const SETTLE = Number(process.env.SETTLE_MS || 9000);

const cdp = (p) => new Promise((res, rej) => {
  const r = request({ host: '127.0.0.1', port: PORT, path: p, method: p.startsWith('/json/new') ? 'PUT' : 'GET' }, (x) => {
    let d = ''; x.on('data', (c) => { d += c; });
    x.on('end', () => { try { res(JSON.parse(d)); } catch { rej(new Error(d.slice(0, 200))); } });
  });
  r.on('error', () => rej(new Error('no Chrome on ' + PORT))); r.end();
});

const t = await cdp('/json/new?' + encodeURIComponent('about:blank'));
const ws = new globalThis.WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
await new Promise((r) => ws.addEventListener('open', r));
await send('Page.enable');

// Keep the injected expression dumb: pull raw text + href, parse everything here in Node.
const EXPR = [
  'JSON.stringify(Array.from(document.querySelectorAll("div[data-item-id]")).slice(0,5).map(function(c){',
  '  var a = c.querySelector("a[href*=\'/ip/\']");',
  '  return { txt: (c.innerText || ""), url: a ? a.href.split("?")[0] : "" };',
  '}))',
].join('\n');

const priceOf = (s) => { const m = s.match(/\$\s?[\d,]+\.\d{2}/); return m ? m[0].replace(/\s/g, '') : '?'; };
const rateOf = (s) => {
  const m = s.match(/([\d.]+)\s*out of 5 stars\.?\s*(\d+)?/);
  if (!m) return 'no ratings';
  return Number(m[1]).toFixed(2) + '/5' + (m[2] ? ' from ' + m[2] : '');
};
const nameOf = (s, url) => {
  const line = s.split('\n').map((x) => x.trim()).filter(Boolean)
    .find((x) => x.length > 12 && !/bought in past|^Add$|^Options$|out of 5|current price|You save|Delivery|Pickup|Save with|^\$|^Now \$|Best seller|Rollback|Clearance|Reduced price|Sponsored/i.test(x));
  if (line) return line.slice(0, 78);
  return decodeURIComponent((url.split('/ip/')[1] || '').split('/')[0] || '').replace(/-/g, ' ').slice(0, 78);
};

for (const term of TERMS) {
  await send('Page.navigate', { url: 'https://www.walmart.ca/en/search?q=' + encodeURIComponent(term) });
  await new Promise((r) => setTimeout(r, SETTLE));
  const v = (await send('Runtime.evaluate', { expression: EXPR, returnByValue: true })).result.value;
  console.log('\n#### ' + term);
  let rows = [];
  try { rows = JSON.parse(v || '[]'); } catch { console.log('  (could not parse page)'); continue; }
  if (!rows.length) console.log('  (no product cards found)');
  for (const r of rows) {
    if (!r.url || !r.url.includes('/ip/')) continue;
    console.log('  ' + priceOf(r.txt).padEnd(9) + rateOf(r.txt).padEnd(17) + nameOf(r.txt, r.url));
    console.log('     ' + r.url);
  }
}
await send('Page.close'); ws.close(); process.exit(0);
