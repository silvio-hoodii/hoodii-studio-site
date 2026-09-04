import SurfaceLoading from '@/components/SurfaceLoading';

/* The frame for /reading, flushed before the data arrives. See src/components/SurfaceLoading.tsx
 * for why this exists and why it asserts no heading text.
 *
 * `reading` is the class this segment's page puts its content in. 5 rows stands in for
 * the ten queued books and their acquisition status.
 */
export default function Loading() {
  return <SurfaceLoading wrap="reading" rows={5} />;
}
