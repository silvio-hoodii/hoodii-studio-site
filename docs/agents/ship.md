---
moved: 2026-10-18, verbatim from AGENTS.md, which now points here. Not re-audited beyond the dead paths fixed that day.
---

# Commits and deploy: the full record

## Commits and deploy

- Production deploys from `main`.
- **After pushing, DO NOT sit in a `curl` + `sleep` loop. Run `node scripts/wait-deploy.mjs` in the
  background and carry on working.**

  ```
  MSYS_NO_PATHCONV=1 node scripts/wait-deploy.mjs --url /health/day --expect "under 5,000 steps"
  ```

  with the Bash tool's `run_in_background: true`. It prints one line and exits 0 or 1. **Keep the
  `MSYS_NO_PATHCONV=1`**: Git Bash rewrites `/health/day` into `C:/Program Files/Git/health/day`,
  and the script refuses rather than fetching a URL that cannot resolve, because the same mangling
  in `probe-taps.mjs` measured the wrong URL and reported OK. Pass a full `https://` URL when it
  carries a query string (`"https://hoodii.studio/health?s=now"`).

  Two reasons it exists, and the second is the one that made it a script rather than a note. **A
  hand-typed poll blocks the session for the length of the build**, so the agent does nothing while
  Vercel works and Silvio watches it do nothing: *"you are stuck waiting on production why [not] fix
  it for any future session"* (2026-09-09). And **a poll on status text answers the wrong question**:
  the PREVIOUS build serves 200 the entire time yours is building, so a loop that stops at the first
  200 can go green on the deploy you are replacing. This asks the Vercel API whether the deployment
  carrying YOUR `meta.githubCommitSha` is `READY`, and only then fetches the URL and looks for a
  string your change produces, tag-stripped so a phrase wrapping a `<span>` still matches.

  It uses the CLI's own login, so no token. It sets `MSYS_NO_PATHCONV=1` on the child itself rather
  than telling you to remember it.
- Verification gate: **`pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm build`.**
  All four, before any push. Or `node scripts/verify.mjs`, which runs all of them plus the two
  validator regression suites and the two gym gates, and prints ONE green-or-red line.
- **THE AUTH COMPARISON IS WRITTEN ONCE, in `src/lib/auth.ts`, and it is fail-closed.** Added
  2026-08-28 after the security audit read `src/proxy.ts`: it compared the cookie with `===` against
  `process.env.KITCHEN_SESSION_SECRET`, so an unset env var made every anonymous request evaluate
  `undefined === undefined` and opened the entire write surface on a repo whose route list is public.
  Every DB module throws on a missing connection string; the one gate that must not fail open was the
  only one that did. `cookieAuthorises` is edge-safe for the proxy, `isAuthed()` in
  `src/lib/auth-server.ts` is the server-component half, and **`scripts/lint-auth.mjs` fails the build
  on a second copy of either.** Its first live run found a THIRD copy the audit had missed, in
  `src/app/french/page.tsx` (since removed with the hoodii.studio `/french` page, 2026-09-27), where an unset secret showed every anonymous visitor the edit controls.
  The cookie is SET in one place, `src/lib/login-server.ts`; `/kitchen/api/unlock` (the inline
  unlock) calls `signInWithPassword` there since 2026-09-27 rather than carrying its own copy, so
  only the two lib files are in that linter's allowlist.
- **NO CLASS WITHOUT A USE. `scripts/lint-dead-css.mjs`, in `pnpm gates` and so in `pnpm build`,
  with a `--selftest`.** Added 2026-09-27 after five audits found about a thousand lines of CSS for
  deleted pages: 58% of reading.css, 24% of kitchen.css, 28 rules in training.css. Every session
  that deleted a page had left its paint behind, because nothing executed the rule. A class counts
  as used if it appears as a word in src or content, or a template builds it from a prefix
  (`rating-${...}`). Anything else fails the build by name. `ALLOW` in the script is the only
  exception list and carries the reason beside each entry.
- **NO COLOUR LITERAL OUTSIDE `globals.css`.** `scripts/lint-tokens.mjs`, in `pnpm build`, with a
  `--selftest` of 26 cases that runs first on every invocation. The codebase was already clean when
  the audit swept it, which was the finding: the state was held by vigilance alone, and the French page's stylesheet (deleted with /french on 2026-09-27) in its
  own header recorded that this surface arrived carrying its own blue and green palette. The exceptions
  are marked in place with `lint-tokens-allow`, not listed by path: an ImageResponse cannot read a CSS
  variable, and a `themeColor` viewport export is read by the browser chrome.
- **`scripts/lint-prose.mjs` also refuses invisible characters**, added 2026-08-27: every C0 control
  character except tab, DEL, and no-break/zero-width space. Two BACKSPACE bytes baked into a regex
  by a bad escape made `/friday/i` unable to match "Friday", and every gate in this repo passed with
  them in place. Its first live finding was real and legitimate (the kitchen validator's own nbsp
  stripper, now written as `\u00a0`).
- **A pre-push hook now runs `node scripts/guard-live-session.mjs` and then `node scripts/verify.mjs`,
  and refuses a red tree.** The first asks `gym_session` for a row with no `finished_at`: "he trains
  off this app, do not deploy while he is mid-session" was the first warning in the 2026-08-27
  handoff and was pure prose, because `verify.mjs` is offline by design and nothing executed it. It
  exits 0 and says so on a machine with no database URL. `GYM_GUARD_OFF=1` overrides an abandoned
  session. Both live in `.githooks/pre-push`,
  wired with `git config core.hooksPath .githooks`. 49 seconds: install, typecheck, lint, build, one
  GREEN or RED line whose exit code agrees with it. `verify.mjs` had existed for this since
  2026-08-17 and its own header called itself "the thing a person or an agent types before pushing";
  nothing made anyone type it. On 2026-08-22 two Claude sessions were pushing to main in the same
  hour, one pushed a recipe containing an en dash, lint-prose refused it and the deploy failed.
  Silvio noticed before either session did. **If two sessions are working here, `git pull --rebase
  origin main` before you push**: the hook checks the tree you are pushing, so a failure may be
  someone else's file that you have not pulled yet.
- **The lockfile check is not optional and `pnpm build` cannot substitute for it.** On 2026-08-09 a
  dep was removed by editing `package.json` directly instead of running `pnpm remove`. Every local
  command passed, because `node_modules` was already correct and install never re-ran. Vercel
  installs with `--frozen-lockfile`, refused the mismatch, and the deploy died in 5 seconds without
  ever reaching the build. Change a dependency only through `pnpm add` / `pnpm remove`.
- Lint catches `react-hooks/rules-of-hooks` on plain functions named `use*`. Rename them rather than
  disabling the rule.
- Dev server: `pnpm dev` (port 3001). **Test on `localhost`, not `127.0.0.1`**. The dev server
  blocks cross-origin dev resources from the bare IP and the page silently will not hydrate.
- **Do not run `pnpm build` while `pnpm dev` is up.** They share `.next`, and the build leaves the
  dev server serving a stale CSS chunk under the SAME hashed filename. It cost two false readings on
  2026-08-15: a change measured as "no effect" when the stylesheet was correct all along. Stop dev,
  build, restart. Anything that has to be certain should be measured against `pnpm start`, which
  serves what actually deploys.
- Renaming a root convention file leaves a stale Turbopack cache. `rm -rf .next/dev` and restart.

