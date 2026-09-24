/**
 * The end of a day, in a fixed order: people, money in, product, ground, jobs, the other outfits,
 * the law, what happens overnight, the paper, and whether the game is over. The order is part of
 * the balance — income lands before the law looks at your heat, so a good day can still be the
 * day they come.
 */
import { BUSINESSES, LABS, OFFICIALS, PRODUCTS, RACKETS, SAFEHOUSE_TIERS } from '@r/content/world';
import { FAIR_RATE, labOutput, labQuality, protectionTake, racketIncome, rankOf, sellCapacity, stashTotal, streetPrice, washCap, washRate, netWorth } from './economy';
import { drawEvents } from './events';
import { tickFamily } from './family';
import { hurtHours } from './fights';
import { splitHours } from '@r/content/clock';
import { tickFactions } from './factions';
import { tickHostages } from './hostages';
import { tickCommission } from './commission';
import { tickRegion } from './region';
import { generateJobs, tickJobs } from './jobs';
import { openCases, tickLaw } from './law';
import { writeNews } from './news';
import { freeFromAssignment, gainXp } from './people';
import type { Rng } from './rng';
import { controlShare } from './select-core';
import { applyInfluence } from './territory';
import { CREW, crewOn, tickStreetCrews } from './streetcrews';
import type { AgendaKind, Id, Product, World } from './types';
import { PLAYER } from './types';
import { addHeat, clamp, fullName, log, money, spend } from './util';

export const WIN_SHARE = 0.5;
export const STRAIGHT = { clean: 150000, heat: 15, days: 10 };

