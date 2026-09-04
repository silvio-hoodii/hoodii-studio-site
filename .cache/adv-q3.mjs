import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.GYM_DATABASE_URL);
const cols = await sql`select column_name from information_schema.columns where table_name='gym_note' order by ordinal_position`;
console.log('NOTE_COLS', JSON.stringify(cols.map(c=>c.column_name)));
// last 23 swims: local hour and whether a strength session started earlier that local day
const swims = await sql`
  with s as (
    select start_time, minutes, (start_time::timestamp at time zone 'UTC' at time zone 'America/Edmonton') lt
    from health_watch_session where kind='swimming' order by start_time desc limit 23),
  l as (select (start_time::timestamp at time zone 'UTC' at time zone 'America/Edmonton') lt, minutes from health_watch_session where kind='strength')
  select to_char(s.lt,'YYYY-MM-DD Dy HH24:MI') swim_local, s.minutes,
    exists(select 1 from l where l.lt::date = s.lt::date and l.lt < s.lt) lift_before_same_day
  from s order by s.lt desc`;
console.log('LAST23_SWIMS', JSON.stringify(swims));
const cnt = swims.reduce((a,r)=>{ const h=Number(r.swim_local.slice(-5,-3)); a.total++; if(h>=18)a.evening++; if(r.lift_before_same_day)a.afterLift++; return a;},{total:0,evening:0,afterLift:0});
console.log('LAST23_SUMMARY', JSON.stringify(cnt));
const cardio60 = await sql`select date, kind, minutes, to_char((start_time::timestamp at time zone 'UTC' at time zone 'America/Edmonton'),'HH24:MI') local from health_watch_session where kind in ('treadmill','running','cycling') and date::date >= (current_date - 60) order by date`;
console.log('RUN_BIKE_LAST60', JSON.stringify(cardio60));
const maxdate = await sql`select max(date) mx from health_watch_session`;
console.log('EXPORT_MAX_DATE', JSON.stringify(maxdate));
// stacked evenings since Aug 1: lift start, lift minutes, swim start, swim end local
const stack = await sql`
  with l as (select (start_time::timestamp at time zone 'UTC' at time zone 'America/Edmonton') lt, minutes from health_watch_session where kind='strength' and date::date>='2026-07-15'),
       s as (select (start_time::timestamp at time zone 'UTC' at time zone 'America/Edmonton') st, minutes from health_watch_session where kind='swimming')
  select to_char(l.lt,'MM-DD Dy') d, to_char(l.lt,'HH24:MI') lift_start, l.minutes lift_min,
         to_char(s.st,'HH24:MI') swim_start, s.minutes swim_min,
         round(extract(epoch from (s.st - (l.lt + make_interval(mins => l.minutes))))/60) gap_min,
         to_char(s.st + make_interval(mins => s.minutes),'HH24:MI') swim_end
  from l join s on s.st::date = l.lt::date and s.st > l.lt order by l.lt`;
console.log('STACKED_EVENINGS', JSON.stringify(stack));
const medians = await sql`
  with l as (select (start_time::timestamp at time zone 'UTC' at time zone 'America/Edmonton') lt, minutes from health_watch_session where kind='strength' and date::date>='2026-06-01'),
       s as (select (start_time::timestamp at time zone 'UTC' at time zone 'America/Edmonton') st, minutes from health_watch_session where kind='swimming')
  select percentile_cont(0.5) within group (order by extract(epoch from (s.st - (l.lt + make_interval(mins => l.minutes))))/60) med_gap,
         percentile_cont(0.5) within group (order by l.minutes) med_lift, percentile_cont(0.5) within group (order by s.minutes) med_swim,
         percentile_cont(0.5) within group (order by extract(hour from l.lt)*60+extract(minute from l.lt)) med_lift_start_min, count(*) n
  from l join s on s.st::date = l.lt::date and s.st > l.lt`;
console.log('STACK_MEDIANS', JSON.stringify(medians));
const notes = await sql`select * from gym_note order by 1 desc limit 45`;
console.log('NOTES', JSON.stringify(notes));
