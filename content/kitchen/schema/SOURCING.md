---
decided: 2026-08-09
amended: 2026-08-11, and the amendment is the important part
status: binding. Supersedes the authoring model in RECIPE-SCHEMA.md.
---

# 2026-08-11 amendment: this file was right and it did not work

Everything below has been binding since 2026-08-09. On 2026-08-11 **five separate instructions
reached the stove that this file forbids**, inside a recipe written specifically to honour it. All
five were agent sentences. Not one was a figure a source gave, exactly as predicted below.

| # | The invention | What he hit |
|---|---|---|
| 1 | Her skillet swapped for a pot | Held the water her wide pan drives off. Watery sauce |
| 2 | "Mostly brown" as the doneness test, where she says 80 percent **cooked** | Chased a crust that cannot form in a wet pot |
| 3 | A note calling the pot's browned bits "most of the flavour" | **She never mentions fond** |
| 4 | Rice converted to US cups because a listing implied no measuring cup | Four scales for one measurement |
| 5 | "Coats the back of the spoon and holds the line" | That is nappe. Hers is "just a little sticky". **He passed her test and failed ours** |

His verdict: *"there's no one single recipe that I have been able to do... are we just spending tokens
for nothing?"*

**The lesson is not that this file needs stricter wording.** It is that a rule which asks an agent to
remember is not a rule. So the tier is now load-bearing rather than descriptive, and `validate.mjs`
enforces it:

- **Any entry in `deviations` disqualifies `sourced`.** No classification, no size threshold, no
  judgement about whether a change is small enough. That judgement produced all five defects above.
- **Only `sourced` is offered**, plus the one exemption below. `adapted` is reachable and honestly
  labelled with its change count, and is never recommended.
- **`provenance.readHash`** is a hash of the rendered text. `readAt` compared two hand-typed strings,
  so two edits satisfied it. A hash cannot be typed into agreement.

## The one exemption, and the shape it had to take

Added 2026-08-13, on Silvio's call. An `assembly` or `macro` that **applies no heat anywhere** may be
offered unsourced. Everything in the table below is an invented heat, timing or doneness instruction;
stirring measured things into a bowl carries none of that by construction. Tier stays honest
(`authored` stays `authored`) and the cook screen still shows that tier's draft warning.

**The first version of the test was wrong in a way worth remembering.** It asked
`!steps.some(s => s.heat)`, reading a missing field as a claim of no heat. That field is unpopulated
across most of this corpus: eight recipes print "Oven to 450F", "Air fryer at 375F for 10 minutes",
"Bake 18 to 20 minutes" and carry `heat` on no step at all. All eight answered "no heat" to the gate.
They stayed out of the app only because their `form` is `dish` and their read stamps were stale,
neither of which is about heat, and `validate.mjs --strict` skips `_migration` recipes so nothing was
ever going to populate that field. **The gate was safe by coincidence, not by construction.**

So the absence is no longer evidence. A recipe must assert `provenance.heatFree: true`, and
`content/kitchen/heat-evidence.mjs` cross-checks that claim against the words on the screen, on every
recipe including migrated ones. Claim it on something that mentions an oven and the build exits 1.
Run `node content/kitchen/heat-evidence.mjs <id> -v` to see what it found.

That check also caught a live one: the Greek Yogurt Bowl's why-panel said *"microwave the fruit alone
for 20 seconds first"*, an unsourced heat instruction inside a dish offered on the grounds that it
applies no heat. Removed, re-read, re-stamped.

The offered catalogue went to **0 of 30** the moment this landed. That is the correct number.

**What this means in practice, and it is a product change rather than a restriction:** the job is no
longer to adapt a recipe to this kitchen. It is to **find a published recipe this kitchen already
satisfies exactly**. If none exists, either something gets bought or no dish is offered. Searching for
a dish and then bending it is the motion that has failed five times.

See `.agents/ENGINEERING.md` for the four laws this sits under.

---

# Agents do not write cooking steps any more

Decided by Silvio on the evening of 2026-08-09, after the first dish ever cooked from this app
burnt, having passed every check the project had.

## What happened, because the reasoning matters more than the rule

Chicken Piccata was, by the standards this project had built over three months:

- **Sourced.** Every quantity cross-checked against six published recipes with about 1,440 ratings
  behind them, taking the middle where they disagreed.
- **Read.** Every one of its eighteen steps read as the app renders them, not as JSON. That pass
  found eleven defects and fixed them.
- **Validated.** Clean against a validator with rules for heat observables, performable doneness
  tests, ingredient closure in both directions, split arithmetic, rice ratios and provenance.

It burnt anyway. The four things that went wrong:

| What failed | Where the recipe was silent |
|---|---|
| Second batch of chicken went black | Step 10 said "cook the other 2 cutlets the same way" and nothing about heat. The pan is far hotter by then and loose flour is already cooking in it |
| Burnt patches went into the sauce | The blackening was not visible until after deglazing |
| He expected a yellow sauce at the reduce step | Nothing said the sauce is brown until the butter mounts |
| Rebuilt sauce would not thicken | Nothing tied the dredge flour to the thickening, at the moment it mattered |

