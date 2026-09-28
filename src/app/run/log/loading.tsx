import SurfaceLoading from '@/components/SurfaceLoading';

/* The frame for /run/log. Its own file so the parent's sub-tab row does not flash on a page that
 * has no tabs. See src/components/SurfaceLoading.tsx. */
export default function Loading() {
  return <SurfaceLoading wrap="wrap" rows={5} />;
}
