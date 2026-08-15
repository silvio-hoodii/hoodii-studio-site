import Draft from '../Draft';

export const metadata = {
  title: 'Brixel',
  description: 'The site, the lead intake, and the quoting and contract paperwork behind a Calgary trades company.',
};

export default function BrixelPage() {
  return (
    <>
      <h1>Brixel</h1>
      <p className="lede">
        A trades company in Calgary. I built the site and the lead intake, and the quoting and
        contract paperwork that runs behind them.
      </p>
      <Draft />

      <dl className="facts">
        <div>
          <dt>What</dt>
          <dd>Public site, lead capture, and the operating paperwork a job actually needs</dd>
        </div>
        <div>
          <dt>Live at</dt>
          <dd><a href="https://brixelcorp.com" target="_blank" rel="noreferrer">brixelcorp.com</a></dd>
        </div>
        <div>
          <dt>Stack</dt>
          <dd>Next.js on Vercel, leads to a sheet, a toll-free line, analytics</dd>
        </div>
        <div>
          <dt>Shipped</dt>
          <dd>Five commercial templates, and six quote revisions on one live job</dd>
        </div>
      </dl>

      <h2 className="sec">What I actually did</h2>
      <p className="body">
        A trades website is easy and mostly beside the point. The part that decides whether a
        company makes money is what happens between a homeowner calling and an invoice being paid:
        how the job gets quoted, what the quote commits you to, who carries the risk if a
        subcontractor is not paid, and what a change to the scope does to the price. None of that is
        a web page.
      </p>
      <p className="body">
        So most of the work was operations. I researched how payment and lien risk works in Alberta,
        wrote the quoting protocol, and built the contract and change-order paperwork, then made the
        site the front of that rather than a thing on its own. The lead form exists because someone
        has to answer it within the hour; the templates exist because a verbal change to a scope is
        an argument waiting for a month from now.
      </p>

      <div className="decision">
        <span className="k">The decision that mattered</span>
        <p>
          We had a plan to prove the numbers behind the whole model with a small advertising test. I
          went and checked what a spend that size can actually establish, and the honest answer is
          the cost of getting a click and how many clicks become an enquiry. Nothing about how many
          enquiries become customers, which is the number the plan was built on.
        </p>
        <p>
          So the test got rewritten to measure only what it can measure, with the pass and fail
          conditions written down before it ran. Cheaper than finding out afterwards that a season
          of spending had proved something else, and the reason I would rather be the person who
          reads the benchmark than the person who quotes the industry average.
        </p>
      </div>

      <h2 className="sec">What I would say about it honestly</h2>
      <p className="body">
        This one is a business as much as a build, and it is early. The paperwork has been used on a
        real job and the quote went through six revisions, which is the useful evidence: the
        templates survived contact. The marketing side has not been proven yet, and the test that
        would prove part of it has not run.
      </p>
    </>
  );
}
