import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

// Warm spot anchored at the lamp head position, aimed down-and-forward at
// the desk-top. Bloomed via PostFX. No shadow casting in v1 — the perf
// budget allocates draw calls to god-rays and bloom instead.
export function DownLight() {
  const ref = useRef<THREE.SpotLight>(null!)
  const target = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    // Aim at the desk-top area in front of the lamp (slightly right + forward)
    target.position.set(0.05, 0.74, -0.2)
    target.updateMatrixWorld()
    if (ref.current) ref.current.target = target
  }, [target])

  return (
    <>
      <primitive object={target} />
      <spotLight
        ref={ref}
        position={[-0.12, 1.42, -0.4]}
        angle={1.05}
        penumbra={0.86}
        intensity={22}
        color="#ffa860"
        distance={4.6}
        decay={1.4}
      />
    </>
  )
}
