import SurfaceLoading from '@/components/SurfaceLoading';

/* The frame for /kitchen, flushed before the data arrives. See src/components/SurfaceLoading.tsx
 * for why this exists and why it asserts no heading text.
 *
 * `wrap` is the class this segment's page puts its content in. 7 rows stands in for
 * the cookable list, the rescue rows and the stock receipt.
 */
export default function Loading() {
  return <SurfaceLoading wrap="wrap" rows={7} />;
}
