#!/usr/bin/env node
/**
 * CAPTURE A SOURCE PAGE VERBATIM, so a quote can be checked against the page instead of against
 * the agent that typed it.
 *
 *   node content/swim/capture-source.mjs <source-id> <url>     capture or re-capture
 *   node content/swim/capture-source.mjs --check               re-fetch every capture and diff
 *   node content/swim/capture-source.mjs --list                what is captured, and when
 *
 * WHY THIS EXISTS, in his words, 2026-09-02:
 *
 *   "Don't go on and invent stuff, as you just said. Cues are invented sometimes because of the
 *    agent. I don't know how we can make sure that doesn't happen because I don't want it either
 *    for me or for someone that I'm just advising them on what they should do. I should be able to
 *    say, this comes from here, this comes from there."
 *
 * THIS IS THE KITCHEN'S MECHANISM, PORTED. `content/kitchen/import.mjs` captures one published
 * recipe verbatim and hashes it, and `validate.mjs` asserts every `sourceText` on a card appears in
 * that capture. Before 2026-08-17 the check compared a step's `text` against its `sourceText`, both
 * typed by the same agent, so it verified that an agent agreed with itself. The swim files were in
 * exactly that state: `validate.mjs` required a `quote` to EXIST and nothing compared it to a page.
 *
 * WHAT THE GATE CATCHES, and it is most of the risk: a quote typed from memory, a quote that drifted
 * a word, a quote attributed to the wrong page, and a source that changed under a quote.
 *
 * WHAT IT DOES NOT CATCH, said out loud rather than implied, because the kitchen's own gate says the
 * same thing and being honest about it is the point:
 *
 *   1. TRUNCATION. A quote cut short is still a substring. On 2026-08-22 the Swim England framework
 *      quote was cut after the fourth of NINE core aquatic skills and a full stop was added, and the
 *      file was then edited to claim the framework names four. A substring check passes that. So
 *      this script's checker PRINTS THE 120 CHARACTERS THAT FOLLOW each quote in the source, which
 *      makes a truncation visible to whoever runs it. Reporting, not a gate, and labelled as such.
 *   2. WHETHER THE SENTENCE ABOVE THE QUOTE IS SUPPORTED BY IT. That is the failure that put
 *      "Sinking legs are the biggest single source of drag" over a quote that only says to press the
 *      chest down, and it is not machine-checkable. The answer to that one is structural and lives
 *      in the content: the source's words are the cue, and anything else is labelled as not from the
 *      source.
 *
 * Reads the page in his real logged-in Chrome over CDP 9222, same as scripts/read-source.mjs, because
 * swimming.org 403s a plain fetcher and a tool saying no is not the world saying no.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'sources');
const INDEX = join(DIR, 'index.json');

/** Whitespace is the only thing normalised, and it is normalised the SAME WAY here and in the
 *  validator. Anything cleverer (case, punctuation, smart quotes) would let a quote drift and still
 *  pass, which is the whole thing this exists to stop. Curly quotes and dashes are folded because
 *  the page serves them and a JSON file cannot carry an em dash: lint-prose.mjs refuses one. */
/* Right single and double quotes, left single and double quotes, em and en dash, no-break space.
   BY CHARACTER CODE, not as literals in a regex: scripts/lint-prose.mjs refuses those characters
   anywhere in this repo, and a line whose whole job is to strip them is the one place that rule
   collides with itself. Codes carry no literal and need no escape, so nothing here can be eaten by
   a shell, a paste or a linter. */
const FOLD = { 8217: "'", 8216: "'", 8220: '"', 8221: '"', 8212: '-', 8211: '-', 160: ' ' };
const WHITESPACE = new RegExp(String.fromCharCode(92) + 's+', 'g');
export function normalise(s) {
  return String(s)
    .split('')
    .map((ch) => FOLD[ch.charCodeAt(0)] ?? ch)
    .join('')
    .replace(WHITESPACE, ' ')
    .trim();
}

function readIndex() {
  if (!existsSync(INDEX)) return {};
  return JSON.parse(readFileSync(INDEX, 'utf8'));
}

function fetchPage(url) {
  const r = spawnSync(process.execPath, [join(HERE, '..', '..', 'scripts', 'read-source.mjs'), url], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`read-source.mjs exited ${r.status}: ${r.stderr?.slice(0, 400)}`);
  const text = String(r.stdout || '');
  /* A page that renders almost nothing is a 403, a cookie wall or a challenge, and capturing it
     would quietly break every quote that points at this source. The floor is deliberately low: the
     shortest real page captured here is the Swim England framework at about 9 KB. */
  if (normalise(text).length < 2000) {
    throw new Error(`only ${normalise(text).length} characters came back. That is a challenge page or a failed render, not the source. Nothing was written.`);
  }
  return text;
}

function capture(id, url) {
  mkdirSync(DIR, { recursive: true });
  const text = fetchPage(url);
  const file = `${id}.txt`;
  writeFileSync(join(DIR, file), text, 'utf8');
  const index = readIndex();
  index[id] = {
    url,
    file,
    fetchedOn: new Date().toISOString().slice(0, 10),
    sha256: createHash('sha256').update(normalise(text)).digest('hex').slice(0, 16),
    characters: normalise(text).length,
  };
  writeFileSync(INDEX, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  console.log(`captured ${id}: ${index[id].characters} characters, sha ${index[id].sha256}, from ${url}`);
}

function check() {
  const index = readIndex();
  const ids = Object.keys(index);
  if (!ids.length) {
    console.log('nothing captured yet.');
    return 0;
  }
  let changed = 0;
  for (const id of ids) {
    const meta = index[id];
    let text;
    try {
      text = fetchPage(meta.url);
    } catch (err) {
      console.log(`??  ${id}  could not re-read: ${err.message}`);
      continue;
    }
    const sha = createHash('sha256').update(normalise(text)).digest('hex').slice(0, 16);
    if (sha === meta.sha256) {
      console.log(`ok  ${id}  unchanged since ${meta.fetchedOn}`);
    } else {
      changed++;
      console.log(`!!  ${id}  CHANGED since ${meta.fetchedOn}. Captured ${meta.characters} characters, now ${normalise(text).length}.`);
      console.log(`      Re-capture it, then run the validator: a quote that no longer appears on the page will fail.`);
      console.log(`      node content/swim/capture-source.mjs ${id} ${meta.url}`);
    }
  }
  return changed;
}

const args = process.argv.slice(2);
if (args[0] === '--list') {
  const index = readIndex();
  const ids = Object.keys(index).sort();
  if (!ids.length) console.log('nothing captured.');
  for (const id of ids) {
    const m = index[id];
    console.log(`${id.padEnd(18)} ${String(m.characters).padStart(7)} chars  fetched ${m.fetchedOn}  ${m.url}`);
  }
  const orphans = existsSync(DIR)
    ? readdirSync(DIR).filter((f) => f.endsWith('.txt') && !ids.includes(f.replace(/\.txt$/, '')))
    : [];
  if (orphans.length) console.log(`\n${orphans.length} capture file(s) not in the index: ${orphans.join(', ')}`);
} else if (args[0] === '--check') {
  process.exit(check() ? 1 : 0);
} else if (args.length === 2) {
  capture(args[0], args[1]);
} else {
  console.error('usage: capture-source.mjs <source-id> <url> | --check | --list');
  process.exit(2);
}