**None of these is a wrong number.** Every one is a gap between the numbers. And every one came
from a sentence an agent wrote. Not a single failure came from a figure a published source gave.

That is the finding. Checking generated instructions harder does not work, because the defects are
in what the instructions leave out, and a check cannot see an absence it was never told to look for.

## The rule

**A recipe follows ONE published recipe, verbatim.** Its words, its order, its times, its
temperatures, its amounts.

An agent may add only the layer a printed page genuinely cannot provide:

- whether he has the ingredient, from his actual stock
- what a word means, in place ("dredge", "fond", "mount")
- what a piece of equipment is, and which one of his it means
- protein computed from his scale
- a timer
- a doneness test **only where the source gives one**

An agent may **never**:

- write an instruction the source does not have
- change a time, a temperature, an amount, or the order of steps
- omit a step the source has
- introduce a number that does not appear in the source

The source sentence is the instruction. Our writing is annotation attached to it, and it is
rendered as visibly different from the instruction so he always knows which is which.

## Why this is not just the old rule again

Every previous fix here was a rule asking an agent to be more careful, and there have been eight of
them. This one changes what the agent is *for*. It is no longer an author who must be checked; it
is a translator, and a translation can be diffed against its original. `sourceText` on every step
makes "did you invent this" a mechanical question for the first time.

## What this costs, stated honestly

The teaching voice in the current recipes is genuinely good and some of it will not survive
attachment to someone else's sentences. That is the trade: the current voice produced a burnt
dinner, and a plain instruction that works beats a beautiful one that does not.

Dishes with no good published source do not get made, rather than getting invented.

## Enforcement

`validate.mjs`, on any recipe whose `provenance.tier` is `sourced`:

1. exactly one primary source, with a URL
2. every step carries non-empty `sourceText`
3. every number in a step's rendered instruction appears in that step's `sourceText`
4. `provenance.readAt` still required, and still invalidated by any edit
5. `provenance.cookedResult: "failed"` removes a dish from the offered list regardless of anything
   else it passes

Rules 1 to 3 are the new ones and they are what make this different from a promise.

---

# 2026-08-17: the verbatim rule was checking that an agent agreed with itself

Everything above stands. This is the mechanism it was missing.

`validate.mjs` enforced "follow one published recipe verbatim" by comparing each step's `text` against
its `sourceText` and refusing any number in the first that is not in the second. Both of those fields
are typed by the same agent in the same edit. **The check verifies that an agent agrees with itself,
and an agent that paraphrases a sentence paraphrases it into both fields.** Every one of the five
inventions that reached the stove on 2026-08-11 would have passed it.

Silvio arrived at the same place from the other end, asking why every session finished at the same
three dishes:

> *"Is Budget Bites going to be a good place to find actual recipes, or is it just going to be simple
> recipes? ... if it's the source then I'll personally go and open a website and copy paste all the
> information. I don't care."*

## `content/kitchen/import.mjs`

Fetches one page, or takes text he pasted, and writes `content/kitchen/imported/<id>.json`: the
publisher's ingredient lines and method, verbatim, with the yield, the times and the nutrition panel,
stamped with the date and hashed over the two lists.

`validate.mjs` then asserts that **every `sourceText` on a card appears in that capture**. Quoting a
sentence the page does not carry is now a build failure, so "did you invent this" is a diff against
the publisher rather than a promise. Proved by paraphrasing one clause of Honey Garlic Chicken's step
3 into exactly the shape that failed on 2026-08-11: exit 1.

Both cards that have been cooked, Honey Garlic Chicken and Cottage Cheese Pancakes, pass it untouched.
That is the useful result: they really were verbatim, and now something says so that is not an agent.

## What the capture is for, and what it is not

**It is evidence.** `imported/` is excluded from the prose linter for the same reason `corpus/` is:
BBC Good Food uses an en dash in her own tuna spaghetti method, and editing a captured sentence to
satisfy a punctuation rule about OUR writing would corrupt the one artefact whose entire value is
being exactly what the page said. It would also break the hash, which is the point of the hash.

**It is not a card.** Captures never go in `recipes/`, so an unfinished one cannot be offered and
cannot break `pnpm build`. Turning a capture into a card is still the judgement work this file has
always described: which of his pans she means, what a technique word means, an observable for the
induction hob, the protein arithmetic with its assumptions stated. That layer is unchanged. What has
changed is that the sentences underneath it are no longer retyped from memory.

## The corpus was never going to be the answer

Checked by name on 2026-08-17: Serious Eats, Simply Recipes, Allrecipes, Epicurious and Food.com all
list `ClaudeBot`, `anthropic-ai` or `Claude-User` under `Disallow: /`. Serious Eats spells out in a
comment that it covers retrieval as well as training. **That is theirs to decide and it is not worked
around.** The Kitchn and King Arthur Baking permit crawling and are worth adding.

So the corpus stays four or six sites, and it stays a menu rather than a source of cards. The route to
any other recipe on the internet is the one he named: he opens the page and hands the text over.
`--paste` on the importer, and the paste box on `/kitchen/want`, are that route.
