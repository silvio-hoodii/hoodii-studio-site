// Procedural lamp — base cylinder + vertical post + bent arm + truncated-cone
// head + emissive bulb sphere. v1 is static; Week 3 wires hover (engraving
// plate fades in) and click (camera dollies, IdentityPanel opens) per the
// interaction state machine in the design doc.
//
// Coordinates relative to desk-top (y = 0.74), sitting on the left side of
// the desk so it casts a warm pool of light over the working surface.
export function Lamp() {
  const metalDark = '#4a4e52'
  const metalArm = '#6a6e72'

  return (
    <group position={[-0.55, 0.74, -0.4]} name="lamp">
      {/* Base — flat cylinder */}
      <mesh position={[0, 0.025, 0]}>
        <cylinderGeometry args={[0.07, 0.085, 0.05, 24]} />
        <meshStandardMaterial color={metalDark} roughness={0.34} metalness={0.82} />
      </mesh>

      {/* Vertical post */}
      <mesh position={[0, 0.19, 0]}>
        <cylinderGeometry args={[0.012, 0.014, 0.28, 16]} />
        <meshStandardMaterial color={metalArm} roughness={0.4} metalness={0.75} />
      </mesh>

      {/* Bent arm (angled forward toward desk-front) */}
      <mesh position={[0.11, 0.36, 0]} rotation={[0, 0, -Math.PI / 4]}>
        <cylinderGeometry args={[0.011, 0.011, 0.24, 16]} />
        <meshStandardMaterial color={metalArm} roughness={0.4} metalness={0.75} />
      </mesh>

      {/* Head — truncated cone aimed down-and-forward */}
      <mesh position={[0.23, 0.42, 0]} rotation={[0, 0, -Math.PI / 2.05]}>
        <cylinderGeometry args={[0.05, 0.085, 0.1, 24]} />
        <meshStandardMaterial color={metalDark} roughness={0.34} metalness={0.82} />
      </mesh>

      {/* Emissive bulb — small warm sphere inside the head opening */}
      <mesh position={[0.27, 0.4, 0]}>
        <sphereGeometry args={[0.034, 24, 16]} />
        <meshStandardMaterial
          color="#ffdfb1"
          emissive="#ffb55b"
          emissiveIntensity={1.2}
          roughness={0.2}
          metalness={0}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
