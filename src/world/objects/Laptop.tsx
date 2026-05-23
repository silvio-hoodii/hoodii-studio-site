'use client'

import { RoundedBox, Text } from '@react-three/drei'
import { useFocus } from '../state/useFocus'

// Open laptop on the center-front of the desk, lid hinged at the back of
// the base and tilted ~20° back from vertical (so it reads as a real
// open laptop, not a vertical screen).
//
// Screen content: mock Claude Code terminal — small set of mono lines
// rendered via drei <Text>. Keeps the agent-noun reading sharp without
// committing to a render-target (which would be fuzzy at this distance).
//
// Position math: desk top at y=0.76. Base height 0.015, mesh centered at
// y=0.0075 in local → world y=0.7675. Bottom of base at y=0.76 (resting).

const LID_W = 0.34
const LID_H = 0.21
const LID_T = 0.01

const BASE_W = 0.34
const BASE_D = 0.22
const BASE_H = 0.015

const HINGE_Z = -BASE_D / 2 // back edge of base
const LID_OPEN_TILT = -0.36 // ~110° open (-20° from vertical)

// Mock Claude Code terminal — stays static for v1. Week 3 can wire to
// actual session log lines streamed from .claude/projects/.../session.jsonl
// if the operator wants real activity. v1 is intentionally curated.
const TERMINAL_LINES: ReadonlyArray<{ text: string; color: string; bold?: boolean }> = [
  { text: '$ claude --resume', color: '#ff9d4f', bold: true },
  { text: '', color: '#fff' },
  { text: '✓ reading design doc', color: '#aac0d0' },
  { text: '✓ ported /api/psn', color: '#aac0d0' },
  { text: '→ building room shell', color: '#aac0d0' },
  { text: '✓ bloom + god-rays', color: '#aac0d0' },
  { text: '→ eyes on screen', color: '#aac0d0' },
  { text: '▌', color: '#ff9d4f', bold: true },
]

export function Laptop() {
  const setHovered = useFocus((s) => s.setHovered)

  return (
    <group
      position={[-0.1, 0.76, -0.05]}
      name="laptop"
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered('laptop', 'AGENT SESSION / claude opus 4.7')
      }}
      onPointerOut={() => setHovered(null)}
    >
      {/* Base — keyboard half */}
      <RoundedBox
        args={[BASE_W, BASE_H, BASE_D]}
        radius={0.004}
        smoothness={3}
        position={[0, BASE_H / 2, 0]}
      >
        <meshStandardMaterial color="#2a2c30" roughness={0.42} metalness={0.7} />
      </RoundedBox>

      {/* Subtle keyboard area — slightly darker recessed plane */}
      <mesh position={[0, BASE_H + 0.0005, 0.018]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BASE_W - 0.04, BASE_D - 0.06]} />
        <meshStandardMaterial color="#1a1c20" roughness={0.6} metalness={0.4} />
      </mesh>

      {/* Trackpad hint */}
      <mesh position={[0, BASE_H + 0.001, 0.078]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.085, 0.055]} />
        <meshStandardMaterial color="#22242a" roughness={0.34} metalness={0.6} />
      </mesh>

      {/* Lid hinge group — at back-top edge of base */}
      <group position={[0, BASE_H, HINGE_Z]} rotation={[LID_OPEN_TILT, 0, 0]}>
        {/* Lid body — extends from hinge upward */}
        <RoundedBox
          args={[LID_W, LID_H, LID_T]}
          radius={0.004}
          smoothness={3}
          position={[0, LID_H / 2, 0]}
        >
          <meshStandardMaterial color="#2a2c30" roughness={0.42} metalness={0.7} />
        </RoundedBox>

        {/* Screen — emissive dark plane proud of the front face. High
            emissive so the screen reads as ON even when the rest of the
            room is dim. */}
        <mesh position={[0, LID_H / 2, LID_T / 2 + 0.0005]}>
          <planeGeometry args={[LID_W - 0.022, LID_H - 0.022]} />
          <meshBasicMaterial color="#13131a" toneMapped={false} />
        </mesh>

        {/* Terminal lines stacked vertically on the screen */}
        {TERMINAL_LINES.map((line, i) => {
          const lineHeight = 0.012
          // Top of screen at local y = LID_H - 0.02; first line just below
          const y = LID_H - 0.03 - i * lineHeight
          return (
            <Text
              key={i}
              position={[-LID_W / 2 + 0.022, y, LID_T / 2 + 0.0012]}
              fontSize={0.0085}
              color={line.color}
              anchorX="left"
              anchorY="middle"
              outlineWidth={line.bold ? 0.0002 : 0}
              outlineColor={line.color}
              maxWidth={LID_W - 0.046}
            >
              {line.text}
            </Text>
          )
        })}
      </group>
    </group>
  )
}
