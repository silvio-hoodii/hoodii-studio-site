/* The frame for /run, flushed before the data arrives. See src/components/SurfaceLoading.tsx
 * for why this exists and why it asserts no heading text.
 *
 * THE SUB-TAB ROW IS IN THE FRAME, since 2026-09-27. It arrives with the page rather than the layout,
 * so a frame without it made everything below jump by the height of the row (44px plus margins) when the data landed. Its labels are the
 * page's own three tabs, which are the same on every visit, so showing them asserts nothing that
 * could be wrong; none is marked current, because the frame cannot know which. Same markup and
 * classes as SurfaceLoading plus `.subtabs` from training.css; SurfaceLoading takes no slot for it.
 * /run/log has its own loading.tsx, without the row, because it has no tabs.
 *
 * 4 rows stand in for the last session and the recent runs.
 */
const TABS = ['Now', 'Plan', 'How'];

export default function Loading() {
  return (
    <div className="wrap">
      <div role="status" aria-live="polite">
        <span className="vh">Loading</span>
        <div className="skel skel-title" aria-hidden="true" />
        <div className="subtabs" aria-hidden="true">
          {TABS.map((t) => (
            <span className="subtab" key={t}>
              {t}
            </span>
          ))}
        </div>
        <div className="skel-rows" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div className="skel-row" key={i}>
              <div className="skel skel-label" />
              <div className="skel skel-line" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
