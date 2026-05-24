'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useState } from 'react'
import * as THREE from 'three'
import { useFocus } from '../state/useFocus'

// Procedural dust motes drifting inside the existing light zones. Two
// clusters: one cool/pale in the window godray cone, one warm/amber in
// the lamp pool above the desk. Additive blending means the motes only
// register where they cross a lit zone — exactly the "dust in light"
// effect, automatic. Per 2026-05-23 design doc "more API life" v1.
//
// Each cluster is one <points> mesh — 2 draw calls total, well within
// the 30-call budget. Particles wrap toroidally when they drift out of
// their spawn volume so the cluster density stays constant.

const WINDOW_PARTICLES = 80
const LAMP_PARTICLES = 60

// Window cluster volume: a slab in front of the window that the godrays
// pass through. Centered on the godray axis (window is at z=-2, x=0,
// y≈1.8). Particles drift slowly forward and downward, then wrap.
const WINDOW_VOLUME = {
  x: { min: -1.0, max: 1.0 },
  y: { min: 0.5, max: 2.4 },
  z: { min: -1.9, max: 0.2 },
}

// Lamp cluster volume: a 60cm cube centered on the lamp's warm pool. The
// lamp head sits at world (-0.19, 1.4, -0.4); pool sits below it on the
// desk.
const LAMP_VOLUME = {
  x: { min: -0.55, max: 0.25 },
  y: { min: 0.8, max: 1.5 },
  z: { min: -0.7, max: -0.1 },
}

type VolumeRange = { min: number; max: number }
type Volume = { x: VolumeRange; y: VolumeRange; z: VolumeRange }

function spawnCluster(count: number, vol: Volume, rng: () => number) {
  const positions = new Float32Array(count * 3)
  const velocities = new Float32Array(count * 3)
  // Per-particle Y-wave phase for the floating "drift" feel
  const phases = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const i3 = i * 3
    positions[i3 + 0] = vol.x.min + rng() * (vol.x.max - vol.x.min)
    positions[i3 + 1] = vol.y.min + rng() * (vol.y.max - vol.y.min)
    positions[i3 + 2] = vol.z.min + rng() * (vol.z.max - vol.z.min)
    // Very slow drift — ~1-3 cm/sec
    velocities[i3 + 0] = (rng() - 0.5) * 0.02
    velocities[i3 + 1] = -0.005 - rng() * 0.012 // gentle downward fall
    velocities[i3 + 2] = (rng() - 0.5) * 0.015
    phases[i] = rng() * Math.PI * 2
  }
  return { positions, velocities, phases }
}

// Deterministic seed so the spawn pattern is identical run-to-run.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return function () {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type ClusterProps = {
  count: number
  volume: Volume
  color: string
  seed: number
  size: number
  opacity: number
}

function DustCluster({ count, volume, color, seed, size, opacity }: ClusterProps) {
  const prefersReducedMotion = useFocus((s) => s.prefersReducedMotion)
  const { positions, velocities, phases } = useMemo(
    () => spawnCluster(count, volume, mulberry32(seed)),
    [count, volume, seed],
  )

  // Lazy-init the geometry + material so the references are stable across
  // renders (matches the sky shader's pattern in shaders/sky.ts).
  const [geometry] = useState(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  })
  const [material] = useState(
    () =>
      new THREE.PointsMaterial({
        color: new THREE.Color(color),
        size,
        sizeAttenuation: true,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
  )

  useFrame((state, delta) => {
    if (prefersReducedMotion) return
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = posAttr.array as Float32Array
    const t = state.clock.elapsedTime
    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      let px = arr[i3 + 0]!
      let py = arr[i3 + 1]!
      let pz = arr[i3 + 2]!
      const vx = velocities[i3 + 0]!
      const vy = velocities[i3 + 1]!
      const vz = velocities[i3 + 2]!
      const phase = phases[i]!

      px += vx * delta
      py += vy * delta + Math.sin(t * 0.4 + phase) * 0.00018
      pz += vz * delta

      // Toroidal wrap so particle density stays constant
      if (px < volume.x.min) px = volume.x.max
      else if (px > volume.x.max) px = volume.x.min
      if (py < volume.y.min) py = volume.y.max
      else if (py > volume.y.max) py = volume.y.min
      if (pz < volume.z.min) pz = volume.z.max
      else if (pz > volume.z.max) pz = volume.z.min

      arr[i3 + 0] = px
      arr[i3 + 1] = py
      arr[i3 + 2] = pz
    }
    posAttr.needsUpdate = true
  })

  return <points geometry={geometry} material={material} />
}

export function Dust() {
  return (
    <>
      {/* Window cluster — cool dusty white, larger volume, more particles */}
      <DustCluster
        count={WINDOW_PARTICLES}
        volume={WINDOW_VOLUME}
        color="#bcc8dc"
        seed={4717}
        size={0.014}
        opacity={0.4}
      />
      {/* Lamp cluster — warm amber, smaller volume, denser per-volume */}
      <DustCluster
        count={LAMP_PARTICLES}
        volume={LAMP_VOLUME}
        color="#ffd9a8"
        seed={9311}
        size={0.012}
        opacity={0.55}
      />
    </>
  )
}
