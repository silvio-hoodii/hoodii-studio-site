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

  // Pseudo-random hash — gives an irregular cityscape light scatter that
  // doesn't read as a repeating grid pattern.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // City-light scatter near the horizon. Cells in a coarse grid; each cell
  // either has a light or doesn't, based on a hash. Light position within
  // the cell is also randomized so lights don't sit on a regular line.
  float buildingLights(vec2 p) {
    vec2 cellSize = vec2(20.0, 14.0);
    vec2 cell = floor(p * cellSize);
    vec2 cellFrac = fract(p * cellSize);
    float h = hash(cell);
    if (h < 0.62) return 0.0;
    vec2 lightPos = vec2(hash(cell + vec2(1.0, 0.0)), hash(cell + vec2(0.0, 3.0)));
    float d = distance(cellFrac, lightPos);
    // Brighter, larger dots so they read from camera distance
    return smoothstep(0.32, 0.08, d) * (0.4 + h * 0.7);
  }

  void main() {
    vec3 top = vec3(0.62, 0.7, 0.82);      // cool slate above
    vec3 mid = vec3(0.78, 0.78, 0.74);     // pale haze midband
    vec3 horizon = vec3(0.55, 0.45, 0.38); // warm dusk smear at horizon line
    vec3 ground = vec3(0.04, 0.05, 0.09);  // near-black ground / cityscape

    float drift = sin(uTime * 0.015 + vUv.y * 3.2) * 0.025;
    float y = vUv.y + drift;

    vec3 col;
    if (y < 0.28) {
      // Below horizon: dark ground with scattered warm + occasional cool window lights
      float light = buildingLights(vUv);
      vec3 lightColor = mix(
        vec3(1.0, 0.74, 0.42),
        vec3(0.7, 0.85, 1.0),
        step(0.5, sin(vUv.x * 23.0))
      );
      col = ground + lightColor * light * 1.8;
    } else if (y < 0.42) {
      // Horizon band: warm dusk transitioning up to pale mid sky
      col = mix(horizon, mid, smoothstep(0.28, 0.42, y));
    } else {
      // Upper sky: pale mid → cool slate top
      col = mix(mid, top, smoothstep(0.42, 1.0, y));
    }

    // Light brightness boost so the window reads as the GodRays source
    col *= 1.08;

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
