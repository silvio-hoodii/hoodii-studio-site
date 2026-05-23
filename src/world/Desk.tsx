import { RoundedBox } from '@react-three/drei'

// 1.6 m wide x 0.7 m deep x 0.74 m tall, centered slightly back at z=-0.4
// so the camera lands comfortably in front of it during the establishing
// dolly (Week 3 wires the dolly itself).
export function Desk() {
  const topColor = '#a3a8ad'
  const sideColor = '#3d4044'

  return (
    <group position={[0, 0, -0.4]}>
      {/* Top — beveled, brushed-metal PBR (high metalness, low roughness) */}
      <RoundedBox
        args={[1.6, 0.04, 0.7]}
        radius={0.008}
        smoothness={3}
        position={[0, 0.74, 0]}
      >
        <meshStandardMaterial color={topColor} roughness={0.3} metalness={0.78} />
      </RoundedBox>

      {/* Front skirt */}
      <mesh position={[0, 0.55, 0.32]}>
        <boxGeometry args={[1.55, 0.32, 0.025]} />
        <meshStandardMaterial color={sideColor} roughness={0.78} metalness={0.42} />
      </mesh>
      {/* Back skirt */}
      <mesh position={[0, 0.55, -0.32]}>
        <boxGeometry args={[1.55, 0.32, 0.025]} />
        <meshStandardMaterial color={sideColor} roughness={0.78} metalness={0.42} />
      </mesh>
      {/* Left leg */}
      <mesh position={[-0.75, 0.36, 0]}>
        <boxGeometry args={[0.04, 0.72, 0.65]} />
        <meshStandardMaterial color={sideColor} roughness={0.78} metalness={0.42} />
      </mesh>
      {/* Right leg */}
      <mesh position={[0.75, 0.36, 0]}>
        <boxGeometry args={[0.04, 0.72, 0.65]} />
        <meshStandardMaterial color={sideColor} roughness={0.78} metalness={0.42} />
      </mesh>
    </group>
  )
}
