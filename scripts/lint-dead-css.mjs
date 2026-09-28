#!/usr/bin/env node
/* Refuse to build when a stylesheet carries a class that nothing renders.
 *
 * On 2026-09-27 five audits found about a thousand lines of dead CSS: 58% of reading.css and 24% of
 * kitchen.css styled pages deleted days earlier, and training.css carried 28 rules for markup that
 * had been rewritten. Every one of those had been "cleaned up" by a session that deleted the page
 * and left its paint behind, because nothing executed the rule that a deleted surface takes its
 * CSS with it. This does. HOODII/.agents/ENGINEERING.md: a rule that does not execute is decoration.
 *
 * WHAT COUNTS AS USED. A class is used if its name appears as a whole word anywhere in src/**.tsx,
 * src/**.ts, src/**.mts, or in content/**.json (some classes come from data: a rating, a flavour).
 * A class also counts as used when a template literal in src builds it from a prefix, written as
 * `prefix-${...}` in the JSX: `rating-${c.rating}` covers every `.rating-*` rule. Everything else
 * with zero matches fails the build, listed by file.
 *
 * WHAT IT CANNOT SEE, stated plainly: a class assembled by concatenation without a `-${` seam, and
 * a class only a third-party script adds. Both belong in ALLOW with the reason beside them.
 *
 * `--selftest` plants a dead rule in a temp copy and asserts it is refused. */
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = process.cwd();

/* Class names with a reason to exist that no grep can prove. Keep this list short and honest. */
const ALLOW = new Map([
  ['dark', 'the Tailwind dark variant name, declared for the media query in globals.css'],
]);

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(p, exts, out);
    } else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

/* Every `.class` token in a stylesheet's selectors (comments and declaration blocks stripped). */
function classesIn(css) {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectorsOnly = noComments.replace(/\{[^{}]*\}/g, '{}');
  const found = new Set();
  for (const m of selectorsOnly.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
    /* Numbers with a dot in them are not classes: `0.5` inside a calc that survived stripping. */
    found.add(m[1]);
  }
  return found;
}

function run(root) {
  const cssFiles = walk(join(root, 'src'), ['.css']);
  const codeFiles = walk(join(root, 'src'), ['.tsx', '.ts', '.mts']).concat(
    statSync(join(root, 'content'), { throwIfNoEntry: false }) ? walk(join(root, 'content'), ['.json']) : [],
  );
  const code = codeFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
  /* Prefixes built by template: `rating-${` means every `rating-*` class is reachable. */
  const prefixes = new Set([...code.matchAll(/([\w-]+)-\$\{/g)].map((m) => m[1]));
  const words = new Set(code.match(/[\w-]+/g) ?? []);

  const dead = [];
  for (const f of cssFiles) {
    const rel = relative(root, f).replace(/\\/g, '/');
    for (const cls of classesIn(readFileSync(f, 'utf8'))) {
      if (ALLOW.has(cls)) continue;
      if (words.has(cls)) continue;
      if ([...prefixes].some((p) => cls.startsWith(`${p}-`))) continue;
      dead.push({ file: rel, cls });
    }
  }
  return { dead, cssFiles: cssFiles.length, codeFiles: codeFiles.length };
}

if (process.argv.includes('--selftest')) {
  const tmp = mkdtempSync(join(tmpdir(), 'dead-css-'));
  try {
    writeFileSync(join(tmp, 'a.tsx'), 'export const x = <div className="kept other-thing">{`rating-${r}`}</div>;');
    writeFileSync(join(tmp, 'a.css'), '.kept { color: red; } .rating-wrong { color: red; } .gone { color: red; }\n/* .commented { } */');
    // walk() reads root/src, so mirror the layout.
    const fake = join(tmp, 'proj');
    rmSync(fake, { recursive: true, force: true });
    const { mkdirSync, renameSync } = await import('node:fs');
    mkdirSync(join(fake, 'src'), { recursive: true });
    renameSync(join(tmp, 'a.tsx'), join(fake, 'src', 'a.tsx'));
    renameSync(join(tmp, 'a.css'), join(fake, 'src', 'a.css'));
    const { dead } = run(fake);
    const names = dead.map((d) => d.cls).sort();
    if (names.join(',') !== 'gone') {
      console.error(`selftest FAILED: expected only "gone" to be dead, got [${names.join(', ')}]`);
      process.exit(1);
    }
    console.log('selftest ok: a planted dead rule is refused, a kept one, a template-built one and a commented one pass');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const { dead, cssFiles, codeFiles } = run(ROOT);
if (dead.length) {
  const byFile = new Map();
  for (const d of dead) byFile.set(d.file, [...(byFile.get(d.file) ?? []), d.cls]);
  for (const [file, classes] of byFile) {
    console.error(`FAIL  ${file}: ${classes.length} class(es) nothing renders: ${classes.join(' ')}`);
  }
  console.error(`\n${dead.length} dead class(es) across ${byFile.size} stylesheet(s). Delete the rule, or add the class to ALLOW in scripts/lint-dead-css.mjs with the reason.`);
  process.exit(1);
}
console.log(`${cssFiles} stylesheet(s) checked against ${codeFiles} source file(s), no class without a use`);
