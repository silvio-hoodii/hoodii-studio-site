import Link from 'next/link';

/* THE SUB-TAB ROW, ONE COMPONENT FOR /health, /swim, /run AND /bike. It was copied into all four
 * pages. Plain links with a `?s=` parameter rather than client state: it works before hydration,
 * survives a reload, and every view is a URL he can bookmark.
 *
 * `bare` names the tab whose link drops the parameter, for a route whose default tab is its plain
 * URL (/swim). Omitted, every tab carries `?s=`. */
export default function SubNav({
  base,
  tabs,
  sub,
  bare,
}: {
  base: string;
  tabs: readonly { id: string; label: string }[];
  sub: string;
  bare?: string;
}) {
  return (
    <div className="subtabs">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.id === bare ? base : `${base}?s=${t.id}`}
          className={`subtab${sub === t.id ? ' on' : ''}`}
          aria-current={sub === t.id ? 'page' : undefined}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
