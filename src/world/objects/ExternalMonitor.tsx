'use client'

import { RoundedBox, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import type { PsnPayload } from '@/lib/fetchers'
import { useFocus } from '../state/useFocus'

type Props = {
  psn: PsnPayload | null
}

// External monitor on the back-right of the desk. Stand base + post +
// bezel + emissive screen. Screen content cycles through the operator's
// last 5 PS5 games every 12 seconds with a 600ms cross-fade between
// slides. "History accumulates" flavor per 2026-05-23 design doc.
//
// Position math: desk top at y=0.76. Stand base bottom at y=0.76 (resting
// on desk). Total height from desk: ~31cm to top of bezel.

const STAND_BASE_R = 0.07
const STAND_BASE_H = 0.012
const STAND_POST_R = 0.012
const STAND_POST_H = 0.13
const BEZEL_W = 0.36
const BEZEL_H = 0.22
const BEZEL_T = 0.014
const SCREEN_W = BEZEL_W - 0.018
const SCREEN_H = BEZEL_H - 0.018

const CYCLE_MS = 12_000
const FADE_MS = 600

// Two stacked screen planes — one shows the currently-fading-out game,
// one shows the fading-in game. We swap roles on each cycle tick so we
// never need to dispose textures mid-fade.
type Slot = {
  texture: THREE.Texture | null
  imageUrl: string | null
  index: number
}

export function ExternalMonitor({ psn }: Props) {
  const games = useMemo(() => psn?.games ?? [], [psn])
  const setHovered = useFocus((s) => s.setHovered)

  const [activeIndex, setActiveIndex] = useState(0)
  const [slotA, setSlotA] = useState<Slot>({ texture: null, imageUrl: null, index: 0 })
  const [slotB, setSlotB] = useState<Slot>({ texture: null, imageUrl: null, index: 0 })
  // Which slot is currently the "front" (fading out becomes back next cycle)
  const [frontIsA, setFrontIsA] = useState(true)
  // Fade state. null = no fade in progress. Otherwise: { start, progress }.
  // Lifted out of useRef because React 19's react-hooks/refs rule forbids
  // reading ref.current during render, and these values determine which
  // slot meshes mount and at what opacity.
  const [fade, setFade] = useState<{ start: number; progress: number } | null>(null)

  // Clamp at render time instead of setState-in-effect — react-hooks rule
  // forbids resetting state synchronously inside an effect.
  const safeIndex = games.length === 0 ? 0 : activeIndex % games.length

  // Cycle tick — advance activeIndex every 12s, but only if there's more
  // than one game to cycle through.
  useEffect(() => {
    if (games.length <= 1) return
    const id = setInterval(() => {
      setActiveIndex((i) => (i + 1) % games.length)
    }, CYCLE_MS)
    return () => clearInterval(id)
  }, [games.length])

  // When safeIndex changes, load the new texture into the back slot, then
  // begin the cross-fade. We load eagerly so the fade-in is on the real
  // image, not a placeholder. setState happens only inside the async
  // loader callbacks (or a queued microtask for the no-URL branch), since
  // the react-hooks/set-state-in-effect rule forbids synchronous setState
  // in effect bodies.
  useEffect(() => {
    const game = games[safeIndex]
    if (!game) return
    const targetSlotSetter = frontIsA ? setSlotB : setSlotA
    const url = game.imageUrl
    let cancelled = false

    if (!url) {
      queueMicrotask(() => {
        if (cancelled) return
        targetSlotSetter({ texture: null, imageUrl: null, index: safeIndex })
        setFade({ start: performance.now(), progress: 0 })
      })
      return () => {
        cancelled = true
      }
    }

    const proxyUrl = `/api/psn-image?url=${encodeURIComponent(url)}`
    const loader = new THREE.TextureLoader()
    loader.load(
      proxyUrl,
      (tex) => {
        if (cancelled) {
          tex.dispose()
          return
        }
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 8
        targetSlotSetter({ texture: tex, imageUrl: url, index: safeIndex })
        setFade({ start: performance.now(), progress: 0 })
      },
      undefined,
      () => {
        if (cancelled) return
        targetSlotSetter({ texture: null, imageUrl: null, index: safeIndex })
        setFade({ start: performance.now(), progress: 0 })
      },
    )
    return () => {
      cancelled = true
    }
    // We intentionally exclude `frontIsA` so swapping fronts mid-fade
    // doesn't trigger a re-load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex, games])

  // Drive the fade per frame. setFade(...) re-renders the component so the
  // screen-plane materials pick up new opacity values; when t reaches 1 we
  // promote the back slot to front and clear the fade.
  useFrame(() => {
    if (fade === null) return
    const elapsed = performance.now() - fade.start
    const t = Math.min(1, elapsed / FADE_MS)
    if (t >= 1) {
      setFade(null)
      setFrontIsA((v) => !v)
    } else {
      setFade({ start: fade.start, progress: t })
    }
  })

  const frontSlot = frontIsA ? slotA : slotB
  const backSlot = frontIsA ? slotB : slotA
  const fadingIn = fade !== null
  const frontOpacity = fadingIn ? 1 - fade.progress : 1
  const backOpacity = fadingIn ? fade.progress : 0

  // Active game for hover label — read from games[activeIndex] not from
  // slot state, since slot state lags behind activeIndex while loading.
  const active = games[safeIndex]
  const label = active
    ? `LAST PLAYED / ${active.name}${active.platform ? ' · ' + active.platform : ''}`
    : 'PSN / SIGNAL LOST'

  // Render fallback (PSN: SIGNAL LOST) when the FRONT slot has no image
  // AND we're not currently fading in something else. Avoids fallback-text
  // flickering during a transition between two image slides.
  const showFallback = frontSlot.imageUrl === null && backSlot.imageUrl === null

  return (
    <group
      position={[0.4, 0.76, -0.55]}
      name="monitor"
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered('monitor', label)
      }}
      onPointerOut={() => setHovered(null)}
    >
      {/* Stand base — flat puck on desk */}
      <mesh position={[0, STAND_BASE_H / 2, 0]}>
        <cylinderGeometry args={[STAND_BASE_R, STAND_BASE_R, STAND_BASE_H, 28]} />
        <meshStandardMaterial color="#2a2c30" roughness={0.4} metalness={0.72} />
      </mesh>

      {/* Stand post — slight rear offset like a real monitor mount */}
      <mesh position={[0, STAND_BASE_H + STAND_POST_H / 2, -0.012]}>
        <cylinderGeometry args={[STAND_POST_R, STAND_POST_R, STAND_POST_H, 18]} />
        <meshStandardMaterial color="#36383d" roughness={0.34} metalness={0.78} />
      </mesh>

      {/* Bezel + screen — tilted back 4° like a real monitor */}
      <group
        position={[0, STAND_BASE_H + STAND_POST_H + BEZEL_H / 2 - 0.02, 0]}
        rotation={[-0.07, 0, 0]}
      >
        <RoundedBox args={[BEZEL_W, BEZEL_H, BEZEL_T]} radius={0.005} smoothness={3}>
          <meshStandardMaterial color="#16171a" roughness={0.5} metalness={0.6} />
        </RoundedBox>

        {/* Dark background plane so additive fading reads against black, not
            against whatever's behind the monitor. */}
        <mesh position={[0, 0, BEZEL_T / 2 + 0.0006]}>
          <planeGeometry args={[SCREEN_W, SCREEN_H]} />
          <meshStandardMaterial
            color="#10182a"
            emissive="#1c4880"
            emissiveIntensity={showFallback ? 0.55 : 0.18}
            roughness={0.5}
            metalness={0}
            toneMapped={false}
          />
        </mesh>

        {/* Front slot — fading out (or fully visible when no fade in progress) */}
        {frontSlot.texture && (
          <mesh position={[0, 0, BEZEL_T / 2 + 0.0011]}>
            <planeGeometry args={[SCREEN_W, SCREEN_H]} />
            <meshBasicMaterial
              map={frontSlot.texture}
              toneMapped={false}
              transparent
              opacity={frontOpacity}
              depthWrite={false}
            />
          </mesh>
        )}

        {/* Back slot — fading in */}
        {backSlot.texture && fadingIn && (
          <mesh position={[0, 0, BEZEL_T / 2 + 0.0013]}>
            <planeGeometry args={[SCREEN_W, SCREEN_H]} />
            <meshBasicMaterial
              map={backSlot.texture}
              toneMapped={false}
              transparent
              opacity={backOpacity}
              depthWrite={false}
            />
          </mesh>
        )}

        {/* "PSN: SIGNAL LOST" fallback when no image at all */}
        {showFallback && (
          <>
            <Text
              position={[0, 0.022, BEZEL_T / 2 + 0.0015]}
              fontSize={0.022}
              color="#e8f4ff"
              anchorX="center"
              anchorY="middle"
              letterSpacing={0.15}
              outlineWidth={0.0003}
              outlineColor="#e8f4ff"
            >
              PSN
            </Text>
            <Text
              position={[0, -0.018, BEZEL_T / 2 + 0.0015]}
              fontSize={0.012}
              color="#8ac0d8"
              anchorX="center"
              anchorY="middle"
              letterSpacing={0.2}
            >
              SIGNAL LOST
            </Text>
          </>
        )}
      </group>
    </group>
  )
}
