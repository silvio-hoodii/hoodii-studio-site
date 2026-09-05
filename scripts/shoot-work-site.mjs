#!/usr/bin/env node
/* THE PICTURES OF THE SITE THAT /work/site SHOWS.
 *
 *   pnpm start -p 3007
 *   node scripts/shoot-work-site.mjs http://localhost:3007
 *
 * G1 of the 2026-09-04 audit: "The front door shows state and never shows the software." The hub is
 * eight rows of live sentences, which is the right design and is also the reason a stranger has no
 * idea the cook screen exists, or what the gym card looks like mid-set. There is no picture of this
 * site anywhere on this site.
 *
 * WHY THE FILES ARE COMMITTED RATHER THAN GENERATED AT BUILD, which is the opposite of what every
 * other generated thing here does. Taking a screenshot needs a running server and a real browser,
 * and a Vercel build container has neither. The options were a committed PNG or no picture, and
 * AGENTS.md's rule about the hub illustrations ("no image files to go stale") is a rule about
 * DRAWINGS, which have no external truth to drift from. A screenshot's whole value is that it is
 * what the page actually looked like.
 *
 * SO STALENESS IS LABELLED RATHER THAN PREVENTED. Every shot records the commit it was taken at and
 * the date, into shots.json, and /work/site prints that next to the image. Past 30 days the page
 * says so in place, the same way HealthOS/CURRENT.md flags itself STALE rather than quietly
 * printing an old weight. A picture with a date on it is honest; a picture without one is a claim
 * about today.
 *
 * The shots are taken in LIGHT mode at 390px, deliberately: the phone is the product, and one theme
 * keeps the page from becoming a gallery of the same screen twice.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const BASE = process.argv[2];
if (!BASE) {
  console.error('usage: node scripts/shoot-work-site.mjs <base-url>   (a local `pnpm start`, not the live domain)');
  process.exit(2);
}
const CDP = process.env.CDP_PORT || 9222;
const WIDTH = 390;

/* WHAT TO SHOW, and each is here because it answers a question the four case studies cannot.
 *
 * `selector` scrolls that element to the top of the viewport before the shot, so the frame is the
 * part worth seeing rather than whatever the top of the page happens to be. `height` lets a shot be
 * taller than a phone screen where the thing being shown is a list. */
const SHOTS = [
  {
    id: 'cook',
    path: '/kitchen/honeygarlicchicken',
    label: 'The prep list on a cook screen',
    caption:
      'Every quantity appears in the one published recipe this card was built from, and the build refuses a number that does not. The red line is the app admitting the fridge is short.',
    /* FRAMED ON THE AMOUNTS, and this was got wrong twice. Unframed, the top of a dish page is the
       source card and a long note from the last cook, so the picture was a wall of prose under a
       caption about quantities. A caption that does not describe its own picture is worse than no
       picture. */
    selector: '.amounts',
    height: 1150,
  },
  {
    id: 'kitchen',
    path: '/kitchen',
    label: 'What the fridge can make tonight',
    caption:
      'Scored against a stock list read from a photo. The stale rows say how old the reading is rather than hiding it.',
    height: 900,
  },
  {
    id: 'gym',
    path: '/gym',
    label: 'The lifting card',
    caption:
      'Filled in between sets, one hand, at the rack. The weight suggestion comes from the last session whose numbers were actually typed.',
    /* The first input on the page is the first working set. Without this the frame is the warmup
       list at the top of /gym, which is not what the caption describes: a picture that does not
       show what its caption claims is worse than no picture. */
    selector: 'input',
    height: 1000,
  },
  {
    id: 'volume',
    path: '/health?s=volume',
    label: 'How the week adds up',
    caption:
      'The same arithmetic the build gate runs, rendered. He asked this question three times and got a document three times.',
    height: 900,
  },
];

/* ---- CDP plumbing, the same shape as scripts/shoot.mjs ---------------------------------------- */

