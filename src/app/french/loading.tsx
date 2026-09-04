import SurfaceLoading from '@/components/SurfaceLoading';

/* The frame for /french, flushed before the data arrives. See src/components/SurfaceLoading.tsx
 * for why this exists and why it asserts no heading text.
 *
 * `wrap` is the class this segment's page puts its content in. 4 rows stands in for
 * the review queue.
 */
export default function Loading() {
  return <SurfaceLoading wrap="wrap" rows={4} />;
}
