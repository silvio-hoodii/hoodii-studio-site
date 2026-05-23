'use client'

import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useState } from 'react'
import type * as THREE from 'three'
import type { PsnPayload, SpotifyPayload } from '@/lib/fetchers'
import { Desk } from './Desk'
import { DownLight } from './light/DownLight'
import { WindowLight } from './light/WindowLight'
import { Cartridge } from './objects/Cartridge'
import { Lamp } from './objects/Lamp'
import { VinylDisc } from './objects/VinylDisc'
import { HoverProjector } from './overlay/HoverProjector'
import { Pipeline } from './postfx/Pipeline'
import { Room } from './Room'
import { useDataSources } from './state/useDataSources'
import { usePrefersReducedMotionSync } from './state/usePrefersReducedMotion'

// Camera idle pose: parked back from the desk, eye-height, gently angled to
// keep the back wall (and therefore the window) in frame. Week 3 will wrap
// this in a GSAP timeline (establishing dolly from doorway position into
// this pose, then a slow ambient orbit around the target).
function CameraRig() {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    camera.position.set(0, 1.65, 3.6)
    camera.lookAt(0, 1.4, -1)
    camera.updateProjectionMatrix()
  }, [camera])
  return null
}

type StudioProps = {
  initialSpotify: SpotifyPayload | null
  initialPsn: PsnPayload | null
}

export function Studio({ initialSpotify, initialPsn }: StudioProps) {
  usePrefersReducedMotionSync()
  const { spotify, psn } = useDataSources({ spotify: initialSpotify, psn: initialPsn })
  const [skyMesh, setSkyMesh] = useState<THREE.Mesh | null>(null)

  return (
    <Canvas
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 1.6]}
      camera={{ position: [0, 1.65, 3.6], fov: 38, near: 0.05, far: 50 }}
      style={{ position: 'fixed', inset: 0 }}
    >
      <color attach="background" args={['#08090b']} />
      <fog attach="fog" args={['#08090b', 6, 14]} />

      <ambientLight intensity={0.12} color="#8a93a0" />

      <Suspense fallback={null}>
        <CameraRig />
        <HoverProjector />
        <Room onSkyMounted={setSkyMesh} />
        <Desk />
        <Lamp />
        <VinylDisc spotify={spotify} />
        <Cartridge psn={psn} />
        <DownLight />
        <WindowLight />
        {skyMesh && <Pipeline godRaysMesh={skyMesh} />}
      </Suspense>
    </Canvas>
  )
}
