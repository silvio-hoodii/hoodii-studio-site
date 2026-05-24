import * as THREE from 'three'

// Sky-as-clock: 4 pre-painted Canvas2D textures (dawn / day / dusk / night)
// sampled by a trivial crossfade shader. JS code updates which two textures
// are blended + the blend factor based on real Calgary local time. Per
// 2026-05-23 design doc "more API life" v1.
//
// Why pre-painted textures instead of a single tinted texture: tinting a
// warm-orange dusk gradient toward cold blue looks muddy. Pre-painting
// each phase preserves the gradient structure native to that time of day.
//
// Why CanvasTexture instead of procedural GLSL: previous procedural GLSL
// approach silently broke on mobile WebGL (sin-based hashes lose
// precision, mediump clips colors past 1.0 to white). Canvas2D + texture
// sampling renders identically on every device.

const TEX_W = 1024
const TEX_H = 720

// Deterministic pseudo-random — same skyline outline across all four
// phase textures so they overlay pixel-perfect when crossfaded.
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

export type Phase = 'dawn' | 'day' | 'dusk' | 'night'
const PHASES: readonly Phase[] = ['dawn', 'day', 'dusk', 'night'] as const

// Per-phase visual config: sky gradient stops + cityscape coloring.
type PhaseConfig = {
  // 7-stop linear gradient from top (y=0) to bottom (y=TEX_H)
  skyStops: readonly [number, string][]
  // 0..1, fraction of candidate window cells that LIGHT UP (rest are dark)
  windowLitFraction: number
  // Mix of warm/cool windows: 0 = all warm, 1 = all cool
  windowCoolMix: number
  // Building silhouette tint multiplier — RGB applied to base building color
  // (1,1,1 = no tint). Day buildings get a slight blue ambient; night go pure
  // black.
  buildingTint: readonly [number, number, number]
  // Optional warm bloom along the front-layer rooflines (intensity 0..1).
  // Dusk has the most; night has some (city heat); day/dawn have less.
  rooflineBloom: number
}

const PHASE_CONFIGS: Record<Phase, PhaseConfig> = {
  dawn: {
    skyStops: [
      [0.0, '#2a3551'],
      [0.32, '#7c6781'],
      [0.55, '#d99078'],
      [0.74, '#f4ad79'],
      [0.82, '#d8896a'],
      [0.86, '#241a26'],
      [1.0, '#0a0c14'],
    ],
    windowLitFraction: 0.05,
    windowCoolMix: 0.1,
    buildingTint: [0.8, 0.8, 1.0],
    rooflineBloom: 0.1,
  },
  day: {
    skyStops: [
      [0.0, '#5d7fa3'],
      [0.32, '#88a6c4'],
      [0.55, '#aac3da'],
      [0.74, '#c9d8e6'],
      [0.82, '#d6dee5'],
      [0.86, '#2a2a30'],
      [1.0, '#181820'],
    ],
    windowLitFraction: 0.02,
    windowCoolMix: 0.7,
    buildingTint: [0.95, 0.97, 1.05],
    rooflineBloom: 0.0,
  },
  dusk: {
    skyStops: [
      [0.0, '#4d5a82'],
      [0.32, '#8e7a78'],
      [0.55, '#d68a52'],
      [0.74, '#ff8030'],
      [0.82, '#a04020'],
      [0.86, '#1a1820'],
      [1.0, '#0a0c14'],
    ],
    windowLitFraction: 0.4,
    windowCoolMix: 0.06,
    buildingTint: [1.0, 1.0, 1.0],
    rooflineBloom: 0.18,
  },
  night: {
    skyStops: [
      [0.0, '#0a0e1f'],
      [0.32, '#101428'],
      [0.55, '#181a30'],
      [0.74, '#1a1c30'],
      [0.82, '#161a2a'],
      [0.86, '#080812'],
      [1.0, '#04050a'],
    ],
    windowLitFraction: 0.55,
    windowCoolMix: 0.14,
    buildingTint: [0.55, 0.55, 0.65],
    rooflineBloom: 0.12,
  },
}

