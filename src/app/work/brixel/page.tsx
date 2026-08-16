export const metadata = {
  alternates: { canonical: '/work/brixel' },
  title: 'Brixel',
  description:
    'A construction company in Calgary, and the pricing, quoting and contract paperwork that let it sit between a builder and the trade doing the work.',
};

/* Every claim on this page was checked against Brixel/ by a reviewer told to find where it lies,
 * and the first draft lost eight of them. Three are worth naming here so nobody writes them back:
 *
 *  - "Brixel signed both sides." It did not. 00_Company/Contracts_Master/Builders/ and Contractors/
 *    are both EMPTY, and 06_Contracts/SOW_Goldies_Stettler_v1.md has blank signature lines. The
 *    templates exist; executed agreements do not. This page describes the design, not a signature.
 *  - "The templates existed before the first job did." They did not. The templates are dated
 *    2026-03-22 and Todd accepted the scope by text on 2026-03-11. Any ordering claim here is wrong.
 *  - "Live at brixelcorp.com." Removed. The root of that domain serves Brixel Tech, a software
 *    offer, and the trades pages under it are noindex internal demos. A construction lede over a
 *    link to a software page is a lie a reader finds in one click.
 *
 * "Invoiced" is verified and "paid" is not: _data/invoice-log.md says "Sent, unpaid". No amounts,
 * per his instruction. No availability claim, per clause 7(c) and the note in ../layout.tsx.
 */
export default function BrixelPage() {
  return (
    <>
      <h1>Brixel</h1>
      <p className="lede">
        A construction company in Calgary. It sits between builders and the trades who do the work,
        and I built the pricing, the quoting and the contract paperwork that let it hold that
        position.
      </p>

      <dl className="facts">
        <div>
          <dt>What</dt>
          <dd>Quoting, scope and change-order paperwork for a construction intermediary, and the pricing logic underneath it</dd>
        </div>
        <div>
          <dt>First job</dt>
          <dd>A new-build house on Siksika Nation, Alberta, invoiced March 2026</dd>
        </div>
        <div>
          <dt>Materials</dt>
          <dd>Dimpled membrane and 2&quot; rigid foam on the foundation wall, perforated drain and radon gravel at the footing</dd>
        </div>
        <div>
          <dt>Shipped</dt>
          <dd>Five commercial templates, and one exterior foundation package priced, subcontracted and invoiced</dd>
        </div>
      </dl>

      <h2 className="sec">What I actually did</h2>
      <p className="body">
        The company was incorporated on 30 March 2026 and its first invoice went out the same day. A
        new-build house on Siksika Nation, Alberta: the exterior foundation package, a dimpled
        membrane and two inches of rigid foam down the basement wall, then perforated drain and radon
        gravel around the footing. Brixel priced it for the builder, subcontracted the install,
        invoiced the builder, and was billed by the trade. Not a website. That is the whole business
        model, run once.
      </p>
      <p className="body">
        Most of the work was getting to a number. The trade quotes per square foot and per linear
        foot; the builder wants one price per house. Translating between those took six revisions to
        get one approved: materials moved, the gravel spec moved, and the approved version dropped
        the self-adhered waterproofing layer because the builder self-performed it.
      </p>
      <p className="body">
        Then the job corrected the estimate. The plan gives a 178 foot perimeter and about 1,260
        square feet of basement wall. What went on was 991 square feet of membrane, 720.8 of foam and
        180.2 feet of drain, because those layers only run on the part of the wall that ends up
        underground, and the foam only to frost depth. Nobody had modelled that, and it is most of
        the gap between what the cost model expected and what the trade actually billed.
      </p>

      <div className="decision">
        <span className="k">The decision that mattered</span>
        <p>
          The easy version of this business is an introduction. Put the builder in a room with the
          trade, take a fee, carry nothing. Brixel is built the other way: it prices the job, holds
          both relationships, and invoices in its own name. Which means it is the one carrying the
          risk if a subcontractor is not paid or the work is wrong.
        </p>
        <p>
          That position only exists on paper, so the paper is the product. I read how payment and
          lien risk actually works in Alberta and wrote five templates off it: a builder service
          agreement, a subcontractor agreement, a scope of work, a change order and the quote. A
          verbal change to a scope is an argument scheduled for a month from now.
        </p>
      </div>

      <h2 className="sec">What I would say about it honestly</h2>
      <p className="body">
        One house has been invoiced, and only the exterior phase of it: the gravel under the slab has
        not been done or billed. A second unit has been priced and not invoiced. One is a small
        number, and I would rather write that down than describe a business with one job as if it
        were busy. What it shows is that the thing works when it is run: priced, subcontracted,
        invoiced, on a quote that took six rounds to land.
      </p>
    </>
  );
}
