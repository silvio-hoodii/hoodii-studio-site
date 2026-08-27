import 'server-only';
import { neon } from '@neondatabase/serverless';

/* THE BIKE'S WRITE PATH, and for now the whole of it. Added 2026-08-27.
 *
 * Every other discipline on this site is read from something that already knows: the Samsung export
 * fills swim, run and body, and the gym pages write what he types into a workout that is running.
 * The bike has neither. The watch sees a heart rate and nothing else (src/lib/gym/session.ts:135:
 * "no rpm, no power, no resistance"), so the number the session is actually steered by, the
 * resistance level, exists nowhere unless he puts it somewhere.
 *
 * NO READ FUNCTION HERE, deliberately. /bike is Phase C of
 * docs/TRAINING-REDESIGN-PLAN-2026-08-26.md and nothing renders a ride yet. Exporting a getter
 * nothing imports is the exact shape of getRecentSessions in src/lib/gym/session.ts:99, which has
 * been written, correct and unused since it was added. When the page lands it can bring its own
 * query and know what it needs.
 *
 * Same Neon database as Kitchen, Gym, Health, French and Swim; the table prefixes keep them apart.
 * DDL, and the reasoning behind every constraint, in content/gym/schema.sql. */
const DATABASE_URL =
  process.env.BIKE_DATABASE_URL || process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('BIKE_DATABASE_URL (or GYM_DATABASE_URL / KITCHEN_DATABASE_URL as fallback) is not set');
}

export const sql = neon(DATABASE_URL);

export interface BikeRide {
  /** Calgary date, YYYY-MM-DD. See src/lib/day.ts for why the zone is named and not assumed. */
  date: string;
  minutes: number;
  /** The level he FINISHED each interval on, in order. One entry per interval that happened: four
   *  for the full Norwegian 4x4, three for the short version. Never padded. */
  resistance: number[];
  /** 1 to 10, or null when he did not say. Null is not "easy". */
  effort: number | null;
  note: string | null;
}

export async function addBikeRide(r: BikeRide): Promise<void> {
  /* The ::integer[] cast is not decoration. The parameter arrives as whatever the driver made of a
     JS array, and an unqualified parameter in this position can be read as text; the cast makes the
     column's type the one that decides, so a shape the constraints would catch cannot slip past
     them by arriving as a string. */
  await sql`
    insert into bike_ride (date, minutes, resistance, effort, note)
    values (${r.date}, ${r.minutes}, ${r.resistance}::integer[], ${r.effort}, ${r.note})
  `;
}
