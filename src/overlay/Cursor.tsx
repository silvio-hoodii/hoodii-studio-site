'use client'

import { useEffect, useState } from 'react'

// HTML reticle overlay — native cursor is hidden via globals.css (cursor: none
// on *). Position is updated on pointermove via translate3d to stay on the
// GPU. Week 2 grows this to scale slightly when hovering a raycaster-picked
// mesh; for v1 it just tracks.
export function Cursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 })

  useEffect(() => {
    const onMove = (e: PointerEvent) => setPos({ x: e.clientX, y: e.clientY })
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  return (
    <div
      aria-hidden
      style={{
        transform: `translate3d(${pos.x - 5}px, ${pos.y - 5}px, 0)`,
      }}
      className="pointer-events-none fixed left-0 top-0 z-50 h-2.5 w-2.5 rounded-full border border-[var(--reticle)] mix-blend-difference"
    />
  )
}
