/**
 * One soak run: build a world, optionally boost it through the admin panel, play N days, and
 * report what was actually exercised.
 *
 * Kept separate from the CLI so tests can run the bot directly and assert on coverage — the
 * whole point of the rebuild is that "the bot never reached this" is now a number a test can
 * fail on rather than something a person has to notice.
 */
import { PLAYER, dispatch, generateWorld, select, type World } from '@sim/index';
import { Rng } from '@sim/rng';
import { SCENARIOS, setUp, topUp, type ScenarioName } from './admin';
import { newCoverage, bump, warn, type Coverage } from './coverage';
import { answerEverything, buyKit, handleMoney, launchOps, planAnOp, promoteLieutenants, resetPolicy, resolveEvents, runTheEmpire, tallyNight, workTheStreet, workTheWire, type Ctx } from './policy';

export interface RunOpts {
  days: number;
  seed: number;
  scenario: ScenarioName;
  /** Ops the bot plans per day at most. More than one lets a run touch the roster faster. */
  opsPerDay?: number;
  origin?: { lat: number; lng: number };
  placeName?: string;
}

export interface RunResult { w: World; cov: Coverage; scenario: ScenarioName }

export function run(opts: RunOpts): RunResult {
  const { days, seed, scenario } = opts;
  const s = SCENARIOS[scenario];
  let w: World = generateWorld({
    origin: opts.origin ?? { lat: 41.88, lng: -87.63 },
    placeName: opts.placeName ?? 'Chicago',
    playerName: 'Bot', background: 'muscle', seed,
  });
  if (s.setup.length) w = setUp(w, s);

  const cov = newCoverage();
  resetPolicy();
  const c: Ctx = { w, rng: new Rng(seed * 7 + 1), cov, crewCap: s.crewCap };
  const startBlockId = select.startBlock(c.w).id;
  const opsPerDay = opts.opsPerDay ?? s.opsPerDay;

  for (let d = 0; d < days; d++) {
    c.w = topUp(c.w, s, d);
    bump(cov, 'days');

    // 1. anything waiting on you. Events first: they are the only thing that can queue a new
    //    confrontation, so clearing them means one pass at the door instead of two.
    resolveEvents(c);
    answerEverything(c);

    // 2. a district needs somebody running it, and you need something in your hands
    promoteLieutenants(c);
    buyKit(c);

    // 3. go and do something. The honest scenario plans no ops and holds no cards, so for it
    //    these three are no-ops and the day is exactly the shape the original bot's was.
    for (let i = 0; i < opsPerDay; i++) if (!planAnOp(c)) break;
    launchOps(c);
    workTheWire(c);

    // 4. the street, then the rest of the empire, then money — in that order, because the
    //    laundering has to come after the day that earned something to launder
    workTheStreet(c);
    runTheEmpire(c, startBlockId);
    handleMoney(c);

    // 5. and sleep
    const before = { busts: c.w.player.busts, logLen: c.w.log.length };
    c.w = dispatch(c.w, { type: 'end_day' });
    answerEverything(c);   // a job that went sideways overnight is waiting in the morning
    tallyNight(c, before);
    check(c, d);
  }
  return { w: c.w, cov, scenario };
}

/** The invariants a soak exists to catch. A NaN here is a real bug, not a balance question. */
function check(c: Ctx, day: number) {
  const bad = (v: number, what: string) => { if (!Number.isFinite(v)) throw new Error(`NaN in ${what} on day ${day} (world day ${c.w.day})`); };
  const p = c.w.player;
  bad(p.cash, 'cash'); bad(p.dirty, 'dirty'); bad(p.heat, 'heat'); bad(p.cyberHeat ?? 0, 'cyberHeat');
  for (const b of Object.values(c.w.blocks)) for (const v of Object.values(b.influence)) bad(v, `influence ${b.id}`);
  for (const r of Object.values(c.w.rackets)) bad(r.lastIncome, `racket ${r.id}`);
  for (const a of select.authorities(c.w)) bad(a.attention, `authority ${a.id}`);
  for (const card of select.cards(c.w)) { bad(card.freshness, `card ${card.id}`); bad(card.limit, `card limit ${card.id}`); }
  // an op stuck 'ready' for many days means something stopped resolving it
  for (const o of Object.values(c.w.ops)) {
    if (o.status === 'ready' && o.launched && c.w.day - o.createdDay > 15) warn(c.cov, `op ${o.kind} has been ready for ${c.w.day - o.createdDay} days without resolving`);
  }
  if (select.confrontations(c.w).length > 3) warn(c.cov, `${select.confrontations(c.w).length} confrontations queued at once`);
}

/** The end-of-run summary lines the CLI prints. */
export function summary(r: RunResult): string[] {
  const { w } = r; const p = w.player;
  const out: string[] = [];
  out.push(`scenario ${r.scenario}${w.cheated ? ' (admin panel used — this is not an economy curve)' : ''}`);
  out.push(`Day ${w.day} | cash ${Math.round(p.cash)} dirty ${Math.round(p.dirty)} heat ${Math.round(p.heat)} wire-heat ${Math.round(p.cyberHeat ?? 0)} respect ${p.respect} fear ${p.fear}`);
  out.push(`crew ${p.crewIds.length} (${select.crew(w).map(n => n.crew?.status).join(',') || '-'}) | businesses ${p.businessIds.length} | rackets ${p.racketIds.length} | safehouses ${p.safehouseIds.length} | control ${(select.controlShare(w) * 100).toFixed(1)}%`);
  out.push(`kit ${select.equippedItems(w).map(i => i.label).join(', ') || 'none'} | cards ${select.liveCards(w).length} | secrets ${select.secrets(w).length} | open cases ${select.openCases(w).length}`);
  out.push(`law: ${select.authorities(w).map(a => `${a.name} ${a.posture} (${Math.round(a.attention)})`).join(' | ') || 'none'}`);
  for (const f of Object.values(w.factions)) {
    out.push(`${f.name.padEnd(24)} ${f.temperament.padEnd(11)} soldiers ${String(f.soldiers).padStart(2)} blocks ${String(select.blocksOf(w, f.id).length).padStart(3)} stance→player ${f.stance[PLAYER]} (${Math.round(f.standing[PLAYER])})`);
  }
  return out;
}
