export const metadata = {
  alternates: { canonical: '/work/themoment' },
  title: 'The Moment',
  description: 'Storefront, checkout and admin for a Calgary bakery, and the decision that kept it running.',
};

export default function TheMomentPage() {
  return (
    <>
      <h1>The Moment</h1>
      <p className="lede">
        A bakery in Calgary. I built the storefront people order from, the checkout that takes the
        money, and the back office the owner runs the day from.
      </p>

      <dl className="facts">
        <div>
          <dt>What</dt>
          <dd>Ordering, payment and an admin the owner uses without me</dd>
        </div>
        <div>
          <dt>Live at</dt>
          <dd><a href="https://themomentyyc.com" target="_blank" rel="noreferrer">themomentyyc.com</a></dd>
        </div>
        <div>
          <dt>Stack</dt>
          <dd>Next.js, Sanity for the content, Supabase for the orders, Square for payment</dd>
        </div>
        <div>
          <dt>Orders</dt>
          {/* Dated, not painted in the live colour, for the reason the hub row records: this site has
              no connection to that project's store, so the count is a snapshot. */}
          <dd><span className="tnum">154</span> real ones had gone through it by August 2026</dd>
        </div>
      </dl>

      <h2 className="sec">What I actually did</h2>
      <p className="body">
        I did the discovery first, because a bakery does not want a website, it wants the mornings
        to go smoothly. So the questions were about the mornings: what gets ordered, what runs out,
        who has to be told, and what happens when someone wants something the kitchen cannot make
        that day. The answers are what the software is shaped around.
      </p>
      <p className="body">
        Then requirements, the build direction, and the checking. I am the one who decides what
        exists and whether what got built is right; the code gets written fast and it gets written
        wrong unless somebody is holding the line on what it was for. That is the same job I did for
        eight years between an insurer&apos;s business and its engineers. The difference now is that
        there is no separate team to hand it to, so I build it as well as specify it.
      </p>

      <div className="decision">
        <span className="k">The decision that mattered</span>
        <p>
          Square handles the payment, and it was tempting to let Square handle the order too, since
          it will. I kept orders in our own database and used Square only for taking money.
        </p>
        <p>
          The reason is what happens later. An order that lives inside a payment provider can be
          read and refunded and very little else. An order in a table you own can be counted,
          filtered, chased, reported on, and moved somewhere else the day the provider stops suiting
          you. Every question the owner has asked since has been answerable because of that one
          choice, and none of them was a question anybody thought of at the start.
        </p>
      </div>

      <h2 className="sec">What I would say about it honestly</h2>
      <p className="body">
        It is a small shop and this is a small system. What it proves is not scale. It is that
        something real runs on it every day, that the person running it does not phone me to use it,
        and that it is still there after the conversation ended, which is the part most builds do
        not survive.
      </p>
    </>
  );
}
