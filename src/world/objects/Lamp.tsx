'use client'

import { useFocus } from '../state/useFocus'

// Procedural lamp — base cylinder + vertical post + bent arm + truncated-cone
// head + emissive bulb sphere. v1 is static; Week 3 wires hover (engraving
// plate fades in) and click (camera dollies, IdentityPanel opens) per the
// interaction state machine in the design doc.
//
// Geometry scaled ~1.7x from first-pass v0 so the lamp reads as the
// protagonist of the composition rather than a pinpoint. A small warm
// pointLight at the bulb position edge-lights the post + arm so they
// silhouette against the cool wall behind.

export function Lamp() {
  const metalDark = '#6a6e72'
  const metalArm = '#8a8e92'
  const setHovered = useFocus((s) => s.setHovered)

  return (
    <group
      position={[-0.55, 0.74, -0.4]}
      name="lamp"
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered('lamp', 'OPERATED BY / silvio neyra')
      }}
      onPointerOut={() => setHovered(null)}
    >
      {/* Base — flat cylinder */}
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.11, 0.13, 0.08, 28]} />
        <meshStandardMaterial color={metalDark} roughness={0.32} metalness={0.85} />
      </mesh>

      {/* Vertical post */}
      <mesh position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.018, 0.022, 0.48, 16]} />
        <meshStandardMaterial color={metalArm} roughness={0.38} metalness={0.78} />
      </mesh>

      {/* Bent arm (angled forward toward desk-front) */}
      <mesh position={[0.16, 0.6, 0]} rotation={[0, 0, -Math.PI / 4]}>
        <cylinderGeometry args={[0.016, 0.016, 0.38, 16]} />
        <meshStandardMaterial color={metalArm} roughness={0.38} metalness={0.78} />
      </mesh>

      {/* Head — truncated cone aimed down-and-forward */}
      <mesh position={[0.36, 0.7, 0]} rotation={[0, 0, -Math.PI / 2.05]}>
        <cylinderGeometry args={[0.07, 0.13, 0.15, 28]} />
        <meshStandardMaterial color={metalDark} roughness={0.32} metalness={0.85} />
      </mesh>

      {/* Emissive bulb — warm sphere inside the head opening */}
      <mesh position={[0.43, 0.665, 0]}>
        <sphereGeometry args={[0.055, 28, 18]} />
        <meshStandardMaterial
          color="#ffe2bb"
          emissive="#ffae50"
          emissiveIntensity={1.6}
          roughness={0.2}
          metalness={0}
          toneMapped={false}
        />
      </mesh>

      {/* Warm omnidirectional fill from the bulb position — edge-lights the
          lamp body so the post + arm + head silhouette against the wall.
          Small distance so it doesn't bleed into the rest of the room. */}
      <pointLight
        position={[0.43, 0.665, 0]}
        intensity={1.1}
        color="#ff9038"
        distance={0.85}
        decay={1.5}
      />
    </group>
  )
}
