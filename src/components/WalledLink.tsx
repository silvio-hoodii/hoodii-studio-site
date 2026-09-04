import Link from 'next/link';
import type { ComponentProps } from 'react';
import { isWalled } from '@/lib/walled';

/* A LINK THAT WILL NOT PREFETCH A PATH THE EDGE IS CONFIGURED TO REFUSE. A7 of the 2026-09-04
 * audit; the full account of what it costs is in the header of `src/lib/walled.ts`.
 *
 * WHY A COMPONENT AND NOT `prefetch={false}` EIGHTEEN TIMES. The prop would fix today's eighteen
 * links and nothing else. The recurring failure in this repo is not the fix, it is the nineteenth
 * link: `/kitchen/find` was given a challenge on 2026-08-20 and `/reading/shelf` shipped the same
 * shape the next day, which is AGENTS.md's own conclusion that "naming paths one at a time loses".
 * With a component, which paths are walled is one list in one file, and a fourth walled path is one
 * line rather than a hunt through the tree.
 *
 * It decides from the href rather than trusting the caller, so a link written with this component
 * to an ordinary path still prefetches normally. That means it is safe to use anywhere, which is
 * what lets `scripts/lint-probe-routes.mjs` require it for a walled target without forcing anyone
 * to reason about whether a given path is one.
 *
 * NOT A SERVER-SIDE REDIRECT OR A DIFFERENT COMPONENT SHAPE: the challenge is correct behaviour and
 * these links must keep working. A person tapping one gets Vercel's "verifying your browser" flash
 * and then the page, which is D4 of the same audit and a deliberate trade. What is being removed is
 * only the SPECULATIVE fetch that no person asked for.
 */
export default function WalledLink({ href, ...rest }: ComponentProps<typeof Link>) {
  const target = typeof href === 'string' ? href : '';
  /* `prefetch` is passed explicitly in both directions rather than spread conditionally, so the
     value is visible in the rendered tree and a future reader does not have to infer it. */
  return <Link href={href} prefetch={isWalled(target) ? false : undefined} {...rest} />;
}
