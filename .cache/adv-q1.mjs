import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.GYM_DATABASE_URL);
const cols = await sql`select column_name, data_type from information_schema.columns where table_name='health_watch_session' order by ordinal_position`;
console.log('COLUMNS', JSON.stringify(cols));
const kinds = await sql`select kind, count(*) c, min(date) mn, max(date) mx from health_watch_session group by kind order by c desc`;
console.log('KINDS', JSON.stringify(kinds));
const kinds26 = await sql`select kind, count(*) c from health_watch_session where date::date >= '2026-01-01' group by kind order by c desc`;
console.log('KINDS_2026', JSON.stringify(kinds26));