async function rpc(ws, id, method, params = {}) {
  return new Promise((resolve) => {
    const onMessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id === id) {
        ws.removeEventListener('message', onMessage);
        resolve(m.result);
      }
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const version = await fetch(`http://127.0.0.1:${CDP}/json/version`).catch(() => null);
if (!version) {
  console.error(`No Chrome on 127.0.0.1:${CDP}. Start one with --remote-debugging-port=${CDP}.`);
  process.exit(1);
}

const OUT_DIR = join(process.cwd(), 'public', 'work');
mkdirSync(OUT_DIR, { recursive: true });

const commit = execSync('git rev-parse --short HEAD').toString().trim();
const takenAt = new Date().toISOString().slice(0, 10);

const manifest = [];
for (const shot of SHOTS) {
  const target = await (
    await fetch(`http://127.0.0.1:${CDP}/json/new?${BASE}${shot.path}`, { method: 'PUT' })
  ).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const send = (m, p) => rpc(ws, ++id, m, p);

  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: shot.height,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'light' }],
  });
  await send('Page.enable');
  await send('Page.navigate', { url: BASE + shot.path });

  /* Wait for the geometry to stop moving rather than for an event, for the reason probe-taps.mjs
     records at length: document.fonts.ready resolves before the swapped font has reflowed, and a
     screenshot taken in the fallback typeface is a screenshot of a layout that never ships. */
  let prev = null;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const res = await send('Runtime.evaluate', {
      /* THE SKELETON COUNTS AS NOT-READY, and it has to be asked about explicitly. A loading.tsx
         frame is stable: its height and its control count do not change while the data loads, so
         "wait until two reads agree" agrees on the placeholder and shoots it. That is exactly what
         happened here, and public/work/kitchen.webp shipped as a picture of grey bars until the
         file size gave it away. Geometry settling is not the same thing as content arriving. */
      expression:
        'JSON.stringify([document.body.scrollHeight, document.querySelectorAll("a,button").length, document.querySelectorAll(".skel").length])',
      returnByValue: true,
    });
    const now = res?.result?.value;
    if (now && now.endsWith(',0]') && now === prev) break;
    prev = now;
  }

  if (shot.selector) {
    await send('Runtime.evaluate', {
      expression: `(() => { const el = document.querySelector(${JSON.stringify(shot.selector)}); if (el) el.scrollIntoView({ block: 'start' }); return true; })()`,
      returnByValue: true,
    });
    await new Promise((r) => setTimeout(r, 400));
  }

  /* WEBP, NOT PNG, and it is not a detail. Four screenshots of a text-heavy UI at deviceScaleFactor
     2 came to 860 KB as PNG, which is the same weight the audit criticised /kitchen for (838 KB of
     thumbnails). A page whose subject is engineering care should not be the heaviest page on the
     site. WebP at quality 88 is visually identical on this content, which is flat colour and type,
     and lands about a fifth of the size. Support is universal in any browser that can render the
     rest of this site. */
  const cap = await send('Page.captureScreenshot', { format: 'webp', quality: 88 });
  if (!cap?.data) {
    console.error(`FAIL  ${shot.id}: no image came back`);
    process.exit(1);
  }
  const file = `${shot.id}.webp`;
  writeFileSync(join(OUT_DIR, file), Buffer.from(cap.data, 'base64'));
  ws.close();
  await fetch(`http://127.0.0.1:${CDP}/json/close/${target.id}`);

  manifest.push({
    id: shot.id,
    src: `/work/${file}`,
    path: shot.path,
    label: shot.label,
    caption: shot.caption,
    width: WIDTH,
    height: shot.height,
    takenAt,
    commit,
  });
  console.log(`  ${shot.id.padEnd(8)} ${shot.path}  ->  public/work/${file}`);
}

const manifestPath = join(process.cwd(), 'content', 'work', 'shots.json');
mkdirSync(join(process.cwd(), 'content', 'work'), { recursive: true });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('-'.repeat(70));
console.log(`${manifest.length} shot(s) at ${commit}, ${takenAt}. Manifest: content/work/shots.json`);
console.log('LOOK AT THEM before committing. A screenshot nobody opened is the same mistake as a');
console.log('rendered page nobody read, and this repo has made that one more than once.');
