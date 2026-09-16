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
import { answerEverything, buyKit, goTo, handleMoney, haveAConversation, caseALandmark, hireSpecialists, launchOps, takeTheFamilyJob, pickTheHour, planAnOp, promoteLieutenants, resetPolicy, resolveEvents, runTheEmpire, sellSomethingOnTheStreet, spendTheFortune, tallyNight, tallyProduction, tallyPeople, tallyTheWorld, tryToGetOut, workTheAgendas, workTheBuildings, workTheCorners, workTheRoom, workTheStreet, workTheWire, type Ctx } from './policy';

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
  // Ops need people who are not already running something. A scenario that plans no ops holds
  // nobody back, so the honest day is exactly the shape it always was.
  const c: Ctx = { w, rng: new Rng(seed * 7 + 1), cov, crewCap: s.crewCap, reserve: (opts.opsPerDay ?? s.opsPerDay) > 0 ? 4 : 0, stillAt: s.stillAt ?? 5000, sinksAt: s.sinksAt ?? Infinity, goingStraight: !!s.goingStraight, reckless: !!s.reckless };
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
    // A scenario built around making something puts its line up — and takes yesterday's product
    // to a corner — before the day can spend the money or the legs on anything else. On day one
    // there is exactly enough for a back room and a still, and the bot otherwise settles
    // somebody's shark debt and buys a round with it, then takes a protection racket, and does
    // not get a line up until day 49 of 60. Setup costs want *clean* cash and everything a solo
    // player earns after day one is dirty, so missing the opening window means missing it for a
    // month. Everything else keeps the order it has always had: `stillAt` is only lowered by a
    // production-first scenario.
    const lineFirst = c.stillAt < 5000;
    if (lineFirst) { runTheEmpire(c, startBlockId); sellSomethingOnTheStreet(c); }

    // 3. go and do something. The honest scenario plans no ops and holds no cards, so for it
    //    these three are no-ops and the day is exactly the shape the original bot's was.
    // a bank or a depot is only ever worth something through somebody who works there, so the
    //    bot goes looking for that mark itself rather than waiting for the deck to offer one.
    //    Gated on opsPerDay so a scenario that plans no ops keeps exactly the day it always had.
    if (opsPerDay > 0) workTheBuildings(c);
    // The clock is set before anything is planned, because an op takes the hour it was created
    // with. Setting it after would have moved a number no job ever read, which is exactly the
    // kind of coverage that looks green and means nothing.
    if (opsPerDay > 0) pickTheHour(c, d);
    // …and walk a one-off place every fourth day, because one of the landmark jobs will not be
    // planned until its target has been cased. Every fourth rather than daily: it is a walk
    // across town plus 2 AP, and the same AP is what an op would have cost.
    if (opsPerDay > 0 && d % 4 === 2) caseALandmark(c);
    // …and once in a run, a job on somebody one of your own loves — the one op whose whole point
    // is what it does to the person who brought it to you.
    if (opsPerDay > 0) takeTheFamilyJob(c);
    for (let i = 0; i < opsPerDay; i++) if (!planAnOp(c)) break;
    // ...and the specialists go on between planning and launch, which is the only window there
    // is: the job needs an id before anybody can be hired onto it, and it has to still be here.
    hireSpecialists(c);
    launchOps(c);
    workTheWire(c);
    // Everybody else sells with whatever the jobs did not want. Position matters twice over:
    // ahead of the ops it costs the sixty-day sweep five distinct op kinds, and last, with the
    // rest of the empire, it never fires at all — by then a confrontation is usually queued and
    // every action comes back "Deal with what is in front of you first." A production-first
    // scenario takes the hit knowingly: selling the stock *is* its living.
    if (!lineFirst) sellSomethingOnTheStreet(c);

    // 4. Somebody's problem, then the street, then the rest of the empire, then money — in that
    //    order, because the laundering has to come after the day that earned something to
    //    launder. Agendas go first among those: settling one is the only thing that makes
    //    somebody owe you, and being owed is what the real asks below are gated on.
    workTheAgendas(c);
    // Standing arrangements on alternate days, for the same reason the conversation is every
    // third: these all spend the AP an op would otherwise have used, and sixteen days is a fixed
    // budget. Every day cost three op kinds over a sixty-day sweep and bought nothing extra.
    if (d % 2 === 0) workTheRoom(c);
    // A conversation costs the AP that would otherwise have gone on an op, so the bot has one
    // every third day rather than daily. Daily cost it two op kinds over sixteen days and bought
    // no coverage the third day did not already have.
    if (d % 3 === 0) haveARealConversation(c);
    // The corners, on alternate days for the same reason as the rest of these: it is a walk
    // across town and the AP comes out of the same day an op would have used. It has to come
    // before `workTheStreet`, which spends the day down to the last AP and left this a no-op.
    if (opsPerDay > 0 && d % 2 === 1) workTheCorners(c);
    // A run that is trying to stop does not shake anybody down: street work is dirty money and
    // heat, which are two of the four things `GO_STRAIGHT` will not have.
    if (!c.goingStraight) workTheStreet(c);
    runTheEmpire(c, startBlockId);
    if (c.goingStraight) tryToGetOut(c);
    // What a fortune is for, after the day has earned and before the day is banked. Off unless
    // the scenario sets `sinksAt`, so no existing run's shape moves.
    spendTheFortune(c);
    handleMoney(c);

    // 5. and sleep
    const before = { busts: c.w.player.busts, logLen: c.w.log.length };
    c.w = dispatch(c.w, { type: 'end_day' });
    answerEverything(c);   // a job that went sideways overnight is waiting in the morning
    tallyNight(c, before);
    tallyProduction(c);
    tallyPeople(c);
    tallyTheWorld(c);
    check(c, d);
    // The game can actually end now — somebody got to you and there was nobody to take over, or
    // you got out. Playing on past it is thirty-six days of "The game is over." in the log and
    // nothing else, which is how this was found. Stop, and say which ending it was.
    if (c.w.gameOver) { warn(cov, `the run ended on day ${c.w.day}: ${c.w.gameOver.reason}`); break; }
  }
  return { w: c.w, cov, scenario };
}