export function endDay(w: World, rng: Rng) {
  const p = w.player;
  const day = w.day;
  // dirty and clean are what came *in*; washing is a conversion and is counted on its own, so a day
  // that washed more than it earned never reports a negative take
  const sum = { clean: 0, dirty: 0, spent: 0, washed: p.washedToday };
  // The fixer's window is per day. This counter was never reset in the first cut, so after a day
  // or two of washing the fixer refused for the rest of the game. What the fixer did today goes into
  // the day's summary; the laundries wash overnight and do not eat tomorrow's window.
  p.washedToday = 0;
  const gains: Record<Id, number> = {};
  const gain = (b: Id, n: number) => { gains[b] = (gains[b] ?? 0) + n; };
  const pay = (n: number) => { if (spend(w, n)) { sum.spent += n; return true; } return false; };

  // ---- the crew: mend, get paid, stay or go
  for (const id of p.crewIds.slice()) {
    const n = w.npcs[id]; const c = n?.crew; if (!n?.alive || !c) continue;
    if (c.status === 'injured' || c.status === 'jailed' || c.status === 'travel') { c.statusDays--; if (c.statusDays <= 0) { const was = c.status; c.status = 'ready'; c.statusDays = 0; log(w, was === 'travel' ? `${fullName(n)} is in ${w.region?.cities.find(x => x.id === (c.cityId || 'c0'))?.name ?? 'town'} and ready to work.` : `${fullName(n)} is back.`, 'good', { npcId: id }); } }
    if (c.status === 'jailed') continue;
    if (pay(c.cut)) c.loyalty = clamp(c.loyalty + (c.cut >= 30 ? 0.4 : 0.1));
    else { c.loyalty = clamp(c.loyalty - 10); log(w, `You could not pay ${fullName(n)}.`, 'bad', { npcId: id }); }
    if (n.traits.includes('loyal')) c.loyalty = clamp(c.loyalty + 0.3);
    const a = c.assignment;
    if (a?.kind === 'guard') { gain(a.blockId, 3); gainXp(w, id, 3); }
    if (a?.kind === 'district') { for (const bid of w.districts[a.districtId].blockIds) if ((w.blocks[bid].influence[PLAYER] ?? 0) > 10) gain(bid, 0.5); gainXp(w, id, 3); }
    // made men do not walk out (`family.ts` keeps them at a floor); associates can
    if (!c.made && c.loyalty < 15 && rng.chance(0.25)) {
      freeFromAssignment(w, n); n.crew = undefined; n.faction = undefined; n.role = 'patron'; n.rel.trust = -30;
      p.crewIds = p.crewIds.filter(x => x !== id);
      log(w, `${fullName(n)} walked. Nobody saw them go.`, 'bad', { npcId: id });
    }
  }

  // ---- protection and places you own
  for (const b of Object.values(w.businesses)) {
    if (b.closed > 0) { b.closed--; continue; }
    // a till fills back up over a few days
    const def = BUSINESSES[b.type];
    const full = def.vault ? b.till : b.income * 2.5;
    if (!def.vault && b.till < full) b.till = Math.round(b.till + b.income * 0.5);
    if (b.protection?.by === PLAYER) {
      // a street crew nobody has dealt with helps itself to a quarter of it
      const crew = crewOn(w, b.blockId);
      const take = Math.round(protectionTake(b) * (crew && crew.terms === 'none' ? 1 - CREW.skim : 1));
      p.dirty += take; sum.dirty += take; gain(b.blockId, 1.5);
      const o = w.npcs[b.ownerId];
      if (o) {
        o.rel.trust = clamp(o.rel.trust + (b.protection.rate > FAIR_RATE ? -1 : 0.3), -100, 100);
        // an owner who neither likes nor fears you stops paying
        if (o.rel.trust < -30 && o.rel.fear < 20 && rng.chance(0.2)) { b.protection = undefined; log(w, `${fullName(o)} stops paying you. ${b.name} is on its own now.`, 'bad', { businessId: b.id }); }
      }
    } else if (b.ownedBy === PLAYER) {
      const profit = Math.round(b.income * 0.45);
      p.cash += profit; sum.clean += profit; gain(b.blockId, 1);
    }
  }

  // ---- your rackets
  for (const rid of p.racketIds) {
    const r = w.rackets[rid]; if (!r) continue;
    const def = RACKETS[r.kind];
    const b = w.businesses[r.businessId];
    if (r.down > 0) { r.down--; r.lastIncome = 0; continue; }
    if (b.closed > 0) { r.lastIncome = 0; continue; }
    let income = 0;
    if (def.wash) {
      if (r.on !== false) {
        const cap = Math.max(0, washCap(w, r));
        const amount = Math.min(p.dirty, cap);
        const clean = Math.round(amount * washRate(w));
        p.dirty -= amount; p.cash += clean; sum.washed += amount;
        income = clean;
      }
    } else if (def.sells) {
      let cap = sellCapacity(r);
      for (const prod of def.sells.slice().sort((a, c) => PRODUCTS[c].price - PRODUCTS[a].price)) {
        const lot = p.stash[prod]; if (!lot.n || cap <= 0) continue;
        const n = Math.min(lot.n, cap);
        const price = prod === 'goods' ? Math.round(PRODUCTS.goods.price * 0.75 * (0.7 + (lot.q / 100) * 0.5)) : streetPrice(w, prod, b.blockId);
        lot.n -= n; cap -= n; income += n * price;
        addHeat(w, PRODUCTS[prod].heat * n * 0.15, b.blockId);
      }
      p.dirty += income; sum.dirty += income;
    } else {
      income = racketIncome(w, r);
      // a lieutenant with a hand in the till: the district's take arrives light, and nothing says so
      const lt = skimmer(w, w.blocks[b.blockId].districtId);
      if (lt) { const cut = Math.round(income * skimRate(lt)); income -= cut; lt.crew!.skimmed = (lt.crew!.skimmed ?? 0) + cut; }
      if (def.clean) { p.cash += income; sum.clean += income; } else { p.dirty += income; sum.dirty += income; }
    }
    r.lastIncome = income;
    // a racket is a standing risk, not an event: a little attention every day it runs
    // Measured: at 0.12 an empire of two dozen rackets sat at heat 90 all day with nothing left to
    // do about it. At 0.08, and with captains cooling you (law.ts), a big operation lives in the
    // fifties and a careful one lower.
    addHeat(w, def.heat * 0.08 * r.level, b.blockId);
    if (r.runnerId) gainXp(w, r.runnerId, 4);
    const minded = !!r.runnerId;
    if (rng.chance(def.risk * (w.districts[w.blocks[b.blockId].districtId].attention / 50) * (minded ? 0.7 : 1.2))) {
      r.down = rng.int(1, 3); addHeat(w, 3, b.blockId);
      log(w, `Trouble at ${b.name}: the ${def.label.toLowerCase()} is shut ${r.down} day${r.down > 1 ? 's' : ''}.`, 'bad', { businessId: b.id });
    }
    gain(b.blockId, 1);
  }

  // ---- product
  for (const sid of p.safehouseIds) {
    const s = w.safehouses[sid]; if (!s) continue;
    const tier = SAFEHOUSE_TIERS[s.tier - 1];
    for (const lab of s.labs) {
      if (lab.down > 0) { lab.down--; lab.lastOutput = 0; continue; }
      if (lab.supplies <= 0) { lab.lastOutput = 0; continue; }
      lab.supplies--;
      const def = LABS[lab.kind];
      const out = labOutput(w, lab);
      const room = Math.max(0, stashCapacity(w) - stashTotal(w));
      const made = Math.min(out, room);
      const lot = p.stash[def.product]; const q = labQuality(w, lab);
      if (made) { lot.q = Math.round((lot.q * lot.n + q * made) / (lot.n + made)); lot.n += made; }
      lab.lastOutput = made;
      if (made < out) log(w, `The stash is full. ${out - made} lots of ${def.product} wasted.`, 'warn');
      addHeat(w, def.heat * 0.3 * lab.level, s.blockId);
      if (lab.workerId) gainXp(w, lab.workerId, 3);
      if (rng.chance(def.risk * (w.districts[w.blocks[s.blockId].districtId].attention / 60))) { lab.down = rng.int(2, 4); addHeat(w, 5, s.blockId); log(w, `The ${def.label.toLowerCase()} at ${s.name} has an accident. Down ${lab.down} days.`, 'bad', { blockId: s.blockId }); }
    }
    if (!pay(tier.rent)) addHeat(w, 0);
    gain(s.blockId, 1);
  }

  // ---- the payroll and the lawyer
  if (day % 7 === 0) for (const n of Object.values(w.npcs)) if (n.payroll && n.payroll > 1 && n.alive) {
    if (!pay(n.payroll)) { n.payroll = undefined; log(w, `You missed the payment to ${fullName(n)}. The arrangement is over.`, 'bad', { npcId: n.id }); }
  }
  if (p.lawyer && !pay(150)) { p.lawyer = false; log(w, 'Your lawyer stops returning calls. Pay your bills.', 'bad'); }

  // ---- the corners
  tickStreetCrews(w, rng, pay);

  // ---- ground, jobs, the others, the law
  applyInfluence(w, gains);
  tickJobs(w);
  tickFactions(w, rng);
  // hostages before the law, so a day's thicker kidnap file is the one the prosecutor reads
  tickHostages(w, rng);
  // the family before the law: a rat's night of talking is in the file the prosecutor reads
  tickFamily(w, rng);
  tickLaw(w, rng);
  tickCommission(w, rng);
  tickRegion(w, rng);

  // ---- people's own lives: fear fades, trust settles, somebody always needs something
  for (const n of Object.values(w.npcs)) {
    if (!n.alive) continue;
    if (n.rel.fear > 0 && day % 2 === 0) n.rel.fear = clamp(n.rel.fear - 1);
    if (!n.crew && n.rel.trust > 5 && day % 5 === 0) n.rel.trust--;
  }
  if (rng.chance(0.5)) {
    const pool = Object.values(w.npcs).filter(n => n.alive && !n.agenda && !n.crew && !n.faction && !n.official);
    if (pool.length) { const n = rng.pick(pool); const k = rng.pick(['debt', 'sick', 'escape', 'kid'] as AgendaKind[]); n.agenda = { kind: k, known: false, since: day, cost: rng.int(8, 40) * 100 }; }
  }

  // ---- overnight
  drawEvents(w, rng);
  w.rng = rng.state;
  generateJobs(w, 3 + Math.floor(rankOf(w).ap / 4));
  rng.state = w.rng;

  // ---- the street settles, the day turns
  if (p.fear > 20 && day % 3 === 0) p.fear = clamp(p.fear - 1);
  if (p.lowDays > 0) p.lowDays--;
  p.apMax = rankOf(w).ap;
  // morning: the day's half of the hours; the night's half comes at nightfall (`clock.ts`)
  w.phase = 'day';
  p.ap = p.lowDays > 0 ? 0 : hurtHours(w, splitHours(p.apMax).day);
  for (const k of Object.keys(p.stash) as Product[]) p.stash[k].n = Math.max(0, Math.round(p.stash[k].n));
  p.cash = Math.round(p.cash); p.dirty = Math.round(p.dirty);

  // straight: enough clean money, no heat, nothing open, and a stretch of it
  const straight = p.cash >= STRAIGHT.clean && p.heat < STRAIGHT.heat && openCases(w).length === 0;
  p.straightDays = straight ? p.straightDays + 1 : 0;

  const control = controlShare(w);
  w.history.push({ day, clean: sum.clean, dirty: sum.dirty, spent: sum.spent, washed: sum.washed, heat: Math.round(p.heat), control: Math.round(control * 1000) / 10, worth: netWorth(w) });
  if (w.history.length > 120) w.history.splice(0, w.history.length - 120);
  log(w, `Day ${day} ends. Took in ${money(sum.clean)} clean and ${money(sum.dirty)} dirty${sum.washed ? `, washed ${money(sum.washed)}` : ''}, paid out ${money(sum.spent)}. Heat ${Math.round(p.heat)}.`, 'info');
  writeNews(w, rng, day);

  if (!w.won && (control >= WIN_SHARE || Object.values(w.factions).every(f => !f.alive))) {
    w.won = true;
    log(w, `You own ${w.city.name}. Every corner that matters answers to you.`, 'good');
  }
  const assets = p.crewIds.length + p.businessIds.length + p.racketIds.length + Object.values(w.businesses).filter(b => b.protection?.by === PLAYER).length;
  if (!w.over && day > 10 && assets === 0 && p.cash + p.dirty < 50) {
    w.over = { ending: 'broke', day, text: `No money, no people, no ground. ${w.city.name} forgot your name before you finished leaving.` };
  }
  w.day++;
  void OFFICIALS;
}

export function stashCapacity(w: World): number {
  return 40 + w.player.safehouseIds.reduce((t, id) => t + (SAFEHOUSE_TIERS[(w.safehouses[id]?.tier ?? 1) - 1]?.capacity ?? 0), 0);
}

/**
 * A lieutenant who is skimming. Greedy ones do it from the start, anybody does it once loyalty
 * slips under 50, and somebody who was audited in the last three weeks keeps their hands still.
 */
export function skimmer(w: World, districtId: Id) {
  const lt = Object.values(w.npcs).find(n => n.alive && n.crew?.assignment?.kind === 'district' && n.crew.assignment.districtId === districtId);
  if (!lt?.crew) return undefined;
  if (lt.crew.caughtDay !== undefined && w.day - lt.crew.caughtDay < 21) return undefined;
  return lt.traits.includes('greedy') || lt.crew.loyalty < 50 ? lt : undefined;
}
export const skimRate = (lt: { traits: string[]; crew?: { loyalty: number } }) => (lt.traits.includes('greedy') ? 0.18 : 0.1) + Math.max(0, 50 - (lt.crew?.loyalty ?? 50)) / 250;
