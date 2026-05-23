import { Cursor } from '@/overlay/Cursor'
import { HoverLabel } from '@/overlay/HoverLabel'
import { fetchPsn, fetchSpotify } from '@/lib/fetchers'
import { Studio } from '@/world/Studio'

// RSC root. Fetches initial Spotify + PSN snapshots so the very first
// paint already shows real now-playing / last-played data — the client
// useDataSources hook then refreshes every 60s from there. Both fetches
// degrade gracefully (return offline / null game) on credential or network
// failure, so the page never errors out on data.
export default async function Home() {
  const [spotify, psn] = await Promise.all([fetchSpotify(), fetchPsn()])

  return (
    <>
      <Studio initialSpotify={spotify} initialPsn={psn} />
      <HoverLabel />
      <Cursor />
    </>
  )
}
