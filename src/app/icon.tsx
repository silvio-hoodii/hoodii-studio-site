import { ImageResponse } from 'next/og';
import { IconMark } from '@/lib/icon-mark';

/* The browser-tab icon, and the icons the web manifest points at.
 *
 * THREE SIZES FROM ONE DRAWING. 32 is the tab. 192 is the floor Chrome requires before it will
 * offer to install a site to a home screen at all, so a manifest whose largest icon is smaller than
 * that is a manifest that never prompts. 512 is what Android draws the splash screen from.
 *
 * `generateImageMetadata` is what makes them one route: the alternative is three near-identical
 * files, which is the shape that let eight `themeColor` exports and four share-card hex literals go
 * stale in this repo. The mark itself lives in `src/lib/icon-mark.tsx` and every dimension in it is
 * a fraction of the canvas, so these three are the same drawing and not three drawings.
 *
 * Generated at build, not committed as PNGs, for the reason AGENTS.md gives for the hub
 * illustrations: no image files to go stale against the palette.
 */
export function generateImageMetadata() {
  return [
    { id: '32', size: { width: 32, height: 32 }, contentType: 'image/png' },
    { id: '192', size: { width: 192, height: 192 }, contentType: 'image/png' },
    { id: '512', size: { width: 512, height: 512 }, contentType: 'image/png' },
  ];
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const size = Number(await id);
  /* Almost no inset at 32: a browser tab is already small and padding inside it wastes the few
     pixels the mark has. The larger renders get a little breathing room so the drawing is not
     jammed against the edge of a home-screen tile. */
  return new ImageResponse(<IconMark size={size} inset={size <= 32 ? 0.06 : 0.14} />, {
    width: size,
    height: size,
  });
}
