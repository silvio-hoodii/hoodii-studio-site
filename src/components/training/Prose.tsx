/** Prose fields arrive as a string or an array of lines, because JSON has no multi-line string and
 *  these paragraphs carry the reasoning the whole plan rests on. An empty entry is a blank line.
 *
 *  Lives here rather than inside one page because /gym/conditioning and /swim both render content
 *  files written in this shape. It was a local function in the conditioning page until 2026-08-26,
 *  when swim moved out to its own route: the alternative was a second copy, and this repo already
 *  has one documented case of a helper existing twice and the two copies quietly disagreeing (see
 *  the `pastDue` note at the top of src/lib/format.ts). */
export default function Prose({ text }: { text: string | string[] }) {
  const paras = (Array.isArray(text) ? text.join('\n') : text).split(/\n\s*\n|\n(?=\s*$)/);
  return (
    <>
      {paras
        .map((p) => p.replace(/\n/g, ' ').trim())
        .filter(Boolean)
        .map((p, i) => (
          <p className="lede" key={i}>
            {p}
          </p>
        ))}
    </>
  );
}
