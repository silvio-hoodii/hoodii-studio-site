/* The banner that keeps a draft from pretending to be published.
 *
 * These pages are reachable so Silvio can read them as pages instead of as markdown. Reachable is
 * not the same as approved, and the difference has to be visible ON the page, not only in a comment
 * in the layout: `noindex` and "linked from nowhere" are invisible to the one person who is going
 * to open them, and the whole reason they exist is for him to decide.
 *
 * It removes itself with the approval, in one edit, along with the robots rule in layout.tsx.
 */
export default function Draft() {
  return (
    <div className="draft" role="note">
      <span className="k">Draft, not published</span>
      Nothing links here and search engines are told to skip it. Read it and say what is wrong;
      publishing is removing this box, listing the page in the sitemap, and pointing the hub rows at
      it.
    </div>
  );
}