function tintColor(hex: string, tint: readonly [number, number, number]): string {
  const r = parseInt(hex.slice(1, 3), 16) * tint[0]
  const g = parseInt(hex.slice(3, 5), 16) * tint[1]
  const b = parseInt(hex.slice(5, 7), 16) * tint[2]
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`
}

function drawCityscape(canvas: HTMLCanvasElement, config: PhaseConfig): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const g = ctx

  // Sky gradient
  const sky = g.createLinearGradient(0, 0, 0, TEX_H)
  for (const [stop, color] of config.skyStops) {
    sky.addColorStop(stop, color)
  }
  g.fillStyle = sky
  g.fillRect(0, 0, TEX_W, TEX_H)

  // Cityscape — three layers, same seed across all phases so silhouettes
  // overlay pixel-perfect when the shader crossfades.
  type Layer = {
    baseColor: string
    minW: number
    maxW: number
    minH: number
    maxH: number
    baseY: number
    hasWindows: boolean
  }

  const backLayer: Layer = {
    baseColor: '#241e26',
    minW: 24,
    maxW: 64,
    minH: 50,
    maxH: 110,
    baseY: 72,
    hasWindows: false,
  }
  const midLayer: Layer = {
    baseColor: '#10101a',
    minW: 36,
    maxW: 88,
    minH: 90,
    maxH: 170,
    baseY: 40,
    hasWindows: true,
  }
  const frontLayer: Layer = {
    baseColor: '#06080e',
    minW: 50,
    maxW: 120,
    minH: 110,
    maxH: 220,
    baseY: 0,
    hasWindows: true,
  }

  function drawLayer(layer: Layer, rng: () => number): void {
    const tintedBase = tintColor(layer.baseColor, config.buildingTint)
    g.fillStyle = tintedBase
    let x = -10
    while (x < TEX_W + 20) {
      const w = layer.minW + rng() * (layer.maxW - layer.minW)
      const h = layer.minH + rng() * (layer.maxH - layer.minH)
      const y = TEX_H - layer.baseY - h
      g.fillRect(x, y, w, h)

      // Window lights — bright rects inside the silhouette, only in mid +
      // front layers (back too far to show interior detail).
      if (layer.hasWindows) {
        const winSize = layer === frontLayer ? 4 : 3
        const winSpacingX = layer === frontLayer ? 12 : 9
        const winSpacingY = layer === frontLayer ? 14 : 11
        for (let wy = y + 12; wy < y + h - 6; wy += winSpacingY) {
          for (let wx = x + 6; wx < x + w - 6; wx += winSpacingX) {
            const r = rng()
            if (r > config.windowLitFraction) continue
            const isCool = rng() < config.windowCoolMix
            g.fillStyle = isCool
              ? `rgba(150, 200, 255, ${0.7 + rng() * 0.3})`
              : `rgba(255, 200, 110, ${0.7 + rng() * 0.3})`
            g.fillRect(wx, wy, winSize, winSize)
          }
        }
        g.fillStyle = tintedBase
      }

      x += w - 2
    }
  }

  // Each layer gets its own deterministic stream so per-phase windows don't
  // shift the building positions of subsequent layers.
  drawLayer(backLayer, mulberry32(1729))
  drawLayer(midLayer, mulberry32(8893))
  drawLayer(frontLayer, mulberry32(2411))

  // Soft warm bloom along front-layer rooflines (dusk + night = active)
  if (config.rooflineBloom > 0) {
    g.globalCompositeOperation = 'screen'
    const bloom = g.createLinearGradient(0, TEX_H - 240, 0, TEX_H - 100)
    bloom.addColorStop(0, 'rgba(0,0,0,0)')
    bloom.addColorStop(1, `rgba(255, 130, 60, ${config.rooflineBloom})`)
    g.fillStyle = bloom
    g.fillRect(0, TEX_H - 240, TEX_W, 140)
    g.globalCompositeOperation = 'source-over'
  }
}

// Lazy texture creation — first access paints + caches all four phase
// textures. SSR returns placeholders that get replaced once we're in a
// browser context.
let cachedTextures: Record<Phase, THREE.CanvasTexture> | null = null

function getPhaseTextures(): Record<Phase, THREE.CanvasTexture> {
  if (cachedTextures) return cachedTextures
  if (typeof document === 'undefined') {
    // SSR placeholders — 1x1 transparent. Client mount triggers a real
    // texture build via createSkyMaterial().
    const placeholder = () => {
      const tex = new THREE.CanvasTexture(
        new OffscreenCanvas(1, 1) as unknown as HTMLCanvasElement,
      )
      tex.colorSpace = THREE.SRGBColorSpace
      return tex
    }
    return { dawn: placeholder(), day: placeholder(), dusk: placeholder(), night: placeholder() }
  }
  const built: Partial<Record<Phase, THREE.CanvasTexture>> = {}
  for (const phase of PHASES) {
    const canvas = document.createElement('canvas')
    canvas.width = TEX_W
    canvas.height = TEX_H
    drawCityscape(canvas, PHASE_CONFIGS[phase])
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    tex.needsUpdate = true
    built[phase] = tex
  }
  cachedTextures = built as Record<Phase, THREE.CanvasTexture>
  return cachedTextures
}

// Time-of-day → (currentPhase, nextPhase, blend) tuple.
//
// Boundaries (1-hour crossfade band centered on each):
//   night→dawn at 04:30  (04:00..05:00)
//   dawn→day   at 07:00  (06:30..07:30)
//   day→dusk   at 17:30  (17:00..18:00)
//   dusk→night at 21:00  (20:30..21:30)
//
// `hour` is local-Calgary hours as a float (0..24).
export type PhaseBlend = { a: Phase; b: Phase; blend: number }

export function getPhaseBlend(hour: number): PhaseBlend {
  if (hour >= 4.0 && hour <= 5.0) return { a: 'night', b: 'dawn', blend: hour - 4.0 }
  if (hour >= 6.5 && hour <= 7.5) return { a: 'dawn', b: 'day', blend: hour - 6.5 }
  if (hour >= 17.0 && hour <= 18.0) return { a: 'day', b: 'dusk', blend: hour - 17.0 }
  if (hour >= 20.5 && hour <= 21.5) return { a: 'dusk', b: 'night', blend: hour - 20.5 }
  if (hour > 5.0 && hour < 6.5) return { a: 'dawn', b: 'dawn', blend: 0 }
  if (hour > 7.5 && hour < 17.0) return { a: 'day', b: 'day', blend: 0 }
  if (hour > 18.0 && hour < 20.5) return { a: 'dusk', b: 'dusk', blend: 0 }
  // hour < 4 or > 21.5 → night
  return { a: 'night', b: 'night', blend: 0 }
}

// Hour-as-float in Calgary local time. Uses Intl so DST handling is correct.
const CALGARY_HOUR_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Edmonton',
  hour: 'numeric',
  minute: 'numeric',
  hour12: false,
})

export function getCalgaryHour(now: Date = new Date()): number {
  const parts = CALGARY_HOUR_FORMATTER.formatToParts(now)
  const hourPart = parts.find((p) => p.type === 'hour')?.value ?? '0'
  const minutePart = parts.find((p) => p.type === 'minute')?.value ?? '0'
  // Intl can return "24" for midnight in en-US — normalize to 0
  const h = parseInt(hourPart, 10) % 24
  const m = parseInt(minutePart, 10)
  return h + m / 60
}

// Trivial fragment shader: sample two phase textures, mix by uPhaseBlend.
// No procedural math, no hash, no precision-sensitive ops. Mobile-safe.
export const skyVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const skyFragmentShader = /* glsl */ `
  precision mediump float;
  uniform sampler2D uSkyA;
  uniform sampler2D uSkyB;
  uniform float uPhaseBlend;
  varying vec2 vUv;

  void main() {
    vec4 a = texture2D(uSkyA, vUv);
    vec4 b = texture2D(uSkyB, vUv);
    gl_FragColor = mix(a, b, uPhaseBlend);
  }
`

// Module-scope uniforms — mutated in-place by the per-minute tick driven
// from Studio.tsx. The shader material wraps these directly so re-renders
// aren't needed when the uniforms change.
export const skyUniforms = {
  uSkyA: { value: null as THREE.Texture | null },
  uSkyB: { value: null as THREE.Texture | null },
  uPhaseBlend: { value: 0 },
}

export function createSkyMaterial(): THREE.ShaderMaterial {
  const textures = getPhaseTextures()
  // Initialize at the current phase so first paint isn't a wrong-phase flash.
  const initial = getPhaseBlend(getCalgaryHour())
  skyUniforms.uSkyA.value = textures[initial.a]
  skyUniforms.uSkyB.value = textures[initial.b]
  skyUniforms.uPhaseBlend.value = initial.blend
  return new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    depthWrite: false,
  })
}

// Apply a (currentPhase, nextPhase, blend) tuple to the live uniforms. The
// time tick in Studio.tsx calls this once per minute.
export function applyPhaseBlend(pb: PhaseBlend): void {
  if (!cachedTextures) return
  skyUniforms.uSkyA.value = cachedTextures[pb.a]
  skyUniforms.uSkyB.value = cachedTextures[pb.b]
  skyUniforms.uPhaseBlend.value = pb.blend
}
