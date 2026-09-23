/**
 * `npm run sim2 -- <days> <seed> [size] [background]` — play the remake headless and print the curve.
 */
import { run, missing, SYSTEMS } from './bot';
import { select } from '@r/sim/index';
import type { Background } from '@r/sim/types';

const [daysArg, seedArg, sizeArg, bgArg] = process.argv.slice(2);
const days = Number(daysArg ?? 60), seed = Number(seedArg ?? 7);
const t0 = performance.now();
const r = run({ days, seed, size: (sizeArg as 'small' | 'medium' | 'large') ?? 'medium', background: (bgArg as Background) ?? 'grifter' });
const w = r.w; const p = w.player;
console.log(`${w.city.name} (seed ${seed}) — ${w.day - 1} days in ${((performance.now() - t0) / 1000).toFixed(1)}s, ${r.actions} actions, ${r.refused} refused`);
for (const h of w.history.filter(x => x.day % 5 === 0 || x.day === 1)) console.log(`  day ${String(h.day).padStart(3)}  clean ${String(h.clean).padStart(6)}  dirty ${String(h.dirty).padStart(6)}  spent ${String(h.spent).padStart(5)}  heat ${String(h.heat).padStart(3)}  control ${String(h.control).padStart(5)}%  worth ${h.worth}`);
console.log(`end: cash ${p.cash} dirty ${p.dirty} heat ${Math.round(p.heat)} fear ${Math.round(p.fear)} respect ${Math.round(p.respect)} rank ${select.rankOf(w).label} | crew ${p.crewIds.length} rackets ${p.racketIds.length} owned ${p.businessIds.length} protected ${select.protectedBy(w).length} safehouses ${p.safehouseIds.length} | control ${(select.controlShare(w) * 100).toFixed(1)}%`);
console.log(`factions: ${Object.values(w.factions).map(f => `${f.short} ${f.alive ? `${select.factionBlocks(w, f.id).length}b ${Math.round(f.standing)}st` : 'gone'}`).join(' · ')}`);
if (w.over) console.log(`OVER: ${w.over.ending} on day ${w.over.day}: ${w.over.text}`);
if (w.won) console.log('WON the city.');
console.log('coverage:');
for (const s of SYSTEMS) console.log(`  ${s.needs.some(n => (r.counts[n] ?? 0) > 0) ? '✓' : '✗'} ${s.label.padEnd(28)} ${s.needs.map(n => r.counts[n] ?? 0).join('/')}`);
const m = missing(r.counts); if (m.length) console.log(`never reached: ${m.join(', ')}`);
console.log('news:', w.news.slice(-6).map(n => n.text).join(' | '));
