import { neon } from '@neondatabase/serverless';
import { daysAgo, today } from '@/lib/day';

/* His own app opens, one row per day per app. See content/usage/schema.sql for why this exists. */
const DATABASE_URL = process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!DATABASE_URL) throw new Error('GYM_DATABASE_URL (or KITCHEN_DATABASE_URL) is not set');
const sql = neon(DATABASE_URL);

/* The apps a beacon may name. A closed list, so a typo in a layout cannot mint a new "app" and the
   next audit does not have to guess what "helath" was. */
export const APPS = ['home', 'gym', 'health', 'run', 'bike', 'swim', 'curio', 'music', 'reading', 'kitchen'] as const;
export type App = (typeof APPS)[number];

export function isApp(v: unknown): v is App {
  return typeof v === 'string' && (APPS as readonly string[]).includes(v);
}

export async function recordOpen(app: App): Promise<void> {
  await sql`
    insert into app_open (day, app) values (${today()}, ${app})
    on conflict (day, app) do update set opens = app_open.opens + 1, last_at = now()`;
}

export interface OpenRow { day: string; app: string; opens: number }

/* The last `days` days of his opens, oldest first. For the strip on the index. */
export async function getOpens(days = 30): Promise<OpenRow[]> {
  const rows = (await sql`
    select to_char(day, 'YYYY-MM-DD') as day, app, opens from app_open
     where day > ${daysAgo(days)} order by day`) as OpenRow[];
  return rows;
}
