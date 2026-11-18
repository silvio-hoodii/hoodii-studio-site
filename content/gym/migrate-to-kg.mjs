#!/usr/bin/env node
/** ONE UNIT IN gym_set, kg, from 2026-11-18. Re-runnable: it converts only rows not yet marked.
 *
 * He moved to Smart Fit Pizarro (Trujillo), where the plates and dumbbells are kg. The table held lb.
 * Two ways to carry both: mark each row with its unit and make every reader convert, or convert once.
 * Every reader converting is the representable error (one forgotten SELECT and a card offers 185 kg),
 * and there are about a dozen readers. So the table is converted, once, here: `weight` and
 * `suggested_weight` become kg to 0.1, the typed lb numbers stay beside them in `weight_lb` and
 * `suggested_weight_lb`, and `unit` is constrained to 'kg' so an lb write cannot land.
 *
 * Outside readers checked the same day: HealthOS (publish-current.mjs, src/lib/health/db.ts) read
 * gym_set DATES only. The 2026-10-04 analysis scripts under HealthOS/knowledge are dated one-offs.
 *
 * Usage:  node content/gym/migrate-to-kg.mjs            (dry run: counts and a sample)
 *         node content/gym/migrate-to-kg.mjs --apply    (one transaction)
 * Reads GYM_DATABASE_URL (or KITCHEN_DATABASE_URL) from the environment or .env.local. */
import { Client } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'node:fs';

const env = existsSync('.env.local')
  ? Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }))
  : {};
const url = process.env.GYM_DATABASE_URL || env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL || env.KITCHEN_DATABASE_URL;
if (!url) throw new Error('GYM_DATABASE_URL not set');
const apply = process.argv.includes('--apply');
const LB = 0.45359237;

const c = new Client(url);
await c.connect();
try {
  await c.query('begin');
  await c.query(`alter table gym_set add column if not exists weight_lb real`);
  await c.query(`alter table gym_set add column if not exists suggested_weight_lb real`);
  await c.query(`alter table gym_set add column if not exists unit text`);
  const before = (await c.query(`select count(*)::int n, count(*) filter (where unit is null)::int todo,
      count(*) filter (where unit is null and weight is not null)::int weighted from gym_set`)).rows[0];
  console.log('rows', before);
  const sample = (await c.query(`select id, date, exercise_id, weight, round((weight * ${LB})::numeric, 1)::real kg
      from gym_set where unit is null and weight is not null order by date desc, id limit 5`)).rows;
  console.table(sample);
  await c.query(`update gym_set set
      weight_lb = weight,
      suggested_weight_lb = suggested_weight,
      weight = case when weight is null then null else round((weight * ${LB})::numeric, 1)::real end,
      suggested_weight = case when suggested_weight is null then null else round((suggested_weight * ${LB})::numeric, 1)::real end,
      unit = 'kg'
    where unit is null`);
  await c.query(`alter table gym_set alter column unit set default 'kg'`);
  await c.query(`alter table gym_set alter column unit set not null`);
  await c.query(`do $$ begin
      if not exists (select 1 from pg_constraint where conname = 'gym_set_unit_kg') then
        alter table gym_set add constraint gym_set_unit_kg check (unit = 'kg');
      end if; end $$`);
  /* Readback inside the transaction: every row kg, and the lb numbers still there to undo with. */
  const after = (await c.query(`select count(*) filter (where unit <> 'kg')::int not_kg,
      count(*) filter (where weight is not null and weight_lb is null and date < '2026-11-18')::int lost_lb,
      max(weight) max_kg, max(weight_lb) max_lb from gym_set`)).rows[0];
  console.log('after', after);
  if (after.not_kg !== 0 || after.lost_lb !== 0) throw new Error('readback failed, rolling back');
  if (apply) { await c.query('commit'); console.log('APPLIED'); }
  else { await c.query('rollback'); console.log('dry run: rolled back. Pass --apply to keep it.'); }
} catch (e) {
  await c.query('rollback').catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await c.end();
}
