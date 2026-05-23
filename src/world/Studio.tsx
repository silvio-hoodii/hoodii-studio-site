'use client'

import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useState } from 'react'
import type * as THREE from 'three'
import { Desk } from './Desk'
import { DownLight } from './light/DownLight'
import { WindowLight } from './light/WindowLight'
import { Lamp } from './objects/Lamp'
import { Pipeline } from './postfx/Pipeline'
import { Room } from './Room'
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

// Top-level R3F Canvas. Marks the client boundary for the entire world tree;
// every child (Room, Desk, Lamp, lights, PostFX) inherits client rendering
// transitively. No SSR for the canvas.
//
// Camera: parked slightly back from the desk at eye height (~1.55 m), 38° FOV
// for a cinematic-but-not-cramped feel. Week 3 wires the establishing dolly
// in via GSAP timeline, starting from a doorway position and easing into
// this idle pose.
export function Studio() {
  usePrefersReducedMotionSync()
  const [skyMesh, setSkyMesh] = useState<THREE.Mesh | null>(null)

  return (
    <Canvas
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 1.6]}
      camera={{ position: [0, 1.55, 3.4], fov: 38, near: 0.05, far: 50 }}
      style={{ position: 'fixed', inset: 0 }}
    >
      <color attach="background" args={['#08090b']} />
      <fog attach="fog" args={['#08090b', 6, 14]} />

      <ambientLight intensity={0.12} color="#8a93a0" />

      <Suspense fallback={null}>
        <CameraRig />
        <Room onSkyMounted={setSkyMesh} />
        <Desk />
        <Lamp />
        <DownLight />
        <WindowLight />
        {skyMesh && <Pipeline godRaysMesh={skyMesh} />}
      </Suspense>
    </Canvas>
  )
}
