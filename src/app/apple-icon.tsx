import { ImageResponse } from 'next/og';
import { IconMark } from '@/lib/icon-mark';

/* THE iPHONE HOME-SCREEN ICON, which is the one B3 of the 2026-09-04 audit was actually about.
 *
 * Without this file, adding /kitchen to an iOS home screen takes a scaled SCREENSHOT of the page as
 * the icon. That is the state the site was in: the tool he opens most, on the device he opens it on,
 * had a picture of itself as its icon.
 *
 * 180x180 is the size iOS asks for and the only one it needs; it downscales for the smaller slots
 * itself. A separate file rather than a fourth entry in `icon.tsx` because `apple-icon` is its own
 * Next file convention and emits `rel="apple-touch-icon"`, which is the attribute iOS reads.
 *
 * The larger inset is not decoration. iOS masks this with its own rounded rectangle and clips
 * roughly a tenth off every edge, so a drawing that fills the canvas loses its corners. The mark is
 * one component shared with `icon.tsx` and takes the inset as a fraction, so this is the same
 * drawing at a different margin rather than a second drawing that can drift from the first.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';
export const alt = 'Silvio Neyra';

export default function AppleIcon() {
  return new ImageResponse(<IconMark size={size.width} inset={0.18} />, size);
}
