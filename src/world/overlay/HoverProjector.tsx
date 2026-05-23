'use client'

import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useFocus } from '../state/useFocus'

// Each hoverable object has a stable visual-anchor world position. The
// projector reads the currently hovered id from the store and projects its
// anchor through the camera each frame into screen pixels, then writes the
// screen pos back to the store. The DOM-side HoverLabel reads that screen
// pos and renders adjacent to the projected point.
//
// Static positions are fine for v1 — the meshes themselves rotate but
// their group centers stay put. Week 3 will re-anchor when sub-scene focus
// triggers a camera dolly that invalidates these.
const HOVER_ANCHORS: Record<string, THREE.Vector3> = {
  lamp: new THREE.Vector3(-0.12, 1.42, -0.4),
  laptop: new THREE.Vector3(-0.1, 0.96, -0.18),
  monitor: new THREE.Vector3(0.4, 1.08, -0.55),
  vinyl: new THREE.Vector3(0.55, 0.79, -0.15),
}

const projected = new THREE.Vector3()

export function HoverProjector() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  useFrame(() => {
    const state = useFocus.getState()
    const hovered = state.hovered
    if (!hovered) return
    const anchor = HOVER_ANCHORS[hovered]
    if (!anchor) return

    projected.copy(anchor).project(camera)
    state.setHoveredScreenPos({
      x: (projected.x * 0.5 + 0.5) * size.width,
      y: (1 - (projected.y * 0.5 + 0.5)) * size.height,
    })
  })

  return null
}
