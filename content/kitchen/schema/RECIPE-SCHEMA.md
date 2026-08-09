---
last-updated: 2026-08-09
status: live
---

# The recipe schema

**This file is short on purpose.** Every previous attempt to fix KitchenOS recipes wrote more prose
rules into `DESIGN.md`, which is now 1,015 lines, and the recipes kept breaking anyway. Rules that
depend on an agent reading and obeying them have failed roughly eight times. The enforcement here is
`validate.mjs`, which exits non-zero. This document explains the shape. The validator is what makes
it true.

---

## The one idea

A recipe is **data**. The app renders the prose. It is not prose with some tags bolted on.

That inversion is the whole fix, and every recurring bug in this project is a consequence of having
it backwards:

| What he wrote at the stove | Root cause | What the schema does |
|---|---|---|
| *"What baking sheet this wasn't on the list wtf"* | No equipment existed as data | `equipment[]` is declared, validated against `equipment.json`, and **generated into the prep list from what the steps actually use** |
| *"Wasn't mentioned that i would need the whites of the green onions"* | Steps referenced things no list knew about | Every `step.uses` ref must resolve to an `ingredients[]` entry, and every ingredient must be used by some step. Both directions |
| *"the instruction was put the cottage cheese in and I didn't know how much"* | Quantities lived in whichever paragraph first mentioned them | Quantity lives on the ingredient. Any step that uses it can render the amount inline, at every mention |
| Rice hard: 2 cups water to 2 cups long-grain | Prose nobody could check | Ratios are numbers in a checked field |
| Rice hard again: "the lowest setting that still bubbles" | Written blind to an induction hob with inconsistent dials | `heat.target` is a **required observable**, and dial references are a hard failure |

---

## Shape

```jsonc
{
  "id": "bulgogi",
  "name": "Beef Bulgogi and Mushroom Pot Rice",
  "build": "2026-08-09a",
  "form": "dish",              // dish | technique | method | assembly | macro
  "meal": ["dinner"],
  "why": "Why this dish is in the app at all. One paragraph, his language.",

  "time": { "activeMin": 45, "totalMin": 75, "note": "30 of it the rice soaking" },

  "serves": {
    "count": 4, "unit": "portion", "proteinPerUnit": 33,
    "proteinMath": "500 g sirloin at 26 g/100 g = 130 g, + 12 g from 2 cups cooked rice, / 4 = 35 g. Rounded to 33 for trim loss."
  },

  "ingredients": [
    { "ref": "beef", "stock": "roast", "display": "sirloin tip roast",
      "qty": 500, "unit": "g", "prep": "sliced 2 to 3 mm across the grain",
      "defining": true },

    { "ref": "onion_whites", "stock": "greenonion", "display": "green onions, WHITE parts",
      "qty": 4, "unit": "stalk", "prep": "whites cut into 1 cm pieces, greens kept separate",
      "defining": false }
  ],

  "equipment": ["pan_stainless_large", "ricecooker", "knife_sharp", "cuttingboard", "bowlset"],

  "steps": [
    { "n": 1,
      "text": "...",
      "uses": ["beef"],                        // must resolve to ingredients[].ref
      "equipment": ["knife_sharp", "cuttingboard"],  // must resolve to equipment[]
      "minutes": 15,
      "heat": null,
      "doneness": { "test": "Tilt the pan. If liquid runs, it is not ready.", "kind": "look" }
    }
  ]
}
```

---

## The four hard rules

**1. Both directions must close.** Every `step.uses` resolves to an ingredient. Every ingredient is
used by at least one step. Same for equipment. An ingredient nobody uses is a shopping-list lie; a
step using something undeclared is the green-onion-whites bug.

**2. Heat is an observable, never a position.** The stovetop is **induction**, confirmed 2026-08-08.
Dial scales are inconsistent across its burners: some run 1 to 120, some 1 to 10, some just
low/medium/high. So `heat.target` describes what the pot should be **doing** and is required on
every stovetop step. Oven steps take a real temperature instead, because an oven's 425F is
unambiguous. Any of "lowest setting", "turn it down a notch", "medium-low on the dial" is a hard
failure.

**3. Doneness is a test he can perform, not a sense he has to have.** `doneness.test` must be a
physical action with a binary result. *"Tilt the pot, is there standing liquid?"* passes. *"Wait
until it sizzles rather than hisses"* fails, and it failed for real on 2026-08-02.

**4. `defining: true` means the dish does not exist without it.** Capers on a piccata. If a defining
ingredient is missing, the dish is **not offered** and is not adapted. The app does not argue.
Either buy the capers or it is a lemon butter pan sauce with a different name.

---

## Splits must sum

Added 2026-08-09 after auditing the old recipes. A cross-check of quantities in the ingredient table
against quantities in the step prose found **eleven mismatches**, and every single one turned out to
be a legitimate split rather than an error: 2 tbsp of oil going in as 1 tbsp then 1 tbsp, 1.5 cups of
milk going in as 0.5 then 1, 2 tsp of salt split across two batches of beef.

Which is the actual problem. **In prose a split and a drift look identical**, so neither a human nor a
script can tell them apart, and every check has to be resolved by hand. Declared as data it is
arithmetic:

```jsonc
"uses": [
  { "ref": "oil", "amount": 1, "unit": "tbsp" },       // step 4
  { "ref": "oil", "amount": 1, "unit": "tbsp" }        // step 5
]                                                       // must sum to ingredients.oil.qty
```

A step that touches an ingredient without consuming a measurable share of it (stirring the eggs it
already has, adding back peppers set aside earlier) declares `"amount": 0, "optional": true` so it
still counts for closure but not for the sum.

## Staples are not stock

`"staple": true` on an ingredient means presence is binary and lives in `KITCHEN.md`, not in the
event-sourced stock. Spices, flour, oil. This is the slow half of the three-speeds model in
`README.md` and it is deliberate: those things are not tracked, so no stock link is correct rather
than an omission.

---

## Why `defining` exists

Stated 2026-08-08, and it is the sharpest thing anyone has said about this app:

> *"I mentioned Chicken Picara at some point and it's like, oh for this you need Kapers. It's right
> there in the app, the main thing. What's the point of me doing that if I don't have Kapers? The
> only reason that the name is that is because of the Kapers."*

The old behaviour was to show the dish and append *"No capers, and you can still make this."* That is
the app arguing with the person holding the pan. A dish named after an ingredient he does not have is
not a dish he can cook.

Non-defining absences still adapt, and that is still good. Frozen peppers standing in for fresh does
not change what the dish is.

---

## Where a recipe may come from

Unchanged from `DESIGN.md`: a named source, or his own kitchen. What changes is that **importing a
source now means mapping it into this schema**, and the validator will tell you exactly what the
source left implicit. Most published recipes fail rule 1 on first import, because they are written
for people who already cook.

That is the point. The gap between a published recipe and this schema **is** the beginner gap.

---

## Files

| Path | What |
|---|---|
| `schema/equipment.json` | Canonical equipment vocabulary. `present:false` entries are hard failures |
| `schema/RECIPE-SCHEMA.md` | This |
| `recipes/<id>.json` | One file per dish. Replaces the 1,460-line `DISHES` array |
| `validate.mjs` | `node KitchenOS/validate.mjs`. Run before claiming anything works |
