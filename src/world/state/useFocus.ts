import { create } from 'zustand'

export type ScreenPos = { x: number; y: number }

export type FocusState = {
  hovered: string | null
  hoveredLabel: string | null
  hoveredScreenPos: ScreenPos | null
  focused: string | null
  prefersReducedMotion: boolean
  setHovered: (id: string | null, label?: string | null) => void
  setHoveredScreenPos: (pos: ScreenPos | null) => void
  setFocused: (id: string | null) => void
  setPrefersReducedMotion: (v: boolean) => void
}

export const useFocus = create<FocusState>((set) => ({
  hovered: null,
  hoveredLabel: null,
  hoveredScreenPos: null,
  focused: null,
  prefersReducedMotion: false,
  setHovered: (id, label = null) =>
    set({
      hovered: id,
      hoveredLabel: id ? label : null,
      hoveredScreenPos: id ? null : null,
    }),
  setHoveredScreenPos: (pos) => set({ hoveredScreenPos: pos }),
  setFocused: (id) => set({ focused: id }),
  setPrefersReducedMotion: (v) => set({ prefersReducedMotion: v }),
}))