/**
 * One conversation a day, done the way the UI does it rather than by dispatching the scene
 * straight. The rest of the bot's day still goes through the plain actions, which is correct —
 * both paths are real and both need to stay working.
 */
function haveARealConversation(c: Ctx) {
  const near = Object.values(c.w.blocks)
    .filter(b => select.distanceFromStart(c.w, b.id) <= 1)
    .flatMap(b => select.businessesIn(c.w, b.id));

  /**
   * Two openings the bot could not reach by talking to the same shopkeeper every day, and the
   * coverage table said so rather than anybody noticing: it read ✗ on both the first time it ran.
   *
   * Both are gated on late state the **honest run never has** — it earns no street name in sixty
   * days and makes no nemesis — so neither of these fires there and the frozen day is untouched.
   * That is checked by diffing the soak, not assumed.
   */
  // Somebody who has never dealt with you, once the street has given you a name. The reputation
  // clause fires on a first meeting and nowhere else, so revisiting the same owner can never
  // produce it however many days the sweep runs.
  if (c.w.player.street) {
    // Two blocks out rather than one. A stranger is by definition somebody this bot has not been
    // to see, and after a fortnight it has been to see everybody within one hop — so the nearest
    // ring is exactly where strangers are *not*. The row went dark the moment the city changed
    // under it, which is a search too narrow to be reliable rather than a feature that broke.
    const strangers = Object.values(c.w.blocks)
      .filter(b => select.distanceFromStart(c.w, b.id) <= 2)
      .flatMap(b => select.businessesIn(c.w, b.id))
      .filter(b => { const o = c.w.npcs[b.ownerId]; return o?.alive && (o.rel.contacts ?? 0) === 0 && o.rel.metDay === undefined; });
    for (const shop of strangers.slice(0, 3)) {
      if (goTo(c, shop.blockId) && haveAConversation(c, 'visit', shop.ownerId, shop.id)) return;
    }
  }
  // …and the lieutenant who keeps turning up. The bot only ever talked to owners and patrons, so
  // the whole recurring-antagonist pool was unreachable by the one thing that reads it.
  //
  // Every fifth day rather than whenever one is nearby: taken unthrottled this displaced the
  // ordinary conversation on most days of every scenario, which is not a coverage win but a
  // different bot. It pushed `legacy` past the day it loses its player and broke the succession
  // row in `scripts/bot.test.ts` — a real signal that the change had altered the run rather than
  // added to it. One day in five still reaches the pool on the runs long enough to have a nemesis.
  if (c.w.day % 5 === 0) {
    const foe = Object.values(c.w.npcs).find(n => n.alive && select.isNemesis(n) && (select.travelCost(c.w, n.homeBlockId) ?? 9) <= 1);
    if (foe && goTo(c, foe.homeBlockId) && haveAConversation(c, 'visit', foe.id)) return;
  }

  const spot = near.find(b => c.w.npcs[b.ownerId]?.alive);
  if (!spot) return;
  if (!goTo(c, spot.blockId)) return;
  haveAConversation(c, 'visit', spot.ownerId, spot.id);
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
