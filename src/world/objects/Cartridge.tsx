'use client'

import { RoundedBox, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import type { PsnPayload } from '@/lib/fetchers'
import { useFocus } from '../state/useFocus'

type Props = {
  psn: PsnPayload | null
}

// PSN cartridge — chamfered cube on the right side of the desk, behind the
// vinyl. Gentle z + y oscillation (different axis from vinyl's Y spin) so
// the two objects don't read as the same motion. Face emissive in cool blue
// to contrast against the lamp's warm pool.
export function Cartridge({ psn }: Props) {
  const groupRef = useRef<THREE.Group>(null)
  const reducedMotion = useFocus((s) => s.prefersReducedMotion)
  const setHovered = useFocus((s) => s.setHovered)

  const game = psn?.game?.name?.slice(0, 22) ?? null
  const platform = psn?.game?.platform ?? null

  useFrame((state) => {
    if (!groupRef.current) return
    const amplitudeZ = reducedMotion ? 0.04 : 0.09
    const amplitudeY = reducedMotion ? 0.03 : 0.07
    groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.5) * amplitudeZ
    groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.32) * amplitudeY
  })

  const label = game ? `LAST PLAYED / ${game}` : 'NO RECENT PLAY'

  return (
    <group
      ref={groupRef}
      position={[0.58, 0.83, -0.48]}
      name="cartridge"
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered('cartridge', label)
      }}
      onPointerOut={() => setHovered(null)}
    >
      {/* Body — chamfered cube */}
      <RoundedBox args={[0.13, 0.17, 0.05]} radius={0.008} smoothness={4}>
        <meshStandardMaterial color="#1a1a1f" roughness={0.4} metalness={0.55} />
      </RoundedBox>

      {/* Emissive face panel, proud of the body */}
      <mesh position={[0, 0, 0.026]}>
        <planeGeometry args={[0.105, 0.145]} />
        <meshStandardMaterial
          color="#1a3845"
          emissive="#50a8cc"
          emissiveIntensity={0.85}
          roughness={0.4}
          metalness={0}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Game name */}
      {game && (
        <Text
          position={[0, 0.02, 0.028]}
          fontSize={0.011}
          color="#e8f4ff"
          anchorX="center"
          anchorY="middle"
          maxWidth={0.09}
        >
          {game}
        </Text>
      )}
      {platform && (
        <Text
          position={[0, -0.055, 0.028]}
          fontSize={0.008}
          color="#8ac0d8"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.12}
        >
          {platform.toUpperCase()}
        </Text>
      )}
      {!game && (
        <Text
          position={[0, 0, 0.028]}
          fontSize={0.01}
          color="#5a8090"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.12}
          maxWidth={0.09}
        >
          NO RECENT PLAY
        </Text>
      )}
    </group>
  )
}
