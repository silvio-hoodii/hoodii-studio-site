export const metadata = {
  alternates: { canonical: '/work/versatile' },
  title: 'Versatile',
  description: 'A marketing site and an internal operations hub for a Calgary accounting firm, and the tax season mapped into it.',
};

/* "Five phases and sixteen steps" was here and it described the WRONG HUB. That count belongs to a
 * static HTML hub from March 2026 that has since been replaced. The live one, at hub.versatilecpa.ca
 * out of versatile-cpa-master, has four phases and fifteen steps: `src/components/hub/
 * t1-process-data.ts` runs s1 to s15 with Phase 1 Intake through Phase 4 Filing, and the page's own
 * copy reads "Fifteen steps, one place". Counted, not remembered.
 *
 * It came in from CareerOS/strategy/project-evidence-ledger.md, which froze the March figure and was
 * never updated. That line is corrected at source now. Count the steps in the deployed hub before
 * changing this number, and do not take it from the ledger.
 *
 * Adoption is the other trap on this page. The ledger's "Do not use" list bars usage claims beyond
 * the fact of deployment, and the lede used to say the staff work the season out of it while the
 * closing paragraph refused to claim adoption. Both cannot be true.
 */
export default function VersatilePage() {
  return (
    <>
      <h1>Versatile Accounting</h1>
      <p className="lede">
        An accounting firm in Calgary. I built their public site and the internal hub that
        documents how the tax season runs.
      </p>

      <dl className="facts">
        <div>
          <dt>What</dt>
          <dd>A marketing site, and an operations hub behind the firm&apos;s own login</dd>
        </div>
        <div>
          <dt>Live at</dt>
          <dd><a href="https://versatilecpa.ca" target="_blank" rel="noreferrer">versatilecpa.ca</a>, the hub is not public</dd>
        </div>
        <div>
          <dt>Stack</dt>
          <dd>Next.js, Neon Postgres, Prisma, Vercel</dd>
        </div>
        <div>
          <dt>Shipped</dt>
          <dd>A season mapped into four phases and fifteen steps, plus eight process templates</dd>
        </div>
      </dl>

      <h2 className="sec">What I actually did</h2>
      <p className="body">
        The hub is the interesting half. A tax season at a small firm is a process that lives in the
        heads of the people who have done it before, and the cost of that is invisible until
        somebody is away or new. So the work was process design before it was software: sit with
        the people doing it, watch a return go through, write down what actually happens rather than
        what the manual would say, and find the steps where the work stops and waits.
      </p>
      <p className="body">
        Out of that came the phases, the steps and the templates, and only then a hub to hold them.
        I did the discovery, wrote the requirements, built it, and validated it against the people
        who have to use it.
      </p>

      <div className="decision">
        <span className="k">The decision that mattered</span>
        <p>
          The firm runs two practice-management systems that do not talk to each other, which means
          a lot of things get typed twice. The obvious project is to fix that. I did not start
          there.
        </p>
        <p>
          Replacing either system is a decision with a budget and a migration and a season where
          nothing must go wrong, and I had been there weeks. So the hub documents the process
          instead, including the double entry, in a form anyone can read. It made the cost of the
          split visible without betting the season on removing it, and the case for changing either
          system is now something the firm can look at rather than something I asserted.
        </p>
      </div>

      <h2 className="sec">What I would say about it honestly</h2>
      <p className="body">
        The site is live and the hub is deployed. What I will not claim is adoption. I know
        what was built and what it was built for; how much of it has become habit is not something
        anyone has measured, and a number I have not measured is not a number I will put on a page.
      </p>
    </>
  );
}
