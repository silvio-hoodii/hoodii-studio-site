import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { createConcreteMaterial } from '@/lib/shaders/concrete'
import {
  applyPhaseBlend,
  createSkyMaterial,
  getCalgaryHour,
  getPhaseBlend,
  type Phase,
} from '@/lib/shaders/sky'

// Room dimensions:
//   x: -3..3  (6 m wide)
//   y: 0..3   (3 m tall, no ceiling — keeps god-rays unobstructed)
//   z: -2..2  (4 m deep, camera occupies +z front)
// Window cutout in back wall (z = -2):
//   x: -0.9..0.9 (1.8 m), y: 1.1..2.5 (1.4 m)
// Sky plane sits 1 m behind the back wall at z = -3.

type RoomProps = {
  onSkyMounted: (mesh: THREE.Mesh) => void
}

export function Room({ onSkyMounted }: RoomProps) {
  const wallMaterial = useMemo(
    () => createConcreteMaterial({ color: '#a4a5a6', repeat: [2, 1] }),
    [],
  )
  const floorMaterial = useMemo(
    () => createConcreteMaterial({ color: '#86888a', repeat: [3, 2], normalScale: 0.55 }),
    [],
  )
  const baseboardMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#3a3c3f',
        roughness: 0.38,
        metalness: 0.62,
      }),
    [],
  )

  // useState lazy init gives a stable ShaderMaterial reference across renders.
  // The crossfade uniforms are mutated through the module-scope skyUniforms
  // (see sky.ts) so useFrame doesn't trip react-hooks/immutability.
  const [skyMaterial] = useState(createSkyMaterial)

  const skyRef = useRef<THREE.Mesh>(null)

  useEffect(() => {
    if (skyRef.current) onSkyMounted(skyRef.current)
  }, [onSkyMounted])

  // Sky-as-clock tick: refresh the (A, B, blend) phase tuple once per
  // minute from real Calgary local time. setInterval is fine here because
  // the uniforms are module-scope and the shader reads them every frame
  // anyway — no React re-render needed.
  //
  // Debug: `?phase=dawn|day|dusk|night` URL param overrides the time-based
  // selection (no tick, fixed phase). Useful for visual review of all four
  // phases without waiting hours.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const override = params.get('phase') as Phase | null
    const PHASES: Phase[] = ['dawn', 'day', 'dusk', 'night']
    if (override && PHASES.includes(override)) {
      applyPhaseBlend({ a: override, b: override, blend: 0 })
      return
    }
    const tick = () => applyPhaseBlend(getPhaseBlend(getCalgaryHour()))
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} material={floorMaterial}>
        <planeGeometry args={[6, 4]} />
      </mesh>

      {/* Brushed-metal baseboard along back + sides */}
      <mesh position={[0, 0.05, -1.99]} material={baseboardMaterial}>
        <boxGeometry args={[6, 0.1, 0.02]} />
      </mesh>
      <mesh position={[-2.99, 0.05, 0]} material={baseboardMaterial}>
        <boxGeometry args={[0.02, 0.1, 4]} />
      </mesh>
      <mesh position={[2.99, 0.05, 0]} material={baseboardMaterial}>
        <boxGeometry args={[0.02, 0.1, 4]} />
      </mesh>

      {/* Back wall (4 panels around the window cutout) */}
      {/* Top: full width, y 2.5..3 */}
      <mesh position={[0, 2.75, -2]} material={wallMaterial}>
        <planeGeometry args={[6, 0.5]} />
      </mesh>
      {/* Bottom: full width, y 0.1..1.1 (above baseboard) */}
      <mesh position={[0, 0.6, -2]} material={wallMaterial}>
        <planeGeometry args={[6, 1.0]} />
      </mesh>
      {/* Left side of window */}
      <mesh position={[-1.95, 1.8, -2]} material={wallMaterial}>
        <planeGeometry args={[2.1, 1.4]} />
      </mesh>
      {/* Right side of window */}
      <mesh position={[1.95, 1.8, -2]} material={wallMaterial}>
        <planeGeometry args={[2.1, 1.4]} />
      </mesh>

      {/* Window jamb — thin metal frame around the cutout for sci-fi crispness */}
      <mesh position={[0, 2.52, -1.99]} material={baseboardMaterial}>
        <boxGeometry args={[1.86, 0.04, 0.03]} />
      </mesh>
      <mesh position={[0, 1.08, -1.99]} material={baseboardMaterial}>
        <boxGeometry args={[1.86, 0.04, 0.03]} />
      </mesh>
      <mesh position={[-0.92, 1.8, -1.99]} material={baseboardMaterial}>
        <boxGeometry args={[0.04, 1.48, 0.03]} />
      </mesh>
      <mesh position={[0.92, 1.8, -1.99]} material={baseboardMaterial}>
        <boxGeometry args={[0.04, 1.48, 0.03]} />
      </mesh>

      {/* Side walls */}
      <mesh
        position={[-3, 1.55, 0]}
        rotation={[0, Math.PI / 2, 0]}
        material={wallMaterial}
      >
        <planeGeometry args={[4, 2.9]} />
      </mesh>
      <mesh
        position={[3, 1.55, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        material={wallMaterial}
      >
        <planeGeometry args={[4, 2.9]} />
      </mesh>

      {/* Sky plane behind the window — emissive enough to source GodRays */}
      <mesh ref={skyRef} position={[0, 1.8, -3]} material={skyMaterial} name="sky">
        <planeGeometry args={[3.4, 2.4]} />
      </mesh>
    </group>
  )
}
