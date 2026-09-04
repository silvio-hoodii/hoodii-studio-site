import SurfaceLoading from '@/components/SurfaceLoading';

/* The frame for /music, flushed before the data arrives. See src/components/SurfaceLoading.tsx
 * for why this exists and why it asserts no heading text.
 *
 * `music` is the class this segment's page puts its content in. 6 rows stands in for
 * three charts and the listening history.
 */
export default function Loading() {
  return <SurfaceLoading wrap="music" rows={6} />;
}
