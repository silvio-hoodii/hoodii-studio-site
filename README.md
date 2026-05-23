# hoodii-studio-site

The 3D rebuild of [hoodii.studio](https://hoodii.studio) — an agent's studio in WebGL.

Single immersive room. Procedural geometry. Live data on holographic objects. Identity hinted, not announced.

## Status

Scaffold ready, build in progress. v1 = 3 objects (lamp + Spotify vinyl + PSN cartridge), ~3 weeks. Then weekly accrete cadence adds objects over time.

Design doc + week-by-week task list: `~/Desktop/HOODII/docs/plans/2026-05-21-hoodii-studio-3d-world-design.md`.

## Stack

Next 16 · React 19 · Three.js + React Three Fiber + drei + postprocessing · GSAP · zustand · Tailwind 4 · TS strict.

## Run

```bash
pnpm install
pnpm dev          # localhost:3001
pnpm typecheck
pnpm lint
pnpm build
```

## Repo conventions

See `AGENTS.md` (auto-imported by `CLAUDE.md`).
