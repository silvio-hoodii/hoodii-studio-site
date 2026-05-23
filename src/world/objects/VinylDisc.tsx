'use client'

import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import type { SpotifyPayload } from '@/lib/fetchers'
import { useFocus } from '../state/useFocus'

type Props = {
  spotify: SpotifyPayload | null
}

// Vinyl record laying flat on the right side of the desk. v3 of this
// component (operator pick 2026-05-23): flat instead of standing on edge,
// bigger so it reads as an object from the camera angle. Slow Y-axis spin
// when Spotify is playing.
//
// Position math: desk top surface is at y=0.76 (Desk RoundedBox is
// centered at y=0.74 with height 0.04, so top face = 0.76). Disc body
// thickness 0.016 → centered at y=0.768 puts bottom at 0.76 (resting on
// desk) and top at 0.776.
export function VinylDisc({ spotify }: Props) {
  const groupRef = useRef<THREE.Group>(null)
  const reducedMotion = useFocus((s) => s.prefersReducedMotion)
  const setHovered = useFocus((s) => s.setHovered)

  const isPlaying = Boolean(spotify?.isPlaying)
  const title = spotify?.title?.slice(0, 22) ?? null
  const artist = spotify?.artist?.slice(0, 22) ?? null

  useFrame((state, delta) => {
    if (!groupRef.current) return
    const playing = Boolean(spotify?.isPlaying)
    const speed = reducedMotion ? 0.04 : playing ? 0.22 : 0.08
    groupRef.current.rotation.y += speed * delta

    if (!playing) {
      const amp = reducedMotion ? 0.006 : 0.012
      const s = 1 + Math.sin(state.clock.elapsedTime * 1.2) * amp
      groupRef.current.scale.setScalar(s)
    } else if (groupRef.current.scale.x !== 1) {
      groupRef.current.scale.setScalar(1)
    }
  })

  const label = isPlaying
    ? `NOW PLAYING / ${title ?? '—'} · ${artist ?? '—'}`
    : title
      ? `LAST PLAYED / ${title} · ${artist ?? '—'}`
      : 'OFFLINE'

  return (
    <group
      ref={groupRef}
      position={[0.55, 0.768, -0.15]}
      name="vinyl"
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered('vinyl', label)
      }}
      onPointerOut={() => setHovered(null)}
    >
      {/* Disc — 25cm diameter, flat on desk */}
      <mesh>
        <cylinderGeometry args={[0.125, 0.125, 0.016, 64]} />
        <meshStandardMaterial color="#1c1c20" roughness={0.42} metalness={0.55} />
      </mesh>

      {/* Outer ring catches highlight from the warm lamp pool */}
      <mesh position={[0, 0.009, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.095, 0.123, 64]} />
        <meshStandardMaterial
          color="#4a4a52"
          roughness={0.34}
          metalness={0.68}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Label disc — warm-amber, always faintly emissive so it reads */}
      <mesh position={[0, 0.0095, 0]}>
        <cylinderGeometry args={[0.052, 0.052, 0.001, 32]} />
        <meshStandardMaterial
          color={isPlaying ? '#ffc890' : '#a86848'}
          emissive={isPlaying ? '#ff7028' : '#b04018'}
          emissiveIntensity={isPlaying ? 0.7 : 0.35}
          roughness={0.52}
          toneMapped={false}
        />
      </mesh>

      {/* Center spindle hole */}
      <mesh position={[0, 0.0105, 0]}>
        <cylinderGeometry args={[0.004, 0.004, 0.003, 16]} />
        <meshStandardMaterial color="#000000" />
      </mesh>

      {/* Title text laid flat on the label */}
      {title && (
        <Text
          position={[0, 0.011, -0.024]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.0095}
          color="#1a0a02"
          anchorX="center"
          anchorY="middle"
          maxWidth={0.085}
        >
          {title}
        </Text>
      )}
      {artist && (
        <Text
          position={[0, 0.011, 0.022]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.008}
          color="#28100a"
          anchorX="center"
          anchorY="middle"
          maxWidth={0.085}
        >
          {artist}
        </Text>
      )}
      {!title && (
        <Text
          position={[0, 0.011, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.0085}
          color="#3a1810"
          anchorX="center"
          anchorY="middle"
        >
          offline
        </Text>
      )}
    </group>
  )
}
