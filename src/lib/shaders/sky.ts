import * as THREE from 'three'

// v3 sky: pre-rendered Canvas2D texture, sampled by a trivial shader.
//
// Why not GLSL anymore: the procedural GLSL approach (hash-based skyline +
// window lights) silently broke on mobile WebGL — sin-based hashes lose
// precision, mediump defaults clip colors past 1.0 to white, etc. Operator
// on a phone saw a "faded white canvas" the entire time the desktop
// agent-browser was showing a perfect cityscape.
//
// By drawing the entire cityscape once in JS via Canvas2D and handing it
// to Three.js as a CanvasTexture, the shader's only job is to sample a
// texture. Mobile GPUs can't get sampling wrong the way they can get
// procedural math wrong. Texture is generated at module init and lives
// at module scope (same singleton pattern as the uniforms).

const TEX_W = 1024
const TEX_H = 720

// Deterministic pseudo-random — same skyline on every reload. JS-side so
// precision is the same on every device.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return function () {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function drawCityscape(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  // TS can't narrow ctx through nested closures — capture as non-null local
  const g = ctx

  // Sky gradient: warm sunset orange at horizon → cool dusty navy above
  const sky = g.createLinearGradient(0, 0, 0, TEX_H)
  sky.addColorStop(0.0, '#4d5a82') // dusty navy top
  sky.addColorStop(0.32, '#8e7a78') // muted mauve mid-upper
  sky.addColorStop(0.55, '#d68a52') // warm haze
  sky.addColorStop(0.74, '#ff8030') // sunset orange smear
  sky.addColorStop(0.82, '#a04020') // warm hot band right above horizon
  sky.addColorStop(0.86, '#1a1820') // ground/silhouette base
  sky.addColorStop(1.0, '#0a0c14')
  g.fillStyle = sky
  g.fillRect(0, 0, TEX_W, TEX_H)

  // Cityscape — three layers for parallax depth.
  const rand = mulberry32(1729)

  type Layer = {
    color: string
    minW: number
    maxW: number
    minH: number
    maxH: number
    baseY: number // pixels from bottom of texture
  }

  // Back layer — small, far, lighter silhouette (atmospheric haze)
  const backLayer: Layer = {
    color: '#241e26',
    minW: 24,
    maxW: 64,
    minH: 50,
    maxH: 110,
    baseY: 72,
  }
  // Mid layer
  const midLayer: Layer = {
    color: '#10101a',
    minW: 36,
    maxW: 88,
    minH: 90,
    maxH: 170,
    baseY: 40,
  }
  // Front layer — biggest, darkest, closest
  const frontLayer: Layer = {
    color: '#06080e',
    minW: 50,
    maxW: 120,
    minH: 110,
    maxH: 220,
    baseY: 0,
  }

  function drawLayer(layer: Layer): void {
    g.fillStyle = layer.color
    let x = -10
    while (x < TEX_W + 20) {
      const w = layer.minW + rand() * (layer.maxW - layer.minW)
      const h = layer.minH + rand() * (layer.maxH - layer.minH)
      const y = TEX_H - layer.baseY - h
      g.fillRect(x, y, w, h)

      // Window lights — small bright rects inside the silhouette,
      // only in mid + front layers (back layer too far to show windows).
      if (layer === midLayer || layer === frontLayer) {
        const winSize = layer === frontLayer ? 4 : 3
        const winSpacingX = layer === frontLayer ? 12 : 9
        const winSpacingY = layer === frontLayer ? 14 : 11
        for (let wy = y + 12; wy < y + h - 6; wy += winSpacingY) {
          for (let wx = x + 6; wx < x + w - 6; wx += winSpacingX) {
            // Random gating — most windows unlit
            const r = rand()
            if (r < 0.6) continue
            // Warm interior light vs cool monitor blue
            const isCool = r > 0.94
            g.fillStyle = isCool
              ? `rgba(150, 200, 255, ${0.7 + rand() * 0.3})`
              : `rgba(255, 200, 110, ${0.7 + rand() * 0.3})`
            g.fillRect(wx, wy, winSize, winSize)
          }
        }
        g.fillStyle = layer.color
      }

      x += w - 2 // slight overlap between buildings
    }
  }

  drawLayer(backLayer)
  drawLayer(midLayer)
  drawLayer(frontLayer)

  // Soft warm bloom along the rooflines of the FRONT layer
  g.globalCompositeOperation = 'screen'
  const bloom = g.createLinearGradient(0, TEX_H - 240, 0, TEX_H - 100)
  bloom.addColorStop(0, 'rgba(0,0,0,0)')
  bloom.addColorStop(1, 'rgba(255, 130, 60, 0.18)')
  g.fillStyle = bloom
  g.fillRect(0, TEX_H - 240, TEX_W, 140)
  g.globalCompositeOperation = 'source-over'
}

// Lazy texture creation — first call paints the canvas + builds the
// CanvasTexture. Subsequent calls return the cached singleton.
let cachedTexture: THREE.CanvasTexture | null = null

function getSkyTexture(): THREE.CanvasTexture {
  if (cachedTexture) return cachedTexture
  if (typeof document === 'undefined') {
    // SSR fallback — return a 1x1 placeholder that will get replaced on client
    const placeholder = new THREE.CanvasTexture(new OffscreenCanvas(1, 1) as unknown as HTMLCanvasElement)
    return placeholder
  }
  const canvas = document.createElement('canvas')
  canvas.width = TEX_W
  canvas.height = TEX_H
  drawCityscape(canvas)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.needsUpdate = true
  cachedTexture = tex
  return tex
}

// Trivial fragment shader: sample texture, slight horizontal drift via
// uTime for ambient "alive" feel. No procedural math, no hash, no
// precision-sensitive operations. Renders identically on every WebGL
// device.
export const skyVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const skyFragmentShader = /* glsl */ `
  precision mediump float;
  uniform sampler2D uSky;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    uv.x += sin(uTime * 0.05) * 0.0015;
    gl_FragColor = texture2D(uSky, uv);
  }
`

export const skyUniforms = {
  uTime: { value: 0 },
  uSky: { value: null as THREE.Texture | null },
}

export function createSkyMaterial(): THREE.ShaderMaterial {
  skyUniforms.uSky.value = getSkyTexture()
  return new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    depthWrite: false,
  })
}
