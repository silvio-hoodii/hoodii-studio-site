---
audit: security
repo: hoodii-studio-site (silvio-hoodii/hoodii-studio-site, PUBLIC on GitHub)
date: 2026-08-26
auditor: security agent (read-only, static analysis)
scope: entire repo, every route including /swim API (static only)
commit: f9467d9
method: read every route handler, server action, SQL module, config; git history secret sweep over all 235 commits; pnpm audit --prod
---

# Security audit: hoodii.studio

This is a personal single-user site. The whole security model is one sentence: every PAGE is
public, every WRITE is gated by one httpOnly cookie (`kos`) checked in `src/proxy.ts`. There is no
auth SaaS by decision, and four Vercel firewall rules live OUTSIDE this repo (documented in
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\AGENTS.md`) and were not re-verified here; where a
finding depends on them it says so.

The dominant finding is good news: the write-gate inventory is complete, injection is structurally
absent (every Neon query is a tagged template), and the git history is clean of secrets. The real
issues are two hardening gaps in the auth gate and a stale Next.js version with published advisories.

## Severity counts

| Severity | Count | What |
|---|---|---|
| P0 (exploitable now) | 0 | No ungated write, no injection, no committed secret, no open SSRF |
| P1 (weak control) | 2 | Proxy fails OPEN if `KITCHEN_SESSION_SECRET` is unset; Next.js 16.2.6 has a published App Router proxy-bypass advisory |
| P2 (hardening debt) | 5 | `===` secret comparison, no rate-limit on login POST, uncapped request bodies on some writes, no security headers / clickjacking defence on login forms, `sameSite: lax` rather than `strict` |
| P3 (hygiene) | 2 | Transitive dev-dependency advisories; `/gym`, `/health`, `/french` login pages set no `noindex` metadata |

---

## The gated-write inventory (full, verified)

Every route that mutates state, or is a POST at all, against the two mechanisms that must both cover
it: the path-prefix check in `src/proxy.ts` (lines 72-80) and `config.matcher` (lines 96-106). A
write is protected only if BOTH name its prefix. The `/swim` matcher omission that AGENTS.md warns
about is CLOSED: both the prefix list (line 74) and the matcher (line 104) now carry `/swim/api`.

| Route | Method | Mutates | In prefix check? | In config.matcher? | Gated? |
|---|---|---|---|---|---|
| `/kitchen/api/note` | POST | `cook_log` insert | yes (`/kitchen/api`) | yes (`/kitchen/:path*`) | GATED |
| `/kitchen/api/finish` | POST | `cook_log`, stock events, protein | yes | yes | GATED |
| `/kitchen/api/shop` | POST | shopping list events | yes | yes | GATED |
| `/kitchen/api/veto` | POST | veto events | yes | yes | GATED |
| `/kitchen/api/unlock` | POST | sets `kos` cookie | EXEMPT by design (line 49) | yes | public by necessity (see P2 rate-limit) |
| `/gym/api/set` | POST | `gym_set` upsert | yes (`/gym/api`) | yes (`/gym/:path*`) | GATED |
| `/gym/api/note` | POST | `gym_note` insert | yes | yes | GATED |
| `/gym/api/finish` | POST | `gym_session` update | yes | yes | GATED |
| `/gym/api/plan` | POST | READ only (line 62 exempts) | exempt, read | yes | open read, no mutation |
| `/gym/api/session` | POST | READ only (line 62 exempts) | exempt, read | yes | open read, no mutation |
| `/gym/api/next` | POST | READ only (compute) | NOT exempted, so gated as a write | yes | GATED (harmless; it only computes) |
| `/french/api/review` | POST | `reviewCard` update | yes (`/french/api`) | yes (`/french/:path*`) | GATED |
| `/french/api/cards` | POST | `addCards` insert | yes | yes | GATED |
| `/french/api/chapter` | POST | `logChapter` insert | yes | yes | GATED |
| `/french/api/exam` | POST | `setExamDate` update | yes | yes | GATED |
| `/french/api/queue` | GET | read | n/a | yes | read |
| `/french/api/activity` | GET | read | n/a | yes | read |
| `/french/api/summary` | GET | read | n/a | yes | read |
| `/reading/api/want` | POST | `reading_want` add/remove | yes (`/reading/api`) | yes (`/reading/api/:path*`) | GATED |
| `/swim/api/baseline` | POST | `gym_swim_baseline` insert | yes (`/swim/api`) | yes (`/swim/api/:path*`) | GATED. Coordinate with swim agent for any change |
| `/api/music/sync` | GET (side effect) | writes `music_play`, `music_top` | NOT in matcher | NOT in matcher | gated by `CRON_SECRET` bearer, not by cookie (see below) |
| `/api/spotify` | GET | none | n/a | n/a | read-through fetcher |
| `/api/psn` | GET | none | n/a | n/a | read-through fetcher |
| `/api/psn-image` | GET | none (proxy) | n/a | n/a | host-allowlisted (see below) |
| `checkPaste` (server action, `src/app/kitchen/want/actions.ts`) | POST | READ only (scores a paste) | n/a (server action, not matcher-gated) | n/a | no mutation; returns strings only |
| `signIn` (server actions in 4 login pages) | POST | sets `kos` cookie | n/a | n/a | public by necessity |

Server-action sweep (`grep "use server"`): `src/app/kitchen/want/actions.ts` (read-only) plus the
four login-page `signIn` actions. No mutating server action exists outside the login flow. Every
state-changing HTTP route is inside a gated prefix that the matcher also names. **No ungated write
found.**

---

## P1 findings

### P1-1. The proxy auth check fails OPEN when `KITCHEN_SESSION_SECRET` is unset

`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\proxy.ts`, line 44:

```ts
const authed = req.cookies.get('kos')?.value === process.env.KITCHEN_SESSION_SECRET;
```

If the `KITCHEN_SESSION_SECRET` env var is missing, `process.env.KITCHEN_SESSION_SECRET` is
`undefined`. A request that sends NO `kos` cookie yields `req.cookies.get('kos')?.value` ===
`undefined`, so the expression is `undefined === undefined` === `true`. **Every gated write route
then treats an anonymous, cookie-less request as authenticated.** This is the exact fail-open the
prompt asked to hunt, and it violates law 1 (the class "missing secret = open door" is
representable, not eliminated).

Impact: if that one env var is ever unset or typo'd on a deploy, the entire write surface (stock,
cook log, training log, French cards, want list, swim baseline) opens to the public internet on a
repo whose write routes are public knowledge. The DB modules (`src/lib/kitchen/db.ts` line 4,
`src/lib/gym/db.ts` line 13, `src/lib/swim/db.ts` line 21) all `throw` on a missing connection
string, so they fail closed; the proxy does not, and it is the one gate that must not.

Note the login/unlock routes do NOT share this bug: `src/app/kitchen/api/unlock/route.ts` lines
29-31 explicitly `return 500` when `expected` or `secret` is falsy, and the `signIn` server actions
guard with `if (pw && pw === ...)` so an empty/undefined password cannot match. Only the proxy gate
itself is exposed.

Executor fix: guard the secret before comparing, so an unset secret denies rather than admits:

```ts
const secret = process.env.KITCHEN_SESSION_SECRET;
const authed = !!secret && req.cookies.get('kos')?.value === secret;
```

Verification (safe, local, no production touch): in a scratch script set
`KITCHEN_SESSION_SECRET=''` and assert the expression is `false` for a cookie-less request. Or,
only with Silvio's ok and never against production, temporarily unset the var on a PREVIEW deploy
and `curl -X POST https://<preview>/kitchen/api/veto -H 'content-type: application/json' -d
'{"ev":"hide","dish":"card:test"}'` expecting 401. Do not run against `hoodii.studio`.

### P1-2. Next.js 16.2.6 carries a published App Router proxy-bypass advisory

`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\package.json` line 26 pins `next: 16.2.6`.
`pnpm audit --prod` reports (patched in >=16.2.11):

- **GHSA-6gpp-xcg3-4w24** high, "Middleware / Proxy bypass in App Router". This is the single most
  relevant advisory: the entire write-gate on this site IS the App Router proxy (`src/proxy.ts`), so
  a framework-level bypass defeats the whole model at once.
- GHSA-89xv-2m56-2m9x / GHSA-p9j2-gv94-2wf4 high, SSRF in Server Actions and in rewrites.
- GHSA-m99w-x7hq-7vfj high, App Router DoS via Server components.
- Several moderate (cache confusion, unbounded Server Action payload, image-optimizer DoS,
  internal Server disclosure), all `>=16.0.0 <16.2.11`.

Impact: a known, published bypass of the one mechanism gating every write. Exploitability depends on
the specific bypass shape (not analysed here), but a proxy-bypass CVE against a proxy-only auth model
is the highest-leverage upgrade on the list.

Executor fix: `pnpm add next@latest eslint-config-next@latest` (target >=16.2.11), then the full
gate `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm build`. Change deps only
through pnpm per AGENTS.md, never by editing package.json.

Verification: after upgrade, `pnpm audit --prod` shows the `next` advisories gone; re-run the gym
and kitchen probes (`node scripts/run-probe-gym.mjs`, `node scripts/probe-kitchen.mjs`) against a
preview URL to confirm the proxy still gates writes.

---

## P2 findings

### P2-1. Secret and password comparisons use `===`, not a constant-time compare

- `src/proxy.ts` line 44 (cookie vs `KITCHEN_SESSION_SECRET`)
- `src/app/kitchen/api/unlock/route.ts` line 33 (`pw !== expected`)
- `src/app/kitchen/login/page.tsx` line 10, and the same line in `gym/login`, `health/login`,
  `french/login` (`pw === process.env.KITCHEN_PASSWORD`)

`===` on strings is not constant-time and leaks a timing signal proportional to the matching prefix
length. Honest impact: over the public internet, network jitter dwarfs the per-byte difference and
this is not practically exploitable for a single-user personal site, which is why it is P2 not P1.
It is still the correct thing to eliminate as a class.

Executor fix: compare with `crypto.timingSafeEqual` on equal-length buffers (hash both sides first
to equalise length), or accept the risk explicitly given the posture. If accepting, write it down so
the next audit does not re-flag it.

Verification: unit test that a correct and an incorrect secret both return in statistically
indistinguishable time is overkill here; a code-level assertion that the compare is `timingSafeEqual`
is enough.

### P2-2. No rate limiting on the login / unlock POST beyond the off-repo firewall burst rule

`src/app/kitchen/api/unlock/route.ts` adds a fixed 600ms delay on a wrong password (lines 36-38),
which is a real brake. But the four `signIn` server actions
(`src/app/kitchen/login/page.tsx` line 6 onward and siblings) have NO delay and NO attempt counter.
The only other brake is off-repo Vercel firewall rule 4 (150 non-`/_next/` requests per minute per
IP, per AGENTS.md), which was not verified in this audit.

Impact: the password is the single credential for the entire write surface. 150 guesses/min/IP is
slow for a strong password and fatal for a weak one; from multiple IPs the burst rule does not
compose into a global cap. This is a real control gap softened only by an external rule this repo
cannot see.

Executor fix: give the login server actions the same deliberate failure delay the unlock route
already has, and confirm firewall rule 4 exists with `vercel firewall rules list`. Longer term, a
per-IP failure counter in Neon would compose across the whole surface, but that adds state the design
has so far avoided.

Verification (only with Silvio's ok, against a preview): loop 20 wrong-password POSTs to
`/kitchen/api/unlock` and confirm each takes >=600ms; confirm `vercel firewall rules list` shows the
burst rule.

### P2-3. Some write routes accept unbounded request bodies

Body-size discipline is inconsistent across the gated writes:

- `src/app/gym/api/note/route.ts` line 19 caps the note at 5000 chars. Good.
- `src/app/swim/api/baseline/route.ts` line 54 caps the note at 500 chars. Good.
- `src/app/kitchen/api/note/route.ts` lines 18-25 apply NO length cap to `note` or `stepText`.
- `src/app/french/api/cards/route.ts` lines 14-17 accept an arbitrary-length `cards[]` array with
  no per-card or array-size cap.
- `src/app/kitchen/api/finish/route.ts`, `.../shop`, `.../veto` cast strings with no length cap.

Impact: an authenticated (Silvio-only) or a bypass-enabled caller can write a 10MB string into
`cook_log` or thousands of French cards in one call, an integrity-and-cost issue on Neon and in
every page that later renders the row. Because all of these are cookie-gated, the practical blast
radius today is small; it matters more the moment P1-1 or P1-2 opens the gate.

Executor fix: cap every free-text field the way `gym/api/note` does (a `body.length > N` 400), and
cap `cards.length` in the French route. Next.js also has a route-level body-size limit worth setting.

Verification: POST an oversized body to each route on a preview (with the cookie, with Silvio's ok)
and expect 400.

### P2-4. No security headers; login password forms are frameable (clickjacking)

`next.config.ts` defines `redirects()` only, no `async headers()`. There is no `X-Frame-Options`,
no `Content-Security-Policy` `frame-ancestors`, no `Referrer-Policy`, no
`X-Content-Type-Options: nosniff` anywhere in the repo.

Impact: the four login pages render a password `<input>` and can be embedded in a hostile
`<iframe>`, the classic clickjacking setup. For a single-user site the practical risk is low (the
attacker would need to lure Silvio specifically), which is why it is P2. A full CSP is genuinely
overkill for this posture, as the prompt anticipated, but `frame-ancestors 'self'` (or
`X-Frame-Options: DENY`) on the login routes and `nosniff` globally are cheap and correct.

Executor fix: add an `async headers()` to `next.config.ts` setting `X-Frame-Options: DENY` and
`X-Content-Type-Options: nosniff` for `/:path*`, or scope frame-ancestors to the four `*/login`
paths.

Verification: `curl -I https://<preview>/kitchen/login` shows the header.

### P2-5. `sameSite: 'lax'` on the auth cookie rather than `'strict'`

The `kos` cookie is set with `sameSite: 'lax'` in `src/app/kitchen/api/unlock/route.ts` line 44 and
in all four login pages (e.g. `src/app/kitchen/login/page.tsx` line 14).

Assessment: `lax` is ADEQUATE CSRF defence here and this is close to a non-finding. The write routes
are JSON `fetch` POSTs; a cross-site `fetch` does not send a `lax` cookie on a POST (lax sends only
on top-level GET navigations), and the JSON content-type forces a CORS preflight that the routes
answer with no permissive headers, so a hostile page cannot drive a write. `strict` would be a
marginal improvement (it also blocks the cookie on top-level cross-site GET navigations, none of
which mutate here). Listed only for completeness; no action strictly required.

---

## P3 findings

### P3-1. Transitive dependency advisories (dev/build chain)

`pnpm audit --prod` reports 25 advisories total; most are dev/build-chain transitive deps not in the
runtime path: `postcss`, `@babel/core`, `js-yaml`, `nanoid`, `brace-expansion`, `sharp` (pulled via
shadcn/next tooling). Impact at runtime is minimal because these run at build time on trusted input,
not against attacker input in production. Clear them opportunistically when bumping Next (P1-2) pulls
newer transitive versions; do not chase them individually.

### P3-2. Three login pages set no `noindex` metadata

`src/app/callback/page.tsx` (line 7) and, per AGENTS.md, the app layouts serve `noindex`. But
`src/app/gym/login/page.tsx`, `health/login`, `french/login` and `kitchen/login` export no `robots`
metadata of their own. This is an SEO/hygiene point, not a security one (the pages leak nothing), and
`robots.ts` deliberately does not Disallow them so a crawler can read a page's own noindex. If those
pages inherit noindex from a parent layout this is already handled; if not, add
`export const metadata = { robots: { index: false, follow: false } }` to each. Verify by checking the
rendered `<head>` on each login route.

---

## What is actually good

- **Injection is structurally absent.** All 110 `sql\`...\`` usages across 18 lib modules are Neon
  tagged templates with interpolated values bound as parameters, including the nine-query
  `sql.transaction([...])` bundle in `src/lib/reading/shelf-db.ts`. No string concatenation into
  SQL, no `sql.unsafe`, no `sql.query` with built strings. User input reaching a query is always a
  bound value, never SQL text.
- **The write-gate inventory is complete** and the two mechanisms (prefix check + matcher) agree on
  every prefix. The `/swim` matcher omission that AGENTS.md documents as a past incident is fixed in
  both places, and `scripts/lint-probe-routes.mjs` plus the probe harness enforce it going forward.
- **Git history is clean of secrets.** Swept all 235 commits for `postgres://`, `sk-`, `AKIA`,
  `BEGIN PRIVATE KEY`, `npsso`, `client_secret`, `refresh_token=` and hardcoded
  password/token/apikey assignments. Only matches are code that READS `process.env.*` and prose in
  AGENTS.md naming the env-var NAMES (not values). `.gitignore` covers `.env*` (twice) and `*.pem`,
  and `OVERNIGHT-LOG.md` is deliberately ignored. No secret VALUE is committed. No `NEXT_PUBLIC_`
  var exists, so nothing leaks into the client bundle.
- **`/api/music/sync` is correctly fail-closed.** `src/app/api/music/sync/route.ts` lines 19-28
  refuse with 500 when `CRON_SECRET` is unset and 401 when the `Authorization: Bearer` header does
  not match. It does not sit open making four Spotify calls per anonymous hit.
- **`/api/psn-image` is not an open proxy / SSRF.** `src/app/api/psn-image/route.ts` line 14
  allowlists exactly one host (`image.api.playstation.com`) and returns 403 for anything else, after
  parsing the URL. `/api/spotify` and `/api/psn` take no user input and fan out only to fixed
  upstreams, so they cannot be steered.
- **`/callback` leaks nothing.** `src/app/callback/page.tsx` displays the Spotify auth code only,
  never exchanges it (the exchange needs the client secret, which is not in the page or repo),
  declares `noindex`, and stores nothing.
- **`dangerouslySetInnerHTML` is safe.** The one use (`src/app/page.tsx` line 495) is
  `JSON.stringify` of a static JSON-LD `person` object with no user input.
- **DB modules and login/unlock routes fail closed** on missing connection strings and empty
  credentials. The unlock route adds a 600ms failure delay against online guessing.
- **No path traversal.** Dynamic file reads (`src/lib/reading/packs.ts`, `src/lib/kitchen/recipes.ts`)
  key on route `[slug]`/`[id]` segments joined into a fixed dir and wrapped in try/catch returning
  null, and the surrounding data set is a fixed corpus; there is no attacker-influenced absolute path
  or `..` reaching `readFile`.
- **No `eval`, `Function()`, or `child_process`** anywhere in `src/`.
- **Open-redirect closed** on the login `to` param: each `signIn` re-checks `to.startsWith('/<own
  prefix>')` before redirecting and falls back to the app root otherwise.

---

## Coordinate-with-swim-agent items

`/swim/api/baseline` (`src/app/swim/api/baseline/route.ts`) is in scope only as static analysis. It
is correctly gated (P1/P2 notwithstanding) and validates its input well (positive number, multiple
of 25, ceiling 6000, ISO date, note capped at 500). If P2-3 body-capping or any auth change touches
it, hand that edit to the swim agent per the audit protocol.
