/**
 * `npm run sim2 -- <days> <seed> [size] [background] [style|all]` — play the remake headless and
 * print the curve. With `all`, the same seed is played by every temperament from timid to maniac
 * and the runs are compared side by side, with coverage taken across all of them: a system only
 * the maniac reaches is still reached, and one none of them reaches is named. With `catalogue`, a
 * mid-game empire on day one plays every job in the catalogue once (not an economy curve). With
 * `scenarios`, all of the above at once — the temperaments, the catalogue and the region — with
 * coverage taken across every run: the Remake's answer to the original's `npm run sim -- 60 7 all`.
 * With `tutorial`, a rookie who only follows the quest strip (`tutorial.ts`), and the day each
 * temperament finished each quest.
 */
import { run, missing, SYSTEMS, STYLES, STYLE_IDS, type RunResult, type Scenario, type StyleId } from './bot';
import { tutorial, OPENING } from './tutorial';
import { select } from '@r/sim/index';
import { JOBS } from '@r/content/world';
import type { JobKind } from '@r/sim/types';
import type { Background } from '@r/sim/types';

const [daysArg, seedArg, sizeArg, bgArg, styleArg] = process.argv.slice(2);
const days = Number(daysArg ?? 60), seed = Number(seedArg ?? 7);
const size = (sizeArg as 'small' | 'medium' | 'large') ?? 'medium';
const background = (bgArg as Background) ?? 'grifter';

const w0 = (r: RunResult) => r.w;
function one(style: StyleId, scenario?: Scenario): RunResult {
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
} else if (styleArg === 'scenarios') {
  // every way the bot can play, side by side, with coverage taken across all of them: the five
  // temperaments on the natural city, the catalogue's mid-game empire, and the region
  const runs: { name: string; r: RunResult }[] = [
    ...STYLE_IDS.map(id => ({ name: STYLES[id].label, r: run({ days, seed, size, background, style: id }) })),
    { name: 'catalogue', r: run({ days, seed, size, background, scenario: 'catalogue' }) },
    { name: 'region', r: run({ days, seed, size, background, scenario: 'region' }) },
    { name: 'family', r: run({ days, seed, size, background, scenario: 'family' }) },
  ];
  console.log(`scenario sweep, seed ${seed}, ${days} days:`);
  for (const { name, r } of runs) {
    const w = r.w, last = w.history[w.history.length - 1];
    console.log(`  ${name.padEnd(10)} worth ${String(last?.worth ?? 0).padStart(8)}  home ${(select.controlShare(w) * 100).toFixed(1).padStart(5)}%  cities ${w.region?.cities.filter(c => c.founded).length ?? 1}  kinds ${Object.keys(r.kinds).length}  ${w.over ? `${w.over.ending} d${w.over.day}` : 'alive'}`);
  }
  const union: RunResult['counts'] = {}; const kinds: RunResult['kinds'] = {};
  for (const { r } of runs) {
    for (const [k, v] of Object.entries(r.counts)) union[k as keyof typeof union] = (union[k as keyof typeof union] ?? 0) + (v ?? 0);
    for (const [k, v] of Object.entries(r.kinds)) kinds[k as JobKind] = (kinds[k as JobKind] ?? 0) + (v ?? 0);
  }
  console.log('\nacross every scenario:');
  coverage(union);
  catalogue(kinds);
} else if (styleArg === 'tutorial') {
  // the tutorial: a rookie who only follows the quest strip, on three backgrounds, then the day each
  // temperament happened to finish each quest in its own play
  console.log(`the tutorial, seed ${seed}, ${days} days: the day each quest came up / was done`);
  const rookies = (['grifter', 'bruiser', 'brain'] as Background[]).map(bg => ({ bg, t: tutorial({ days, seed, size, background: bg }) }));
  const ids = rookies[0].t.steps.map(s => s.id);
  console.log(`  ${'quest'.padEnd(11)} ${rookies.map(r => `rookie ${r.bg}`.padStart(17)).join('')}`);
  for (const id of ids) console.log(`  ${id.padEnd(11)} ${rookies.map(r => { const s = r.t.steps.find(x => x.id === id)!; return `${s.up ?? '-'} / ${s.done ?? '-'}`.padStart(17); }).join('')}`);
  const stuck = rookies.flatMap(r => r.t.steps.filter(s => OPENING.includes(s.id) && s.done === undefined).map(s => `${r.bg} ${s.id}: ${s.stuck.slice(-2).join(' | ') || 'never came up'}`));
  console.log(stuck.length ? `stuck in the opening:\n  ${stuck.join('\n  ')}` : 'every opening quest done by every rookie');
  console.log('\nthe temperaments, day each quest was done:');
  const cols = STYLE_IDS.map(id => { const done: Record<string, number> = {}; run({ days, seed, size, background, style: id, onDay: w => { for (const l of select.leads(w)) if (l.done && done[l.id] === undefined) done[l.id] = w.day - 1; } }); return { id, done }; });
  console.log(`  ${'quest'.padEnd(11)} ${cols.map(c => STYLES[c.id].label.padStart(9)).join('')}`);
  for (const id of ids) console.log(`  ${id.padEnd(11)} ${cols.map(c => String(c.done[id] ?? '-').padStart(9)).join('')}`);
} else if (styleArg === 'family') {
  const r = one('steady', 'family');
  coverage(r.counts);
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
