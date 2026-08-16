import Draft from '../Draft';

export const metadata = {
  title: 'Brixel',
  description:
    'A construction company in Calgary, and the pricing, contracts and job paperwork that let it sit between a builder and the trade doing the work.',
};

export default function BrixelPage() {
  return (
    <>
      <h1>Brixel</h1>
      <p className="lede">
        A construction company in Calgary. It sits between builders and the trades who do the work,
        and I built the pricing, the contracts and the job paperwork that let it hold that position.
      </p>
      <Draft />

      <dl className="facts">
        <div>
          <dt>What</dt>
          <dd>Quoting, contracts and delivery paperwork for a construction intermediary, plus its site and lead intake</dd>
        </div>
        <div>
          <dt>Live at</dt>
          <dd><a href="https://brixelcorp.com" target="_blank" rel="noreferrer">brixelcorp.com</a></dd>
        </div>
        <div>
          <dt>Stack</dt>
          <dd>Next.js on Vercel, leads to a sheet, a toll-free line. The operations half is not software</dd>
        </div>
        <div>
          <dt>Shipped</dt>
          <dd>Five commercial templates, and one foundation package priced, subcontracted and invoiced end to end</dd>
        </div>
      </dl>

      <h2 className="sec">What I actually did</h2>
      <p className="body">
        The company was incorporated on 30 March 2026 and its first job was invoiced the same day. A
        new-build house on Siksika Nation, Alberta: the exterior foundation package, a dimpled
        membrane and two inches of rigid foam down the basement wall, then perforated drain and radon
        gravel around the footing. Brixel priced it for the builder, subcontracted the install,
        invoiced the builder, and was billed by the trade. Not a website. That is the whole business
        model, run once, end to end.
      </p>
      <p className="body">
        Most of the work was getting to a number. The trade quotes per square foot and per linear
        foot; the builder wants one price per house. Translating between those took six revisions
        before one was approved: materials moved, the gravel spec moved, and the version that got
        signed dropped the self-adhered waterproofing layer because the builder&apos;s own crew was
        doing it.
      </p>
      <p className="body">
        Then the job itself corrected the estimate. The drawings give a 1,260 square foot basement
        wall and a 178 foot perimeter. What went on was 991 square feet of membrane, 720.8 of foam
        and 180.2 feet of drain, because those layers only run on the part of the wall that ends up
        underground, and the foam only to frost depth. Nobody had modelled that, and it changes how
        the next house gets priced.
      </p>

      <div className="decision">
        <span className="k">The decision that mattered</span>
        <p>
          The easy version of this business is an introduction. Put the builder in a room with the
          trade, take a fee, carry nothing. Brixel signed both sides instead: a service agreement
          with the builder, a subcontractor agreement with the trade, and its own scope, quote and
          change-order documents in between. So it is the one holding the risk if a subcontractor is
          not paid or the work is wrong.
        </p>
        <p>
          Which is why the five templates existed before the first job did. A position between two
          parties only exists on paper, so I read how payment and lien risk actually works in Alberta
          and wrote the paperwork off that. A verbal change to a scope is an argument scheduled for a
          month from now.
        </p>
      </div>

      <h2 className="sec">What I would say about it honestly</h2>
      <p className="body">
        One house has been invoiced. A second location went into pricing in July and has not been.
        One is a small number, and I would rather write that down than describe a business with one
        job as if it were busy. What it shows is that the thing works when it is run: priced,
        subcontracted, installed, invoiced, on paperwork that held.
      </p>
    </>
  );
}
