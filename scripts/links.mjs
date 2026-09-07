/* Open a page in Silvio's logged-in Chrome and print anchor hrefs + text.
 * usage: node links.mjs <url> [href-regex]
 * Read-only: own tab, closed at the end, other tabs untouched. */
import { request } from 'node:http';
const [URL_, PAT] = process.argv.slice(2);
const PORT = process.env.CDP_PORT || '9222';
const SETTLE = Number(process.env.SETTLE_MS || 7000);
const cdp = (p) => new Promise((res, rej) => {
  const r = request({ host: '127.0.0.1', port: PORT, path: p, method: p.startsWith('/json/new') ? 'PUT' : 'GET' }, (x) => {
    let d = ''; x.on('data', c => d += c); x.on('end', () => { try { res(JSON.parse(d)); } catch { rej(new Error(d.slice(0, 200))); } });
  });
  r.on('error', () => rej(new Error('no Chrome on ' + PORT))); r.end();
});
const t = await cdp('/json/new?' + encodeURIComponent('about:blank'));
const ws = new globalThis.WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
await new Promise(r => ws.addEventListener('open', r));
await send('Page.enable');
await send('Page.navigate', { url: URL_ });
await new Promise(r => setTimeout(r, SETTLE));
const out = (await send('Runtime.evaluate', {
  expression: `JSON.stringify([...document.querySelectorAll('a[href]')].map(a=>[a.href,(a.innerText||'').replace(/\s+/g,' ').trim().slice(0,110)]))`,
  returnByValue: true,
})).result.value;
let rows = JSON.parse(out || '[]');
if (PAT) { const re = new RegExp(PAT, 'i'); rows = rows.filter(([h]) => re.test(h)); }
const seen = new Set();
for (const [h, txt] of rows) { if (seen.has(h)) continue; seen.add(h); console.log(h + '  ||  ' + txt); }
console.log('\n(' + seen.size + ' unique links)');
await send('Page.close'); ws.close(); process.exit(0);
