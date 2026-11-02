/* Run: node --experimental-strip-types src/lib/gym/stations.test.ts
 * In scripts/verify.mjs. */
import {
  STATIONS, GET_READY_SEC, assignment, picked, MOVE_SEC, ROUND_REST_SEC, SWITCH_SEC,
  logId, phaseAt, stationAt, timeline, totalSeconds,
} from './stations.ts';

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) return;
  failed++;
  console.error(`FAIL ${name}`, detail ?? '');
}

/* ---- nobody waits for gear ---- */
const owner = new Map<string, string>();
for (const st of STATIONS) {
  for (const g of st.gear) {
    check(`${g} belongs to one station`, !owner.has(g), [owner.get(g), st.id]);
    owner.set(g, st.id);
  }
  for (const slot of [st.legs, st.upper, st.legs2]) {
    check(`${st.id} offers a choice in every slot`, slot.length >= 2);
    for (const ex of slot) {
      for (const g of ex.gear) check(`${ex.id} uses only ${st.id}'s gear`, st.gear.includes(g), g);
    }
  }
}
check('more stations than the three people', STATIONS.length >= 4);

/* ---- his standing rulings ---- */
const all = STATIONS.flatMap((s) => [...s.legs, ...s.upper, ...s.legs2]);
check('no calf raises (his ruling)', !all.some((e) => /calf/i.test(e.name)));
check('no running (his ruling)', !all.some((e) => /\brun/i.test(e.name)));

/* ---- ids ---- */
const ids = all.map((e) => e.id);
check('exercise ids unique', new Set(ids).size === ids.length, ids);
check('every logged id is prefixed away from the programme', all.every((e) => logId(e).startsWith('st-')));

/* ---- the clock ---- */
const cfg = { rounds: 3, workSec: 45 };
const t = timeline(cfg);
const expected = GET_READY_SEC
  + 3 * 4 * (45 + SWITCH_SEC + 45)
  + 3 * 3 * MOVE_SEC
  + 2 * ROUND_REST_SEC;
check('total adds up', totalSeconds(cfg) === expected, [totalSeconds(cfg), expected]);
check('phases are contiguous', t.every((p, i) => i === 0 || p.startsAt === t[i - 1]!.startsAt + t[i - 1]!.length));
check('starts with get ready', phaseAt(0, cfg).phase.kind === 'ready');
check('first work right after', phaseAt(GET_READY_SEC, cfg).phase.kind === 'first');
check('remaining never reads 0 while running', phaseAt(GET_READY_SEC - 0.1, cfg).remaining === 1);
check('negative elapsed is the start', phaseAt(-5, cfg).phase.kind === 'ready');
check('ends done', phaseAt(expected, cfg).done && phaseAt(expected + 999, cfg).phase.kind === 'done');
check('still running a moment before the end', !phaseAt(expected - 0.5, cfg).done);
check('last phase of the session is work, not a rest', t[t.length - 1]!.kind === 'second');

const rests = t.filter((p) => p.kind === 'rest');
check('a rest between rounds only', rests.length === 2, rests.length);
const steps = new Set(t.filter((p) => p.kind === 'first').map((p) => p.step));
check('every station-round is a step', steps.size === 12, steps.size);

/* ---- everyone rotates without colliding, from any three different starts ---- */
for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
  if (a === b || b === c || a === c) continue;
  for (const step of steps) {
    const at = new Set([stationAt(a, step), stationAt(b, step), stationAt(c, step)]);
    check('three people never share a station', at.size === 3, [a, b, c, step]);
  }
}
check('wraps round', stationAt(3, 1) === 0 && stationAt(2, 5) === 3);

/* ---- what the screen tells each person ---- */
const noPicks = {};
const a0 = assignment('first', 0, 12, 1, 'full', noPicks);
check('person starting at 2 is on station 2', a0.station.id === STATIONS[1]!.id);
check('exercise 1 is the legs row', a0.now?.id === STATIONS[1]!.legs[0]!.id);
const full = assignment('second', 0, 12, 0, 'full', noPicks);
const legs = assignment('second', 0, 12, 0, 'legs', noPicks);
check('full body gets the upper row', full.now?.id === STATIONS[0]!.upper[0]!.id);
check('legs only gets the second legs row', legs.now?.id === STATIONS[0]!.legs2[0]!.id);
check('after exercise 2 the next station is named', full.nextStation?.id === STATIONS[1]!.id && full.next?.id === STATIONS[1]!.legs[0]!.id);
const sw = assignment('switch', 0, 12, 0, 'full', noPicks);
check('switch asks for the exercise just done', sw.justDid?.id === STATIONS[0]!.legs[0]!.id && sw.now === null);
const mv = assignment('move', 0, 12, 0, 'legs', noPicks);
check('move asks for exercise 2', mv.justDid?.id === STATIONS[0]!.legs2[0]!.id);
const last = assignment('second', 11, 12, 0, 'full', noPicks);
check('the very last exercise has nothing after it', last.next === null && last.nextStation === null);
const done = assignment('done', 11, 12, 0, 'full', noPicks);
check('done still asks for the last reps', done.justDid != null && done.now === null);
const chosen = { 'bands:legs2': 'monster-walk' };
check('a pick is honoured', picked(STATIONS[2]!, 'legs2', chosen).id === 'monster-walk');
check('band walks are offered', ['band-side-walk', 'monster-walk'].every((id) => STATIONS[2]!.legs2.some((e) => e.id === id)));
check('raises are offered', ['lateral-raise', 'rear-raise', 'front-raise'].every((id) => STATIONS[3]!.upper.some((e) => e.id === id)));

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('stations: all passed');
