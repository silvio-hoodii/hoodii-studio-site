<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# hoodii-studio-site

## What this repo is

The 3D rebuild of `hoodii.studio` — a single immersive WebGL room rendered as "an agent's studio." Pale concrete + brushed metal + volumetric light + holographic objects wired to live data (Spotify, PSN, later GitHub). Identity is hinted, not announced. Strangers route to Brixel via a small business card on the desk.

This is Silvio's personal creative practice in public, and a test of whether AI agents alone can deliver a high-craft 3D site end-to-end. **No human is in the asset loop.** Procedural geometry + emissive shaders + post-fx only.

## Authoritative design doc

`~/Desktop/HOODII/docs/plans/2026-05-21-hoodii-studio-3d-world-design.md` is the single source of truth. Before writing scene code, read it end-to-end. It contains:

- The 9 locked decisions from the brainstorm
- v1 object inventory (lamp, vinyl/Spotify, cartridge/PSN)
- Tech architecture + folder layout
- Interaction state machine + sub-scene contract
- Week 1 / 2 / 3 task lists
- Risk register + steer checkpoints
- Accrete cadence post-launch

If you propose a change that contradicts the doc, surface it to the operator before doing the work.

## Stack

- **Framework.** Next 16 (Turbopack) + React 19 + TS strict.
- **3D.** `three` + `@react-three/fiber` + `@react-three/drei` + `@react-three/postprocessing`.
- **Animation.** `gsap` + `@gsap/react` (`useGSAP` for cleanup).
- **State.** `zustand` (single focus store).
- **Styling.** Tailwind 4 (CSS-first config in `globals.css`).
- **No.** Sanity. Sentry (post-v1). i18n. `@hoodii/ui`. Analytics.

## Critical pattern: GSAP × R3F

GSAP's RAF and R3F's `useFrame` can tear transforms if a tween writes a mesh property directly. Always tween a **plain ref object**, then copy ref → mesh in `useFrame`. Pattern is documented in the design doc under "Tech architecture > GSAP + R3F coexistence."

## Live data ports (week 2)

Two API routes need porting verbatim from the monorepo:

- `hoodii-platform/apps/hoodii-site/src/app/api/spotify/route.ts` → `src/app/api/spotify/route.ts`
- `hoodii-platform/apps/hoodii-site/src/app/api/psn/route.ts` → `src/app/api/psn/route.ts`

Env vars: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`, `PSN_NPSSO`. Carry over from the monorepo Vercel project to this repo's Vercel project.

## Commits and deploy

- Production deploys from `main` per `feedback_vercel_auto_deploy_from_main`.
- Feature branches for everything else. Never push directly to main without typecheck + build passing locally.
- Verification gates: `pnpm typecheck && pnpm lint && pnpm build`.
- Dev server: `pnpm dev` (port 3001 to avoid collision with brixel-site on 3003).

## Parity gate before DNS flip

The old monorepo app at `hoodii-platform/apps/hoodii-site/` keeps serving `hoodii.studio` until this site passes:

1. 60fps on M1 Air, 30fps mid-Android
2. Spotify + PSN render live with no auth errors
3. Lamp sub-scene focus + return does not desync
4. Screen-reader can navigate the text mirror end-to-end
5. Lighthouse a11y ≥ 90

Then the DNS flip happens and the old app archives to `hoodii-platform/_archive/hoodii-site-2026-MM-DD/`.

## Posture rules (load-bearing)

- **No CMS.** Content lives in TS files. Pattern from sibling `brixel-site/` (memory `feedback_brixel_site_strip_sanity`).
- **No "Hoodii" branding.** Silvio's personal surface uses his name + `hoodii.studio` domain. No Hoodii logos, no Hoodii Inc framing.
- **Voice is "I" (first person).** This is Silvio's personal site, not a company.
- **Stretch tech is the goal.** Don't shortcut the 3D for "simpler." If a steer checkpoint fires (see design doc risk register), surface it to the operator before pivoting.
