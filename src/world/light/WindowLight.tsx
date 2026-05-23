import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

// Cool directional light coming through the back-wall window, aimed at the
// desk-front. Direction (not intensity) is what carries the volumetric
// god-rays look — PostFX picks up the bright sky plane as the godray source
// and produces the cone leaking into the room.
export function WindowLight() {
  const ref = useRef<THREE.DirectionalLight>(null!)
  const target = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    target.position.set(0.2, 0.5, 1.4)
    target.updateMatrixWorld()
    if (ref.current) ref.current.target = target
  }, [target])

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={ref}
        position={[0, 1.8, -2.85]}
        intensity={1.2}
        color="#d4dde6"
      />
    </>
  )
}
