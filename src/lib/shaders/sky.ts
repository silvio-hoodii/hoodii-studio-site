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
  precision highp float;

  uniform float uTime;
  varying vec2 vUv;

  // Mobile-safe hash. The classic fract(sin(...) * 43758) approach breaks
  // on many mobile GPUs because sin() at large inputs has low precision.
  // This version uses only fract + multiply + dot, which is stable across
  // desktop, iOS, and Android.
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // Building skyline: divide the window width into columns of varying widths
  // (each column is one building). Each column has a hash-based height. Adjacent
  // columns can be very different heights for a jagged skyline.
  //
  // Returns the building height at this x coordinate, in normalized [0, 1] sky
  // space.
  float skylineHeight(float x) {
    // Three overlapping building layers at different scales for parallax feel
    // — front-most layer dominates, but back layers peek through the gaps.
    float col1 = floor(x * 11.0);
    float h1 = 0.06 + hash(vec2(col1, 0.0)) * 0.22;

    float col2 = floor(x * 17.0 + 0.31);
    float h2 = 0.04 + hash(vec2(col2, 5.0)) * 0.14;

    return max(h1, h2);
  }

  // Per-column rim glow: brightens the very top edge of each building
  // silhouette so the skyline reads as buildings against light, not as a
  // black mask.
  float topEdgeGlow(vec2 uv, float h) {
    return smoothstep(0.0, 0.012, h - uv.y) * smoothstep(0.025, 0.0, h - uv.y);
  }

  // Window lights inside the building silhouette. Grid of small squares;
  // each cell has a hash deciding if it's lit + which color.
  vec3 windowLight(vec2 uv, float skylineH) {
    if (uv.y > skylineH - 0.004) return vec3(0.0);
    if (uv.y < 0.018) return vec3(0.0); // no windows at street level

    vec2 grid = vec2(58.0, 44.0);
    vec2 cell = floor(uv * grid);
    vec2 cellFrac = fract(uv * grid);

    float h = hash(cell);
    if (h < 0.62) return vec3(0.0);

    // Inside the central rectangle of the cell (window shape, not whole cell)
    float inWindow =
      step(0.18, cellFrac.x) * step(cellFrac.x, 0.82) *
      step(0.28, cellFrac.y) * step(cellFrac.y, 0.82);
    if (inWindow < 0.5) return vec3(0.0);

    // Color: mostly warm interior light, occasional cool monitor-glow
    vec3 warm = vec3(1.0, 0.74, 0.42);
    vec3 cool = vec3(0.6, 0.78, 1.0);
    vec3 color = mix(warm, cool, step(0.88, h));

    // Intensity per-window, ~70-130%
    float intensity = 0.7 + hash(cell + vec2(13.0, 7.0)) * 0.6;
    return color * intensity;
  }

  void main() {
    vec3 top = vec3(0.46, 0.52, 0.68);     // dusty navy above
    vec3 mid = vec3(0.85, 0.65, 0.48);     // warm haze midband
    vec3 horizon = vec3(1.0, 0.55, 0.22);  // sunset orange smear at horizon
    vec3 silhouette = vec3(0.025, 0.03, 0.06);

    float drift = sin(uTime * 0.015 + vUv.y * 3.2) * 0.018;
    float y = vUv.y + drift;

    // Sky gradient — always computed, blended underneath buildings
    vec3 sky;
    if (y < 0.32) {
      sky = mix(horizon, mid, smoothstep(0.0, 0.32, y));
    } else if (y < 0.55) {
      sky = mix(mid, top * 1.1, smoothstep(0.32, 0.55, y));
    } else {
      sky = mix(top * 1.1, top * 0.9, smoothstep(0.55, 1.0, y));
    }

    // Building silhouette
    float skyH = skylineHeight(vUv.x);
    float inBuilding = step(vUv.y, skyH);

    // Composite layers
    vec3 col = mix(sky, silhouette, inBuilding);

    // Top-edge rim glow (subtle warm halo on roofline against the bright sky)
    col += vec3(1.0, 0.6, 0.3) * topEdgeGlow(vUv, skyH) * 0.35;

    // Window lights on top
    col += windowLight(vUv, skyH);

    // Brightness boost so window reads as the GodRays source
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
