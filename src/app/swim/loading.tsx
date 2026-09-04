import SurfaceLoading from '@/components/SurfaceLoading';

/* The frame for /swim, flushed before the data arrives. See src/components/SurfaceLoading.tsx
 * for why this exists and why it asserts no heading text.
 *
 * `wrap` is the class this segment's page puts its content in. 5 rows stands in for
 * the last session, the tier ladder and the personal bests.
 */
export default function Loading() {
  return <SurfaceLoading wrap="wrap" rows={5} />;
}
