/**
 * Headless soak.
 *
 *   npm run sim -- 60                    60 days, default seed, honest play
 *   npm run sim -- 60 7                  …on seed 7
 *   npm run sim -- 60 7 everything       …with the admin panel set up to reach every system
 *   npm run sim -- 60 7 all              every scenario in turn, with a combined coverage table
 *
 * Scenarios other than `honest` use the admin panel (the same `cheat` actions behind the fold in
 * the help sheet), so the world comes back stamped `cheated`. **Only the honest run's economy
 * numbers mean anything**; the others exist to reach systems an honest player needs many days to
 * assemble, which is how three feature passes shipped with the bot unable to see them.
 */
import { SCENARIOS, SCENARIO_NAMES, isScenario, type ScenarioName } from './bot/admin';
import { fullyCovered, missing, neverRan, report, type Coverage, type Counter } from './bot/coverage';
import { OP_DEFS } from '@content/rackets';
import { run, summary } from './bot/run';
import { select } from '@sim/index';

const days = Number(process.argv[2] ?? 40);
const seed = Number(process.argv[3] ?? 7);
const which = process.argv[4] ?? 'honest';

if (which !== 'all' && !isScenario(which)) {
  console.error(`Unknown scenario "${which}". Try one of: ${SCENARIO_NAMES.join(', ')}, or "all".`);
  process.exit(1);
}

const names: ScenarioName[] = which === 'all' ? SCENARIO_NAMES : [which as ScenarioName];
const combined: Coverage[] = [];

for (const name of names) {
  const r = run({ days, seed, scenario: name });
  combined.push(r.cov);
  console.log(`\n=== ${name}: ${SCENARIOS[name].blurb} ===`);
  for (const line of summary(r)) console.log(line);
  for (const line of report(r.cov)) console.log(line);
  if (names.length === 1 && !fullyCovered(r.cov)) {
    console.log(`  → this run never touched: ${missing(r.cov).join(', ')}.`);
    if (name === 'honest') console.log('  → that is expected: honest play reaches little in 60 days. For coverage run: npm run sim -- 60 7 all');
  }
  if (names.length === 1) {
    for (const l of r.w.log.filter(l => l.text.startsWith('Day ') && l.day % 10 === 0)) console.log(`[${l.day}] ${l.text}`);
    console.log('--- last 12 ---');
    for (const l of r.w.log.slice(-12)) console.log(`[${l.day}] ${l.tone.padEnd(5)} ${l.text}`);
    console.log(`state size ${(JSON.stringify(r.w).length / 1024).toFixed(0)} KB; ${Object.keys(r.w.npcs).length} npcs, ${Object.keys(r.w.businesses).length} businesses, ${select.authorities(r.w).length} authorities`);
  }
}

if (names.length > 1) {
  // one table across every scenario: what did this whole sweep never touch?
  const merged = combined.reduce((acc, c) => {
    for (const [k, v] of Object.entries(c.counts)) acc.counts[k as Counter] = (acc.counts[k as Counter] ?? 0) + v;
    for (const [k, v] of Object.entries(c.opKinds)) acc.opKinds[k] = (acc.opKinds[k] ?? 0) + v;
    for (const [k, v] of Object.entries(c.complicationKinds)) acc.complicationKinds[k] = (acc.complicationKinds[k] ?? 0) + v;
    for (const x of c.warnings) if (!acc.warnings.includes(x)) acc.warnings.push(x);
    return acc;
  });
  console.log(`\n=== all scenarios combined ===`);
  for (const line of report(merged)) console.log(line);
  const cold = neverRan(merged, Object.keys(OP_DEFS));
  console.log(`  ops never run (${cold.length}/${Object.keys(OP_DEFS).length}): ${cold.join(', ') || 'none — the whole roster ran'}`);
  console.log(fullyCovered(merged) ? 'every system was exercised at least once.' : `NEVER EXERCISED: ${missing(merged).join(', ')}`);
}
