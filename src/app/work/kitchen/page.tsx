import Link from 'next/link';

export const metadata = {
  alternates: { canonical: '/work/kitchen' },
  title: 'The dish that burnt',
  description: 'An app I built told me how to cook, and the food came out wrong. What the failures had in common changed how I build.',
};

export default function KitchenStoryPage() {
  return (
    <>
      <h1>The dish that burnt</h1>
      <p className="lede">
        I built an app that tells me how to cook. The first thing I ever made from it burnt, and
        what the failures had in common is the most useful thing I have learned building software on
        my own.
      </p>

      <h2 className="sec">What it had already passed</h2>
      <p className="body">
        That recipe had been checked more carefully than anything else I have shipped. Every quantity
        cross-checked against six sources. All eighteen steps read end to end as the app renders
        them, not as they sit in the file. A clean validator over the whole thing. I am a beginner
        cook, so I had been deliberate.
      </p>
      <p className="body">
        Four things went wrong at the stove. I went back through them expecting a bad number.
      </p>

      <p className="finding">
        There was no bad number. Every failure was a gap between the numbers, and every one came from
        a sentence the model had written rather than a figure a source had given.
      </p>

      <p className="body">
        The second batch of chicken had no heat setting, because the first one did and nothing said to
        set it again. Nothing mentioned that the sauce goes brown before the butter goes in, so I
        thought I had ruined it. Nothing tied the flour I had dredged the cutlets in to the sauce
        thickening later, so I did not know what I was waiting for. Absences, all of them. A checker
        cannot see an absence it was not told to look for, which is why six sources and eighteen
        careful reads found none of them.
      </p>

      <h2 className="sec">What I changed</h2>
      <p className="body">
        Not more checking. Checking harder was already the thing that had failed. What changed is
        what the software is allowed to produce.
      </p>
      <p className="body">
        A recipe now follows one published recipe, verbatim, with the source text attached to every
        step. The model adds only what a printed page cannot know: what is in my fridge, what a
        technique word means, which pan I own, a timer, the protein arithmetic. It does not improve a
        sentence and it does not write one. The build fails if a step holds a number that is not in
        its own source text, or if the rendered words have drifted since a human last read them.
      </p>
      <p className="body">
        That is the shape of the fix I keep reaching for now: make the mistake impossible to express
        rather than adding a rule someone has to follow. Following scales with vigilance, and
        vigilance decays. Every rule I have written here as prose has been broken, several by the
        session that wrote it. Every one written as a failing build has held.
      </p>

      <h2 className="sec">The review that found ninety-one</h2>
      <p className="body">
        The same app matches a few thousand published recipes against what is in my kitchen and
        offers me the ones I can cook. Every check it owned passed, so I asked a reviewer for the
        opposite: find the dishes it claims I can cook and obviously cannot.
      </p>

      <p className="finding">
        Ninety-one of the one hundred and thirty-nine dishes it was offering contained something I
        did not have.
      </p>

      <p className="body">
        Nearly all of it was one line. The ingredient parser treated ground, minced and frozen as noise and
        stripped them, so &ldquo;ground chicken&rdquo; became &ldquo;chicken&rdquo; and a whole
        roasting bird in the freezer matched. Those words are not noise. They are the product.
      </p>
      <p className="body">
        The lesson is the instruction, not the bug. A reviewer told to confirm confirms. The same
        reviewer told to find where a thing lies finds it. Naming the failure, and which direction of
        error costs more, is most of the work: a dish I cannot cook ruins a dinner, a dish it hides
        costs me a walk to the cupboard.
      </p>

      <p className="body">
        The kitchen is a small app with one user. What it cost me to get right is the part that
        transfers. The recipes do not. <Link href="/kitchen">The app is here</Link>, fridge and all.
      </p>
    </>
  );
}
