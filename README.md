# hoodii-studio-site

[hoodii.studio](https://hoodii.studio). A personal hub and the small apps behind it: a kitchen that
scores what I can cook against what is actually in my fridge, a lifting log filled in between sets,
a swim tracker, French flashcards built only from book pages I have worked, and a reading queue.

[Home-cooked software](https://maggieappleton.com/home-cooked-software), built for an audience of
one. That is the design brief rather than an apology: nothing here is meant to scale or generalise,
and several decisions only make sense because there is exactly one user.

## What is interesting here

Not the pages. What the build refuses to ship.

A recipe step cannot contain a number that does not appear in the published recipe it quotes. No
colour can be written outside the one file that defines the palette, and no background token can be
used as a text colour. The password check exists in exactly one place and a second copy fails the
build. A write endpoint that is not declared in the test harness fails the build, because otherwise
a test would post into my real training log.

Each of those exists because something specific went wrong once. The reasoning is in `AGENTS.md`,
which is the file I actually maintain and is longer than most of the code it describes.

[/work/site](https://hoodii.studio/work/site) is the same story with pictures, and every figure on
it is counted out of this repository at build time rather than typed.

## Stack

Next 16 (Turbopack), React 19, TypeScript strict with `noUncheckedIndexedAccess`. Neon Postgres over
HTTP. Plain CSS on shadcn tokens, no component library. Auth is a password and one httpOnly cookie
in `src/proxy.ts`, which is the right size for a site with one writer.

## Run

```bash
pnpm install
pnpm dev          # localhost:3001, and test on localhost rather than 127.0.0.1
pnpm build        # runs every gate, then compiles
node scripts/verify.mjs   # the above plus the test suites, one green or red line
```

`verify.mjs` is what a pre-push hook runs. A red tree does not push.

Some checks need a browser and a running server, so they are not in `verify.mjs`:

```bash
pnpm start -p 3007
node scripts/probe-taps.mjs http://localhost:3007      # 44px tap floor, overflow, nav chip rows
node scripts/probe-kitchen.mjs http://localhost:3007   # the cook screen, rendered
node scripts/run-probe-gym.mjs http://localhost:3007   # the only test here that presses a button
```

Run those against a local server and never against the live domain: a full sweep trips the site's
own firewall rate limit, and the challenge page it would then measure is not this site.

## Where things are

`AGENTS.md` has the surfaces table, the data pipeline, what every gate is for and the incident
behind each. Read it before changing anything. It is the source of truth for this repo, and this
file is only the front door to it.
