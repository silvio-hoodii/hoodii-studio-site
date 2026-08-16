export const metadata = {
  alternates: { canonical: '/work/versatile' },
  title: 'Versatile',
  description: 'A marketing site and an internal operations hub for a Calgary accounting firm, and the tax season mapped into it.',
};

export default function VersatilePage() {
  return (
    <>
      <h1>Versatile Accounting</h1>
      <p className="lede">
        An accounting firm in Calgary. I built their public site and the internal hub the staff work
        the tax season out of.
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
          <dd>A season mapped into five phases and sixteen steps, plus eight process templates</dd>
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
        who have to use it. This is the part of the job I have been doing for twelve years, most of
        it as the person between an insurance business and the team building its systems.
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
        The site is live and the hub is deployed and used. What I will not claim is adoption. I know
        what was built and what it was built for; how much of it has become habit is not something
        anyone has measured, and a number I have not measured is not a number I will put on a page.
      </p>
    </>
  );
}
