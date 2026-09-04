import SurfaceLoading from '@/components/SurfaceLoading';

/* The frame for /gym, flushed before the data arrives. See src/components/SurfaceLoading.tsx
 * for why this exists and why it asserts no heading text.
 *
 * `wrap` is the class this segment's page puts its content in. 6 rows stands in for
 * the day, its blocks and the note box.
 */
export default function Loading() {
  return <SurfaceLoading wrap="wrap" rows={6} />;
}
