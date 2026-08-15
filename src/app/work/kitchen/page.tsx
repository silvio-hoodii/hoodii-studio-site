import Link from 'next/link';
import Draft from '../Draft';

export const metadata = {
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
      <Draft />

      <h2 className="sec">What it had already passed</h2>
      <p className="body">
        Before I cooked it, that recipe had been checked more carefully than anything else I have
        shipped. Every quantity cross-checked against six sources. All eighteen steps read end to
        end, as the app renders them, not as they sit in the file. A validator over the whole thing,
        clean. I am a beginner cook, so I had been deliberate about it.
      </p>
      <p className="body">
        Four things went wrong at the stove. I went back through them expecting to find a bad
        number.
      </p>

      <p className="finding">
        There was no bad number. Every failure was a gap between the numbers, and every one of them
        came from a sentence the model had written rather than a figure a source had given.
      </p>

      <p className="body">
        The second batch of beef had no heat setting, because the first one did and nothing said to
        set it again. Nothing mentioned that the sauce goes brown before the butter goes in, so I
        thought I had ruined it. Nothing connected the flour I had dredged the meat in to the sauce
        thickening later, so I did not know what I was waiting for. Absences, all of them. A
        checker cannot see an absence it was not told to look for, which is why six sources and
        eighteen careful reads found nothing.
      </p>

      <h2 className="sec">What I changed</h2>
      <p className="body">
        Not more checking. Checking harder was already the thing that had failed. What changed is
        what the software is allowed to produce.
      </p>
      <p className="body">
        A recipe now follows one published recipe, verbatim, with the source text attached to every
        step. The model adds only what a printed page cannot know: what is in my fridge, what a
        technique word means, which pan I own, a timer, and the protein arithmetic. It does not
        improve a sentence, and it does not write one. A build now fails if a step contains a number
        that is not in that step&apos;s source text, and it fails if the rendered words have drifted
        since a human last read them.
      </p>
      <p className="body">
        That is the general shape of the fix, and it is the one I keep reaching for now: make the
        mistake impossible to express rather than adding a rule that someone has to follow.
        Following scales with vigilance, and vigilance decays. In this workspace every rule written
        as prose has been broken, several of them by the session that wrote it, and every rule
        written as a failing build has held.
      </p>

      <h2 className="sec">The review that found ninety-one</h2>
      <p className="body">
        The same app matched a corpus of a few thousand published recipes against what was actually
        in my kitchen and offered me the ones I could cook. It looked right. Every check it owned
        passed.
      </p>
      <p className="body">
        So I ran a different kind of review. Not &ldquo;check this works&rdquo;, which finds that it
        works, but &ldquo;find the dishes this claims I can cook that I obviously cannot&rdquo;.
      </p>

      <p className="finding">
        Ninety-one of the one hundred and thirty-nine dishes it was offering contained something I
        did not have.
      </p>

      <p className="body">
        One line was responsible. The ingredient parser treated words like ground, minced and frozen
        as noise and stripped them, so &ldquo;ground chicken&rdquo; became &ldquo;chicken&rdquo; and
        a whole roasting chicken in the freezer matched it. Those words are not noise. They are the
        product.
      </p>
      <p className="body">
        The lesson I took is about the instruction rather than the bug. A reviewer told to confirm
        something confirms it. A reviewer told to find where a thing lies will find where it lies,
        and it is the same reviewer. Naming the failure you are hunting, and which direction of
        error costs more, is most of the work: telling me I have an ingredient I do not have ruins
        a dinner, and telling me I lack one I have costs a walk to the cupboard.
      </p>

      <h2 className="sec">Why this is the page I would show</h2>
      <p className="body">
        The kitchen is a small app with one user. It is on this site because of what it cost me to
        get right: a way of specifying work so the defect cannot be written, a test whose oracle is
        not a human eating dinner, and the habit of asking a reviewer to break something rather than
        to bless it. That transfers to anything. The recipes do not.
      </p>
      <p className="body">
        <Link href="/kitchen">The app is here</Link>, fridge and all.
      </p>
    </>
  );
}
