import SurfaceLoading from '@/components/SurfaceLoading';

/* The frame for /health, flushed before the data arrives. See src/components/SurfaceLoading.tsx
 * for why this exists and why it asserts no heading text.
 *
 * `wrap` is the class this segment's page puts its content in. 5 rows stands in for
 * the year headline, the weigh-in and the body-composition columns.
 */
export default function Loading() {
  return <SurfaceLoading wrap="wrap" rows={5} />;
}
