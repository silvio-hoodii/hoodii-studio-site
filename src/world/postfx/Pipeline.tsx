import { Bloom, EffectComposer, GodRays, Noise, Vignette } from '@react-three/postprocessing'
import { BlendFunction, KernelSize } from 'postprocessing'
import type * as THREE from 'three'

// Stack order matters: Bloom first so the bulb + sky glow contribute to
// god-rays input, GodRays second from the sky plane, then a darkening
// Vignette and a faint film grain (~2% opacity) to anchor the sci-fi mood.
//
// God-rays kill-switch is the first knob if perf misses 60fps on M1 (per
// design doc risk register: god-rays > bloom > second light, in that order).
type PipelineProps = {
  godRaysMesh: THREE.Mesh
}

export function Pipeline({ godRaysMesh }: PipelineProps) {
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={0.32}
        luminanceThreshold={0.92}
        luminanceSmoothing={0.16}
        kernelSize={KernelSize.LARGE}
        mipmapBlur
      />
      <GodRays
        sun={godRaysMesh}
        samples={48}
        density={0.94}
        decay={0.93}
        weight={0.12}
        exposure={0.08}
        clampMax={0.45}
        blur
        blendFunction={BlendFunction.SCREEN}
      />
      <Vignette eskil={false} offset={0.25} darkness={0.7} />
      <Noise opacity={0.022} blendFunction={BlendFunction.OVERLAY} />
    </EffectComposer>
  )
}
