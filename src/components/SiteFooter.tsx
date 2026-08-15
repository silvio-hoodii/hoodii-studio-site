import Link from 'next/link';

/* The other end of SiteHeader, and it exists for the same reason.
 *
 * There were three footers on seven surfaces and no two were the same thing. The hub had a contact
 * row. /curio and /music had a single "Back to the index" link, which the header above them had
 * already been doing since it shipped. The other four surfaces just stopped.
 *
 * The three that had one are the three that are indexed, and that part was right: a stranger
 * arrives on /curio from a search result and reaches the bottom of the archive, and until now the
 * only thing there was a way back to a page they had not come from. The address is what the moment
 * calls for. The four app surfaces are noindex and have an audience of one, so a contact row at the
 * bottom of his own lifting log would be furniture.
 *
 * The home link stays as well as the header's. The header is 5,000px up on /curio.
 */
export default function SiteFooter({
  home = true,
  /* True when it is mounted from a LAYOUT, so it sits outside the page's own padded column and has
     to bring the column with it. The hub renders it inside its own wrapper and does not. */
  standalone = false,
  children,
}: {
  home?: boolean;
  standalone?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <footer className={standalone ? 'site-footer standalone' : 'site-footer'}>
      {home && <Link href="/">Back to the index</Link>}
      <a href="https://github.com/silvio-hoodii" target="_blank" rel="noreferrer">GitHub</a>
      <a href="https://linkedin.com/in/silvio-neyra-rivas" target="_blank" rel="noreferrer">LinkedIn</a>
      {/* The address in full, not a link labelled "Email". A bare mailto opens whatever mail client
        * the machine thinks it has, which on a work laptop is often nothing at all, and the reader
        * cannot copy an address they were never shown. */}
      <a href="mailto:silvio@hoodii.studio">silvio@hoodii.studio</a>
      {children}
    </footer>
  );
}
