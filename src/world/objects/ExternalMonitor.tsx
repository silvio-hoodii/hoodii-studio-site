'use client'

import { RoundedBox, Text } from '@react-three/drei'
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import type { PsnPayload } from '@/lib/fetchers'
import { useFocus } from '../state/useFocus'

type Props = {
  psn: PsnPayload | null
}

// External monitor on the back-right of the desk. Stand base + post +
// bezel + emissive screen. Screen content is the PSN game image when
// available (loaded via the /api/psn-image proxy to satisfy CORS), or a
// "PSN: signal lost" state when not.
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

export function ExternalMonitor({ psn }: Props) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const setHovered = useFocus((s) => s.setHovered)

  const game = psn?.game?.name ?? null
  const platform = psn?.game?.platform ?? null
  const imageUrl = psn?.game?.imageUrl ?? null

  useEffect(() => {
    if (!imageUrl) return
    const proxyUrl = `/api/psn-image?url=${encodeURIComponent(imageUrl)}`
    const loader = new THREE.TextureLoader()
    let cancelled = false
    loader.load(
      proxyUrl,
      (tex) => {
        if (cancelled) {
          tex.dispose()
          return
        }
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 8
        // setState inside an async callback is allowed by react-hooks/set-state-in-effect
        // (the loader callback is the "external system → React" boundary)
        setTexture(tex)
      },
      undefined,
      () => {
        // image failed; keep prior texture if any rather than flicker to fallback
      },
    )
    return () => {
      cancelled = true
    }
  }, [imageUrl])

  // Derive "should render image" from the prop so we never display a stale
  // texture when imageUrl flips to null. Avoids needing to setTexture(null)
  // synchronously in the effect body (which the lint rule rejects).
  const showImage = Boolean(imageUrl) && texture !== null

  const label = game
    ? `LAST PLAYED / ${game}${platform ? ' · ' + platform : ''}`
    : 'PSN / SIGNAL LOST'

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

        {/* Screen plane proud of the bezel front face */}
        <mesh position={[0, 0, BEZEL_T / 2 + 0.0008]}>
          <planeGeometry args={[SCREEN_W, SCREEN_H]} />
          {showImage ? (
            <meshBasicMaterial map={texture} toneMapped={false} />
          ) : (
            <meshStandardMaterial
              color="#10182a"
              emissive="#1c4880"
              emissiveIntensity={0.55}
              roughness={0.5}
              metalness={0}
              toneMapped={false}
            />
          )}
        </mesh>

        {/* Fallback "PSN: signal lost" text when image is not available */}
        {!showImage && (
          <>
            <Text
              position={[0, 0.022, BEZEL_T / 2 + 0.0014]}
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
              position={[0, -0.018, BEZEL_T / 2 + 0.0014]}
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
