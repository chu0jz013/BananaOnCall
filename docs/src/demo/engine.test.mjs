import { reducer, initial, clock, BEATS, REPEAT_EVERY, MAX_REPEATS } from './engine.built.mjs';

const L = {
  evAccepted: 'accepted', evQueued: 'queued', evFlood: 'flood', evClosed: 'closed',
  evPrimary: 'primary', evSecondary: 'secondary', evWarRoom: 'warroom',
  evAcked: 'acked', evResolved: 'resolved', evRepeat: (n) => `repeat ${n}`,
};
let fail = 0;
const is = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? '  ok  ' : 'FAIL  '}${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};
// advance simulated time in 0.1*speed steps, like the interval does
const run = (s, seconds, speed = 60) => {
  const step = 0.1 * speed;
  for (let i = 0; i < Math.ceil(seconds / step); i++) s = reducer(s, { type: 'tick', dt: step, labels: L });
  return s;
};

console.log('escalation schedule');
let s = reducer(initial, { type: 'fire', labels: L });
is('fire → running', s.phase, 'running');
is('fire → primary paged', s.level, 1);

s = run(s, BEATS[1]);                       // 300s
is('T+5m → secondary', s.level, 2);
is('secondary logged', s.events.at(-1).text, 'secondary');

s = run(s, BEATS[2] - BEATS[1]);            // 600s total
is('T+10m → war room', s.level, 3);

s = run(s, REPEAT_EVERY);                   // 1200s total
is('T+20m → first repeat', s.level, 4);
is('repeat text', s.events.at(-1).text, 'repeat 1');

console.log('\nack stops the clock');
let a = reducer(initial, { type: 'fire', labels: L });
a = run(a, 120);
const tAck = a.elapsed;
a = reducer(a, { type: 'ack', labels: L });
is('ack → acked', a.phase, 'acked');
const after = run(a, 600);
is('clock frozen after ack', after.elapsed, tAck);
is('no further escalation', after.level, a.level);

console.log('\nresolved payload never escalates');
let r = reducer({ ...initial, payload: 'resolved' }, { type: 'fire', labels: L });
is('resolved → closed', r.phase, 'resolved');
is('no escalation level', r.level, 0);
r = run(r, 1800);
is('still resolved', r.phase, 'resolved');

console.log('\nflood collapses');
let f = reducer({ ...initial, payload: 'flood' }, { type: 'fire', labels: L });
is('flood logs the collapse', f.events[1].text, 'flood');
is('flood still escalates', f.level, 1);

console.log('\nrepeat cap');
let c = reducer(initial, { type: 'fire', labels: L });
c = run(c, BEATS[2] + REPEAT_EVERY * (MAX_REPEATS + 20));
is(`level caps at 3 + ${MAX_REPEATS}`, c.level, 3 + MAX_REPEATS);

console.log('\nclock format');
is('0.04s', clock(0.04), '00:00.04');
is('300s', clock(300), '05:00.00');

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
