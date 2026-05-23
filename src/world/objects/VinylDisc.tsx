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

// Vinyl record displayed on edge — like a stylized record standing on the
// desk, face toward the camera. Spinning flat would lose almost all screen
// area at this camera angle, so the v1 pose is vertical for legibility.
// Spin axis is local Z (which aligns with world Z after the +X 90° pose
// rotation), so the disc rotates face-on like a wheel of fortune.
//
// Label drei <Text> stays put on the face. Idle pulse is via emissive
// strength + slight scale wobble when Spotify is not playing.
export function VinylDisc({ spotify }: Props) {
  const spinRef = useRef<THREE.Group>(null)
  const reducedMotion = useFocus((s) => s.prefersReducedMotion)
  const setHovered = useFocus((s) => s.setHovered)

  const isPlaying = Boolean(spotify?.isPlaying)
  const title = spotify?.title?.slice(0, 22) ?? null
  const artist = spotify?.artist?.slice(0, 22) ?? null

  useFrame((state, delta) => {
    if (!spinRef.current) return
    const speed = reducedMotion ? 0.04 : isPlaying ? 0.22 : 0.08
    spinRef.current.rotation.z += speed * delta

    if (!isPlaying) {
      // Soft idle pulse — gentle scale breath when offline
      const amp = reducedMotion ? 0.005 : 0.012
      const s = 1 + Math.sin(state.clock.elapsedTime * 1.2) * amp
      spinRef.current.scale.setScalar(s)
    } else if (spinRef.current.scale.x !== 1) {
      spinRef.current.scale.setScalar(1)
    }
  })

  const label = isPlaying
    ? `NOW PLAYING / ${title ?? '—'} · ${artist ?? '—'}`
    : title
      ? `LAST PLAYED / ${title} · ${artist ?? '—'}`
      : 'OFFLINE'

  return (
    <group
      position={[0.22, 0.91, -0.45]}
      rotation={[Math.PI / 2, 0, 0]}
      name="vinyl"
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered('vinyl', label)
      }}
      onPointerOut={() => setHovered(null)}
    >
      <group ref={spinRef}>
        {/* Disc — main cylinder, now standing on edge */}
        <mesh>
          <cylinderGeometry args={[0.14, 0.14, 0.014, 64]} />
          <meshStandardMaterial color="#1c1c20" roughness={0.42} metalness={0.55} />
        </mesh>

        {/* Subtle outer ring catches highlight from the warm pool */}
        <mesh position={[0, 0.0075, 0]}>
          <ringGeometry args={[0.108, 0.138, 64]} />
          <meshStandardMaterial
            color="#4a4a52"
            roughness={0.34}
            metalness={0.68}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, -0.0075, 0]} rotation={[Math.PI, 0, 0]}>
          <ringGeometry args={[0.108, 0.138, 64]} />
          <meshStandardMaterial
            color="#4a4a52"
            roughness={0.34}
            metalness={0.68}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Front label — warm emissive amber, brighter when playing */}
        <mesh position={[0, 0.008, 0]}>
          <cylinderGeometry args={[0.058, 0.058, 0.001, 32]} />
          <meshStandardMaterial
            color={isPlaying ? '#ffc890' : '#a86848'}
            emissive={isPlaying ? '#ff7028' : '#b04018'}
            emissiveIntensity={isPlaying ? 0.85 : 0.42}
            roughness={0.52}
            toneMapped={false}
          />
        </mesh>
        {/* Back label (mirror, simpler) */}
        <mesh position={[0, -0.008, 0]} rotation={[Math.PI, 0, 0]}>
          <cylinderGeometry args={[0.058, 0.058, 0.001, 32]} />
          <meshStandardMaterial
            color={isPlaying ? '#ffc890' : '#a86848'}
            emissive={isPlaying ? '#ff7028' : '#b04018'}
            emissiveIntensity={isPlaying ? 0.55 : 0.25}
            roughness={0.52}
            toneMapped={false}
          />
        </mesh>

        {/* Title text on the face — disc is now in XZ plane, face toward +Y
            (which in world is +Z after the parent rotation, i.e. toward
            camera). Text is rotated to lay on the face. */}
        {title && (
          <Text
            position={[0, 0.009, -0.025]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.011}
            color="#1a0a02"
            anchorX="center"
            anchorY="middle"
            maxWidth={0.1}
          >
            {title}
          </Text>
        )}
        {artist && (
          <Text
            position={[0, 0.009, 0.023]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.0085}
            color="#28100a"
            anchorX="center"
            anchorY="middle"
            maxWidth={0.1}
          >
            {artist}
          </Text>
        )}
        {!title && (
          <Text
            position={[0, 0.009, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.009}
            color="#3a1810"
            anchorX="center"
            anchorY="middle"
          >
            offline
          </Text>
        )}
      </group>
    </group>
  )
}
