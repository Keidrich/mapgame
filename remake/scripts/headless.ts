/**
 * `npm run sim2 -- <days> <seed> [size] [background] [style|all]` — play the remake headless and
 * print the curve. With `all`, the same seed is played by every temperament from timid to maniac
 * and the runs are compared side by side, with coverage taken across all of them: a system only
 * the maniac reaches is still reached, and one none of them reaches is named. With `catalogue`, a
 * mid-game empire on day one plays every job in the catalogue once (not an economy curve).
 */
import { run, missing, SYSTEMS, STYLES, STYLE_IDS, type RunResult, type StyleId } from './bot';
import { select } from '@r/sim/index';
import { JOBS } from '@r/content/world';
import type { JobKind } from '@r/sim/types';
import type { Background } from '@r/sim/types';

const [daysArg, seedArg, sizeArg, bgArg, styleArg] = process.argv.slice(2);
const days = Number(daysArg ?? 60), seed = Number(seedArg ?? 7);
const size = (sizeArg as 'small' | 'medium' | 'large') ?? 'medium';
const background = (bgArg as Background) ?? 'grifter';

const w0 = (r: RunResult) => r.w;
function one(style: StyleId, scenario?: 'catalogue' | 'region'): RunResult {
  const t0 = performance.now();
  const r = run({ days, seed, size, background, style, scenario });
  if (scenario) console.log(`scenario ${scenario} (a mid-game empire on day one — this is not an economy curve)`);
  if (w0(r).region) console.log(`region: ${r.w.region!.cities.map(x => `${x.name}${x.founded ? ` ${(select.controlIn(r.w, x.id) * 100).toFixed(1)}%` : x.open ? ' (open)' : ''}`).join(' · ')}; routes ${(r.w.routes ?? []).length}`);
  const w = r.w; const p = w.player;
  console.log(`${w.city.name} (seed ${seed}, ${STYLES[style].label.toLowerCase()}) — ${w.day - 1} days in ${((performance.now() - t0) / 1000).toFixed(1)}s, ${r.actions} actions, ${r.refused} refused`);
  for (const h of w.history.filter(x => x.day % 5 === 0 || x.day === 1)) console.log(`  day ${String(h.day).padStart(3)}  clean ${String(h.clean).padStart(6)}  dirty ${String(h.dirty).padStart(6)}  spent ${String(h.spent).padStart(5)}  heat ${String(h.heat).padStart(3)}  control ${String(h.control).padStart(5)}%  worth ${h.worth}`);
  console.log(`end: cash ${p.cash} dirty ${p.dirty} heat ${Math.round(p.heat)} fear ${Math.round(p.fear)} respect ${Math.round(p.respect)} rank ${select.rankOf(w).label} | crew ${p.crewIds.length} rackets ${p.racketIds.length} owned ${p.businessIds.length} protected ${select.protectedBy(w).length} safehouses ${p.safehouseIds.length} | control ${(select.controlShare(w) * 100).toFixed(1)}%`);
  console.log(`factions: ${Object.values(w.factions).map(f => `${f.short} ${f.alive ? `${select.factionBlocks(w, f.id).length}b ${Math.round(f.standing)}st` : 'gone'}`).join(' · ')}`);
  console.log(`commission: ${w.commission.seated ? 'seated' : 'no seat'}; ${w.commission.history.map(h => `d${h.day} ${h.kind} ${h.passed ? 'passed' : 'failed'}`).join(', ') || 'never met'}`);
  if (w.over) console.log(`OVER: ${w.over.ending} on day ${w.over.day}: ${w.over.text}`);
  if (w.won) console.log('WON the city.');
  return r;
}

/** Every job kind, and which of them no run reached a result on. */
function catalogue(kinds: RunResult['kinds']) {
  const all = Object.keys(JOBS) as JobKind[];
  const never = all.filter(k => !kinds[k]);
  console.log(`job kinds run: ${all.length - never.length}/${all.length}${never.length ? ` — never: ${never.join(', ')}` : ''}`);
}
function coverage(counts: RunResult['counts']) {
  console.log('coverage:');
  for (const s of SYSTEMS) console.log(`  ${s.needs.some(n => (counts[n] ?? 0) > 0) ? '✓' : '✗'} ${s.label.padEnd(28)} ${s.needs.map(n => counts[n] ?? 0).join('/')}`);
  const m = missing(counts); if (m.length) console.log(`never reached: ${m.join(', ')}`);
}

if (styleArg === 'all') {
  const runs = STYLE_IDS.map(id => ({ id, r: one(id) }));
  console.log('\nthe sweep, mildest to wildest:');
  console.log(`  ${'style'.padEnd(9)} ${'worth'.padStart(8)} ${'control'.padStart(8)} ${'heat'.padStart(5)} ${'crew'.padStart(5)} ${'jobs'.padStart(7)} ${'wars'.padStart(5)} ${'hostg'.padStart(6)} ${'kit'.padStart(4)} ${'heirs'.padStart(6)}  ending`);
  for (const { id, r } of runs) {
    const w = r.w, k = r.counts, last = w.history[w.history.length - 1];
    const heirs = w.player.generation - 1;
    console.log(`  ${STYLES[id].label.padEnd(9)} ${String(last?.worth ?? 0).padStart(8)} ${(select.controlShare(w) * 100).toFixed(1).padStart(7)}% ${String(Math.round(w.player.heat)).padStart(5)} ${String(w.player.crewIds.length).padStart(5)} ${`${k.jobs_done ?? 0}/${(k.jobs_done ?? 0) + (k.jobs_failed ?? 0)}`.padStart(7)} ${String(k.declared ?? 0).padStart(5)} ${String((k.hostages_taken ?? 0) + (k.crew_snatched ?? 0)).padStart(6)} ${String(k.kit_bought ?? 0).padStart(4)} ${String(heirs).padStart(6)}  ${w.over ? `${w.over.ending} d${w.over.day}` : w.won ? 'won' : 'alive'}`);
  }
  const union: RunResult['counts'] = {};
  for (const { r } of runs) for (const [k, v] of Object.entries(r.counts)) union[k as keyof typeof union] = (union[k as keyof typeof union] ?? 0) + (v ?? 0);
  console.log('\nacross every style:');
  coverage(union);
  const kinds: RunResult['kinds'] = {};
  for (const { r } of runs) for (const [k, v] of Object.entries(r.kinds)) kinds[k as JobKind] = (kinds[k as JobKind] ?? 0) + (v ?? 0);
  catalogue(kinds);
} else if (styleArg === 'region') {
  const r = one('steady', 'region');
  coverage(r.counts);
} else if (styleArg === 'catalogue') {
  const r = one('collector', 'catalogue');
  coverage(r.counts);
  catalogue(r.kinds);
  const all = Object.keys(JOBS) as JobKind[];
  for (const k of all.filter(x => !r.kinds[x])) console.log(`  ${k.padEnd(20)} offered ${r.offered[k] ?? 0}, taken ${r.taken[k] ?? 0}`);
} else {
  const r = one((styleArg as StyleId) ?? 'steady');
  coverage(r.counts);
  catalogue(r.kinds);
  console.log('news:', r.w.news.slice(-6).map(n => n.text).join(' | '));
}
