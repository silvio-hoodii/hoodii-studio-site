---
moved: 2026-10-18, verbatim from AGENTS.md, which now points here. Not re-audited beyond the dead paths fixed that day.
---

# Music and live data

**`/music` has a failure mode none of the others have.** Its history is unrecoverable: Spotify
returns the last 50 plays and nothing else, so anything the cron misses is gone from everywhere, not
just from here. `vercel.json` therefore runs `/api/music/sync` three times a day (Hobby permits 100
cron jobs at once-per-day each, so three entries 8 hours apart is legal and free). The route
requires `CRON_SECRET` and refuses to run without it rather than sitting on the internet as an open
endpoint that makes four Spotify calls per hit.

**The refresh token dies silently every 180 days** while the Spotify app is in Development mode, and
`fetchSpotify()` in `src/lib/fetchers.ts` returns `{ isPlaying: false }` for both a dead token and a
quiet evening. That is why `src/lib/music/spotify.ts` exists as a separate client that **throws**,
why every run writes a `music_sync` row, and why `/music` and the hub row both shout when the last
successful run is over 36 hours old. Do not add a catch that returns a default to that file.

## Live data

`src/lib/fetchers.ts` plus `/api/spotify`. Spotify now-playing renders in the hub footer and
degrades to nothing.

**PSN IS DELETED, 2026-09-04.** `/api/psn`, `/api/psn-image`, `fetchPsn` and the `psn-api`
dependency all went together (E5 and section F of that day's audit). The token had been expired for
months, both routes had zero callers, nothing on the site rendered a game, and the expired token
logged a caught error on every build. Keeping a client for a feature with no surface is how a repo
accumulates things a reader has to work out are dead.

