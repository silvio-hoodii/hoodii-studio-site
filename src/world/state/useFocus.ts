import { create } from 'zustand'

export type FocusState = {
  hovered: string | null
  focused: string | null
  prefersReducedMotion: boolean
  setHovered: (id: string | null) => void
  setFocused: (id: string | null) => void
  setPrefersReducedMotion: (v: boolean) => void
}

export const useFocus = create<FocusState>((set) => ({
  hovered: null,
  focused: null,
  prefersReducedMotion: false,
  setHovered: (id) => set({ hovered: id }),
  setFocused: (id) => set({ focused: id }),
  setPrefersReducedMotion: (v) => set({ prefersReducedMotion: v }),
}))
