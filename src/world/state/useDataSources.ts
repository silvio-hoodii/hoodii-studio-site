'use client'

import { useEffect, useState } from 'react'
import type { PsnPayload, SpotifyPayload } from '@/lib/fetchers'

export type DataSources = {
  spotify: SpotifyPayload | null
  psn: PsnPayload | null
}

const POLL_INTERVAL_MS = 60_000

// Subscribes to both /api/spotify and /api/psn on mount and re-polls every
// 60s. Accepts initial snapshots from the server-rendered page so the first
// paint never shows "offline" — the polling only refreshes from there on.
// Transient fetch failures keep the previous state rather than wiping to null.
export function useDataSources(initial: DataSources): DataSources {
  const [spotify, setSpotify] = useState<SpotifyPayload | null>(initial.spotify)
  const [psn, setPsn] = useState<PsnPayload | null>(initial.psn)

  useEffect(() => {
    let cancelled = false

    async function pollSpotify() {
      try {
        const res = await fetch('/api/spotify', { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const data: SpotifyPayload = await res.json()
        if (!cancelled) setSpotify(data)
      } catch {
        // keep previous state
      }
    }

    async function pollPsn() {
      try {
        const res = await fetch('/api/psn', { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const data: PsnPayload = await res.json()
        if (!cancelled) setPsn(data)
      } catch {
        // keep previous state
      }
    }

    pollSpotify()
    pollPsn()
    const spotifyId = setInterval(pollSpotify, POLL_INTERVAL_MS)
    const psnId = setInterval(pollPsn, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(spotifyId)
      clearInterval(psnId)
    }
  }, [])

  return { spotify, psn }
}
