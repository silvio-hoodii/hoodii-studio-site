import * as THREE from 'three'

// Two-stop vertical gradient with a very slow horizontal drift. No sun,
// no time-of-day binding in v1 — uTime is wired but the visible output is
// nearly static. Week +1 will replace this with a sky-as-clock shader
// (per design doc accrete queue) that tracks local time at the operator
// location.
//
// SINGLETON UNIFORMS: skyUniforms lives at module scope so useFrame can
// mutate uTime.value without tripping react-hooks/immutability (which
// rejects mutation through any React hook return). Safe because the app
// only ever mounts one Room. If a multi-Room future arrives, refactor to
// per-instance uniforms with a different mutation path.

export const skyVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const skyFragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec3 top = vec3(0.68, 0.74, 0.83);
    vec3 bot = vec3(0.86, 0.84, 0.78);

    // Barely-visible horizontal drift, keeps the window feeling alive
    float drift = sin(uTime * 0.015 + vUv.y * 3.2) * 0.035;

    vec3 col = mix(bot, top, smoothstep(0.0, 1.0, vUv.y + drift));

    // Light brightness boost — the window reads as the source for GodRays
    // without blowing the rest of the scene out
    col *= 1.05;

    gl_FragColor = vec4(col, 1.0);
  }
`

export const skyUniforms = { uTime: { value: 0 } }

export function createSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    depthWrite: false,
    toneMapped: false,
  })
}
