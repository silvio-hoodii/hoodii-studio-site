---
moved: 2026-10-18, verbatim from AGENTS.md, which now points here. Not re-audited beyond the dead paths fixed that day.
---

# Retired routes (moved from the routes table in AGENTS.md)

| Route | What | Writes gated |
|---|---|---|
| ~~`/kitchen/shop`~~ | **Deleted 2026-09-27 on the usage audit**: 0 ticks and 0 extras ever. 307s to /kitchen. The per-dish list stays on the dish page | n/a |
| ~~`/gym/conditioning`~~ | **Deleted 2026-08-27.** It held the whole week behind two levels of query parameters and every one of its URLs now 307s from `next.config.ts`: `?p=run` to `/run`, `?p=bike` to `/bike`, `?p=swim` to `/swim`, everything else to `/health`, sub-tab preserved in all three | n/a |
| ~~`/run`~~ | **Deleted 2026-10-10 on his ruling** ("if there's anything that refers to running, let's take it out"). `/run` and `/run/log` 307 to /health; the run plan left conditioning.json and validate.mjs refuses it coming back | n/a |
| ~~`/bike/api/ride`~~ | **Deleted 2026-09-27 on the usage audit**: 0 rides ever, and no form ever called it | n/a |
| ~~`/french`~~ | **Deleted 2026-09-27 on the usage audit**: 0 cards and 0 reviews ever on the web. 307s to /. LanguageOS on the laptop is untouched, and the `french_*` tables are kept | n/a |
| ~~`/reading/shelf`~~ | **Deleted 2026-09-27 on the usage audit** with the ReadingOS mirror: the want list had 0 rows ever and the shelf was the bot magnet. Page routes 307 to /reading | n/a |
| ~~`/reading/want`~~ | **Deleted 2026-09-27 on the usage audit** with the ReadingOS mirror: the want list had 0 rows ever and the shelf was the bot magnet. Page routes 307 to /reading | n/a |
| ~~`/reading/api/want`~~ | **Deleted 2026-09-27 on the usage audit** with the ReadingOS mirror: the want list had 0 rows ever and the shelf was the bot magnet. Page routes 307 to /reading | n/a |
| ~~`/reading/all`~~ | **Retired 2026-08-21**, 307s to `/reading/shelf`. Both browsed the same pool and the shelf page does everything it did plus covers, sorts, tiers, want and surprise. Its two unique features, Spanish books and pagination, moved across first. `src/lib/reading/catalog-*.ts` survive because `/reading/about` still uses them to list the sources | n/a |
| ~~`/reading/about`~~ | **Deleted 2026-09-15**, 307s to `/reading`. It explained the score and listed the source lists; see "Page text" above | n/a |
