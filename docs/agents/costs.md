---
moved: 2026-10-18, verbatim from AGENTS.md, which now points here. Not re-audited beyond the dead paths fixed that day.
---

# Region, firewall and what costs money

## Where the functions run: pdx1, next to the database

**Since 2026-09-27 `vercel.json` pins `regions: ["pdx1"]` (Portland).** Until then every function ran
in Vercel's default `iad1` (Virginia) while Neon lives in `us-west-2` (Oregon) and his requests enter
at the `pdx1` edge, so every database round trip crossed the continent twice. Read the proof off any
response: `x-vercel-id: pdx1::iad1::...` meant edge Portland, function Virginia. His words: the pages
took "a little more time to load ... in every app". Keep the function region beside the Neon region;
if the database ever moves, this line moves with it.

## What costs money, and the gate that is NOT in this repo

**Three Vercel firewall rules protect this site and none of them are visible in these files.**
Read them with `vercel firewall overview` and `vercel firewall rules list` before concluding that
something is unprotected, and re-read them before adding a filter page.

| # | Rule | What it does |
|---|---|---|
| 1 | Block AI training crawlers | UA regex, deny. meta-externalagent, GPTBot, ClaudeBot, Bytespider and friends |
| 2 | Unlocked device bypass | A request carrying the `kos` cookie skips rules 3 and 4 |
| 3 | ~~Filter surface cost gate~~ | **REMOVED 2026-09-27.** It challenged `^/(reading/(shelf\|want)\|kitchen/(find\|want))`, four paths that were all deleted and 307 somewhere real; under the challenge the redirect could not run, so an old link got a 34 KB checkpoint page instead of /reading. `src/lib/walled.ts` and `WalledLink.tsx` went with it. Any future filter page with crawlable `<Link>` state gets a rule of its own, stated here |
| 4 | Document burst limit | 150 non-`/_next/` requests per minute per IP, then a challenge |

**Rule 1 names the actual culprit, identified 2026-08-25 from `vercel.request.count` grouped by
`bot_name`: `meta-externalagent`, Meta's AI training crawler, was 208,938 of 215,673 edge requests
in one 30-hour window.** Googlebot, bingbot, facebookexternalhit and UptimeRobot are deliberately
NOT in that rule and were each re-tested after publishing it: search indexing and link-preview
cards are wanted. Deny rather than challenge, because a challenge page is 33KB served to something
that will never look at it, against 59 bytes for a 403.

**Two traps in that rule, both of which cost a wrong answer before being caught.** The Vercel
dashboard TRUNCATES the user agent column, and `meta-externalagent/1.1` sits at the END of an
otherwise ordinary Chrome UA string, so the top user agents look like plain desktop Chrome. Group
by `bot_name`, never eyeball the UA column. And the firewall's `inc` operator is EXACT match
against a list, not substring: the first version of this rule used `inc` with the bot names,
published clean, and let `meta-externalagent` through with a 200 on every path. Only `re` (regex,
RE2, so no `(?i)` inline flag) does substring matching. A firewall rule that reads correctly in
`vercel firewall rules list` has not been tested. Curl it with the real user agent, both the
should-block and the should-pass side.

Added 2026-08-24, after `/reading/shelf` took **178,000 invocations and 40 minutes of Active CPU
in twelve hours**: 97.7% of the site's invocations and 95.7% of its compute, at a sustained 3.55
req/s that a live log tail caught still running. Projected out, that was ten times the entire
Hobby monthly allowance for both invocations and Active CPU, and the plan is to move back to Hobby.

**The lesson is about which of these mechanisms actually executes.** `robots.ts` had disallowed all
three of those paths since 2026-08-20, and its own addendum argued correctly that an AI scraper has
no reason to read a page's meta tags before fetching it. It does not read `robots.txt` either. Two
of the three disallowed paths were the two most-requested routes on the site. Keep the Disallow, it
still speaks to crawlers that do honour it, but never count it as protection. After publishing the
rules, function invocations went from 2.37 req/s to 0.02 req/s with zero on all three paths.

