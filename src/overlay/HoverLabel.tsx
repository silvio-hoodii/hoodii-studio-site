'use client'

import { useFocus } from '@/world/state/useFocus'

// DOM-side label. Reads the projected screen position written by
// HoverProjector each frame and renders adjacent to that point. Sits
// outside the R3F Canvas so it can use real DOM (text rendering,
// backdrop-blur, etc.) instead of an in-canvas <Html>.
export function HoverLabel() {
  const label = useFocus((s) => s.hoveredLabel)
  const pos = useFocus((s) => s.hoveredScreenPos)

  if (!label || !pos) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-40 -translate-x-1/2 -translate-y-full font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/85"
      style={{ left: pos.x, top: pos.y - 24 }}
    >
      <div className="rounded-sm border border-foreground/15 bg-background/70 px-2.5 py-1 backdrop-blur-sm">
        {label}
      </div>
    </div>
  )
}
