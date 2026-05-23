import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

// Warm spot anchored at the lamp head position, aimed down-and-forward at
// the desk-top. Bloomed via PostFX. No shadow casting in v1 — the perf
// budget allocates draw calls to god-rays and bloom instead.
export function DownLight() {
  const ref = useRef<THREE.SpotLight>(null!)
  const target = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    target.position.set(-0.05, 0.74, -0.25)
    target.updateMatrixWorld()
    if (ref.current) ref.current.target = target
  }, [target])

  return (
    <>
      <primitive object={target} />
      <spotLight
        ref={ref}
        position={[-0.32, 1.18, -0.4]}
        angle={0.85}
        penumbra={0.9}
        intensity={9}
        color="#ffb573"
        distance={3.4}
        decay={1.6}
      />
    </>
  )
}