**The shape rule 3 guarded is the one that matters for code you have not written yet.** `/kitchen/find`
was caught with this shape on 2026-08-20 and `/reading/shelf` shipped the same shape on 2026-08-21,
so naming paths one at a time loses. Any page that renders on every request, exposes its filter
state as crawlable `<Link>` hrefs, and needs no cookie is a combinatorial URL space someone will
walk. No such page exists today, which is why the rule is gone; the day one ships, it gets a rule
and `scripts/check-firewall.mjs` (which now fails only if a challenged path serves a live route)
gets its path.

**Two numbers to reason with before optimising anything here.** Vercel bills Active CPU only while
code runs, and Provisioned Memory for an instance's whole lifetime *including* time spent waiting
on I/O. `/reading/shelf` was 13ms of Active CPU against a 153ms P75 time to first byte, so what it
cost was memory held open waiting for Postgres, not compute. **Count round trips, not work.** That
page issued nine separate HTTP queries per hit; `getShelfBundle` in `src/lib/reading/shelf-db.ts` (since removed)
sends the same nine as one `sql.transaction`. A `Promise.all` makes queries concurrent, not free.

`/` and `/opengraph-image` were checked at the same time and left alone: the first already carries
`revalidate = 60` and the second prerenders static (`○` in the build's route table). Neither was
costing anything, and changing them would have been motion.

**How to read the real numbers, rather than the dashboard.** `vercel api` is an authenticated
passthrough to the whole Vercel REST API using the CLI's own login, so no separate token is needed.
In Git Bash, prefix it with `MSYS_NO_PATHCONV=1` or the leading `/` in the path gets rewritten into
a Windows path and the CLI rejects it.

```
MSYS_NO_PATHCONV=1 vercel api /v2/observability/schema                # 97 metrics and their dimensions
MSYS_NO_PATHCONV=1 vercel api /v2/observability/schema/<metricId>     # the dimensions you may group by
MSYS_NO_PATHCONV=1 vercel api /v2/observability/query -X POST --input body.json
```

The query body needs `scope: {type: "owner", ownerId: "<team id>"}`, a single `metric`, ISO-string
`startTime` / `endTime`, and an optional `groupBy` array. The metrics worth knowing:
`vercel.external_api_request.count` (every Neon query counts here, and on this site that is ALL of
it: group by `origin_route` to see which page), `vercel.function_invocation.count` (group by
`route`), and `vercel.request.count` (group by `bot_name`, `client_user_agent`, `client_ip`,
`waf_action`, `waf_rule_id`, `project_name`).

**"External API Requests" on the billing page means Neon.** It was 66.6% of all observability
events during the scrape, and grouping by `request_hostname` returned exactly one value:
`api.us-west-2.aws.neon.tech`. Not Spotify, not PSN. That is what makes the round-trip count in
`getShelfBundle` a billing decision and not a tidiness one.

**`aggregation: "sum"` is not the default and forgetting it reads as ZERO, not as an error.** Every
value metric (`function_cpu_time_ms`, `function_duration_gbhr`, `fdt_total_bytes`,
`peak_memory_mb`, the ISR byte counts) defaults to `avg`, so the response field comes back named
`..._avg`. Code that reads a `..._sum` key it built by string manipulation gets `undefined`, scores
it as 0, and prints a confident "0.00 CPU-hours" for a site that ran functions all day. That is
exactly what the first pass of the 2026-08-25 sweep reported. Pass `aggregation` explicitly and
assert the field name is present in the response before summing it.

**Baseline as of 2026-08-25, so a future session can tell drift from noise.** Measured over a clean
13-hour window with the scraper blocked, projected to a month, against the Hobby allowances that
matter because that is where this account is going:

| Resource | Projected / month | Hobby allows |
|---|---|---|
| Active CPU | ~1.0 CPU-hr | 4 |
| Function invocations | ~33,000 | 1,000,000 |
| Provisioned memory | ~7 GB-hrs | 360 |
| Fast data transfer | ~0.8 GB | 100 GB |
| Image transformations | ~111 | 5,000 |

Function error rate at that point was 9 non-200s out of 26,225 invocations in 24 hours. If a later
sweep shows Active CPU climbing, look at `vercel.function_invocation.function_cpu_time_ms` grouped
by `route` first: on 2026-08-25 a single route, `/`, was 67.1% of the whole account's CPU, and the
fix was its `revalidate`, not its code.

