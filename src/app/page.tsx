// Placeholder. The real <Studio> client component is built across weeks 1–3
// per docs/plans/2026-05-21-hoodii-studio-3d-world-design.md.
//
// When ready: this becomes a server component that fetches initial Spotify +
// PSN snapshots and passes them as props into a "use client" <Studio> that
// mounts the R3F Canvas. See the design doc for the RSC boundary contract.

export default function Home() {
  return (
    <main className="grid h-full place-items-center">
      <div className="text-center font-mono text-xs uppercase tracking-widest text-foreground/50">
        <p>studio loading.</p>
        <p className="mt-1 text-foreground/30">scaffold ready · v2 in build</p>
      </div>
    </main>
  )
}
