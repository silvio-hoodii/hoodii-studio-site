'use client'

import { useEffect } from 'react'
import { useFocus } from './useFocus'

// Subscribes to the OS-level reduced-motion media query and mirrors the
// current value into the focus store. Mount once near the root of the
// client tree (Studio.tsx) so every animated component can read the flag
// via useFocus((s) => s.prefersReducedMotion) without re-subscribing.
export function usePrefersReducedMotionSync() {
  const setPrefersReducedMotion = useFocus((s) => s.setPrefersReducedMotion)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [setPrefersReducedMotion])
}
