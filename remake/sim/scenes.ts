/**
 * Face to face. Every interaction with a person is a scene with its odds, its price and what it
 * risks worked out here — once — so the button shows exactly the chance the dice use.
 *
 * Rewritten from the original's scene/approach split into one table of verbs. The original had
 * three layers (scene, opener, closer) that the soak bot needed its own special path to reach;
 * here a verb is one press, and what it can lead to is written on it.
 */
import { BUSINESSES, OFFICIALS, TRAITS } from '@r/content/world';
import { INSTITUTION_RESPECT, businessPrice, crewCut, FAIR_RATE } from './economy';
import { openCase } from './law';
import { hire, practise, spreadWord } from './people';
import { kitBonus, kitOf } from './kit';
import type { Rng } from './rng';
import type { Business, Id, Npc, World } from './types';
import { PLAYER } from './types';
import { addHeat, addInfluence, clamp, fullName, log, money, remember, shortName, spend, spendClean, their, them, they, cap, vb } from './util';
import { buildJob } from './jobs';
import { bedsTotal } from './select-core';
import { crewCost, crewOf, crewWage } from './streetcrews';
import { isNight, whereIs } from './clock';
import { characterFactors } from './character';
import { bribeMult } from './seasons';

export type SceneKind = 'chat' | 'intimidate' | 'protect' | 'squeeze' | 'recruit' | 'bribe' | 'settle' | 'lean' | 'buy' | 'favour' | 'crew_pay' | 'crew_take' | 'crew_run';

export interface SceneQuote {
  kind: SceneKind;
  label: string;
  /** 0..100, or 100 for things that simply happen. */
  chance: number;
  factors: { label: string; n: number }[];
  ap: number;
  cash?: number;
  /** Clean cash only (a purchase the books can see). */
  clean?: boolean;
  gain: string;
  risk: string;
  disabled?: string;
}

const traitMod = (n: Npc, t: string, v: number) => (n.traits.includes(t as never) ? v : 0);
/** Friends and family standing behind someone: harder to scare, slower to trust. */
const backup = (w: World, n: Npc) => n.ties.filter(t => t.kind !== 'rival' && w.npcs[t.id]?.alive).length;

export function quote(w: World, kind: SceneKind, npcId: Id, opts: { businessId?: Id; rate?: number } = {}): SceneQuote {
  const n = w.npcs[npcId];
  const p = w.player;
  const biz = opts.businessId ? w.businesses[opts.businessId] : n.workId ? w.businesses[n.workId] : undefined;
  // every rolled quote carries your character's lines (reputation, a bump, the shakes) on top of its
  // own, so the button and the dice agree without each case having to remember them
  const q = (x: Partial<SceneQuote> & { label: string }): SceneQuote => {
    const base: SceneQuote = { kind, chance: 100, factors: [], ap: 1, gain: '', risk: '', ...x };
    // a quote you only have to walk to still shows its odds (the sheet greys it but keeps the number)
    if (x.chance === undefined || x.chance >= 100 || (x.disabled && !x.disabled.startsWith('Go to'))) return base;
    const extra = characterFactors(w, kind);
    return extra.length ? { ...base, chance: clamp(base.chance + extra.reduce((t, e) => t + e.n, 0), 5, 95), factors: [...base.factors, ...extra] } : base;
  };
  if (!n?.alive) return q({ label: 'Nobody', disabled: 'They are gone.' });
  if (n.jailedDays) return q({ label: 'Nobody', disabled: `${cap(they(n))} ${vb(n, 'are', 'is')} in a cell for ${n.jailedDays} more days.` });
  // where they are at this hour (`clock.whereIs`): by day at work or at home, by night out at their
  // haunt or on their corner. By day either their home or their place of work will do, as before;
  // by night you have to go where they are
  const at = whereIs(w, n);
  const here = at === p.blockId || (!isNight(w) && (n.homeBlockId === p.blockId || (biz && biz.blockId === p.blockId)));
  const away = here ? undefined : `Go to ${w.blocks[at]?.name ?? w.blocks[n.homeBlockId].name} first.`;
  switch (kind) {
    case 'chat': {
      const gain = Math.round(4 + p.skills.charm * 0.9 + traitMod(n, 'connected', 2) - traitMod(n, 'honest', 0) + (p.background === 'grifter' ? 3 : 0));
      return q({ label: n.rel.met ? 'Talk' : 'Introduce yourself', gain: `Trust +${gain}. You get the measure of ${them(n)}${n.agenda && !n.agenda.known ? ', and maybe what they need' : ''}.`, risk: 'Nothing.', disabled: away });
    }
    case 'intimidate': {
      const f: SceneQuote['factors'] = [
        { label: 'Your muscle', n: p.skills.muscle * 4 },
        { label: 'Your name', n: Math.round(p.fear / 4) },
        { label: 'What you carry', n: carried(w) * 4 },
        { label: 'Their nerve', n: -Math.round(n.nerve * 0.55) },
        { label: 'People behind them', n: -backup(w, n) * 3 },
      ];
      if (n.traits.includes('coward')) f.push({ label: TRAITS.coward.label, n: 15 });
      if (n.traits.includes('tough')) f.push({ label: TRAITS.tough.label, n: -12 });
      if (p.background === 'bruiser') f.push({ label: 'You look like trouble', n: 8 });
      if (isNight(w)) f.push({ label: 'After dark, with nobody watching', n: 6 });
      const chance = clamp(35 + f.reduce((t, x) => t + x.n, 0), 5, 95);
      const risk = n.traits.includes('hothead') ? 'A hothead may swing at you.' : n.traits.includes('honest') ? 'An honest one may go to the police.' : 'They hate you a little more either way.';
      return q({ label: 'Lean on them', chance, factors: f, gain: 'Their fear rises, and the street hears about it.', risk, disabled: away });
    }
    case 'protect': {
      if (!biz || biz.ownerId !== n.id) return q({ label: 'Protection', disabled: 'Only an owner can pay for protection.' });
      if (biz.tier === 3) return q({ label: 'Protection', disabled: 'An institution does not pay anybody on the street.' });
      if (biz.protection?.by === PLAYER) return q({ label: 'Protection', disabled: 'They already pay you.' });
      if (biz.ownedBy === PLAYER) return q({ label: 'Protection', disabled: 'It is yours.' });
      const rate = opts.rate ?? 0.12;
      const f: SceneQuote['factors'] = [
        { label: 'Their fear of you', n: Math.round(n.rel.fear * 0.7) },
        { label: 'Their trust in you', n: Math.round(Math.max(0, n.rel.trust) * 0.5) },
        { label: 'What the street thinks of you', n: Math.round(n.rel.respect * 0.3 + p.respect / 6) },
        { label: 'Their nerve', n: -Math.round(n.nerve * 0.45) },
        { label: `Your rate (${Math.round(rate * 100)}%)`, n: -Math.round((rate - 0.1) * 150) },
      ];
      const holder = biz.protection ? w.factions[biz.protection.by] : undefined;
      if (holder) f.push({ label: `They already pay the ${holder.short}`, n: -20 });
      const chance = clamp(30 + f.reduce((t, x) => t + x.n, 0), 3, 95);
      const take = Math.round(biz.income * rate);
      return q({ label: 'Offer protection', chance, factors: f, gain: `${money(take)} a day, and a foothold on the block.${rate > FAIR_RATE ? ' Above 15% they will resent it.' : ''}`, risk: holder ? `The ${holder.short} will take this personally.` : 'They say no, and think less of you.', disabled: away });
    }
    case 'squeeze': {
      if (!biz || biz.ownerId !== n.id) return q({ label: 'Squeeze', disabled: 'Only an owner has a till to empty.' });
      if (biz.tier === 3) return q({ label: 'Squeeze', disabled: 'Not a place you squeeze.' });
      const take = Math.round(Math.min(biz.till, biz.income * (1 + n.rel.fear / 40)));
      const chance = clamp(Math.round(20 + n.rel.fear * 0.9 + p.skills.muscle * 2 - n.nerve * 0.4), 5, 95);
      const mine = biz.protection?.by === PLAYER;
      return q({ label: 'Squeeze them', chance, factors: [{ label: 'Their fear', n: Math.round(n.rel.fear * 0.9) }, { label: 'Your muscle', n: p.skills.muscle * 2 }, { label: 'Their nerve', n: -Math.round(n.nerve * 0.4) }], gain: `About ${money(take)} dirty, today.`, risk: mine ? 'They pay you already. Squeezing them costs a great deal of trust.' : 'Heat, and they will not forget it.', disabled: away });
    }
    case 'recruit': {
      if (n.crew) return q({ label: 'Recruit', disabled: 'Already yours.' });
      if (n.faction && n.faction !== PLAYER) return q({ label: 'Recruit', disabled: `${cap(they(n))} ${vb(n, 'belong', 'belongs')} to the ${w.factions[n.faction]?.short ?? 'other side'}.` });
      if (n.official) return q({ label: 'Recruit', disabled: 'Officials go on the payroll, not the crew.' });
      if (crewOf(w, n.id)) return q({ label: 'Recruit', disabled: 'They run a crew of their own. Deal with the crew.' });
      if (p.crewIds.length >= bedsTotal(w)) return q({ label: 'Recruit', disabled: `No room: ${bedsTotal(w)} beds. Rent or upgrade a safehouse.` });
      const f: SceneQuote['factors'] = [
        { label: 'Their trust', n: Math.round(n.rel.trust * 0.8) },
        { label: 'What they think of you', n: Math.round(n.rel.respect * 0.4 + p.respect / 5) },
        { label: 'Your charm', n: p.skills.charm * 3 },
      ];
      if (n.rel.owes) f.push({ label: 'They owe you', n: 20 });
      if (n.traits.includes('junkie')) f.push({ label: TRAITS.junkie.label, n: 10 });
      if (n.traits.includes('honest')) f.push({ label: TRAITS.honest.label, n: -25 });
      if (n.role === 'owner') f.push({ label: 'They have a business to run', n: -20 });
      const chance = clamp(10 + f.reduce((t, x) => t + x.n, 0), 3, 95);
      return q({ label: 'Recruit', chance, factors: f, gain: `They join for ${money(crewCut(n))} a day.`, risk: 'A no costs a little trust.', disabled: away ?? (n.rel.trust < 15 && !n.rel.owes ? 'They need to trust you first (15).' : undefined) });
    }
    case 'bribe': {
      if (!n.official) return q({ label: 'Bribe', disabled: 'Not an official.' });
      if (n.payroll) return q({ label: 'Bribe', disabled: 'Already on your payroll.' });
      const def = OFFICIALS[n.official];
      // the machine in City Hall (`seasons.ts`): officials come cheaper for a while after it wins
      const weekly = Math.round(def.weekly * (n.traits.includes('greedy') ? 0.75 : 1) * bribeMult(w));
      if (n.traits.includes('honest') && !n.secret?.known) return q({ label: 'Bribe', disabled: 'Honest. Money will not do it — something they are hiding might.' });
      const f: SceneQuote['factors'] = [{ label: 'Your respect', n: Math.round(p.respect / 3) }, { label: 'Your charm', n: p.skills.charm * 3 }, { label: 'Their trust', n: Math.round(n.rel.trust / 3) }];
      if (n.traits.includes('greedy')) f.push({ label: TRAITS.greedy.label, n: 20 });
      if (p.heat > 60) f.push({ label: 'You are too hot to be seen with', n: -20 });
      const chance = clamp(15 + f.reduce((t, x) => t + x.n, 0), 3, 95);
      return q({ label: `Put on the payroll (${money(weekly)}/wk)`, chance, factors: f, cash: weekly, gain: def.effect, risk: n.traits.includes('honest') ? 'Report you.' : 'A refusal gets remembered.' });
    }
    case 'settle': {
      const a = n.agenda;
      if (!a?.known) return q({ label: 'Help', disabled: 'You do not know what they need.' });
      if (a.cost) return q({ label: `Settle it (${money(a.cost)})`, cash: a.cost, gain: 'Trust +30, and they owe you a favour.', risk: 'Nothing but the money.', ap: 1 });
      return q({ label: 'Take it on', gain: 'A job on the board, and a favour owed when it is done.', risk: 'The job itself.', ap: 0 });
    }
    case 'lean': {
      if (!n.secret?.known) return q({ label: 'Use what you know', disabled: 'You know nothing about them worth using.' });
      const chance = clamp(55 + p.skills.brains * 3 - traitMod(n, 'tough', 15) + traitMod(n, 'coward', 15), 10, 95);
      return q({ label: 'Use what you know', chance, gain: n.official ? 'On your payroll for nothing, for a month.' : 'A favour owed and a great deal of fear.', risk: 'They will hate you. A fail sends them to the police.', disabled: away && !n.official ? away : undefined });
    }
    case 'buy': {
      if (!biz || biz.ownerId !== n.id) return q({ label: 'Buy', disabled: 'They do not own anything to sell.' });
      if (biz.ownedBy === PLAYER) return q({ label: 'Buy', disabled: 'It is yours.' });
      const price = businessPrice(w, biz);
      const willing = n.rel.trust >= 10 || n.rel.fear >= 45 || n.traits.includes('greedy');
      const premium = willing ? 1 : 1.3;
      const cost = Math.round(price * premium);
      const inst = biz.tier === 3 && p.respect < INSTITUTION_RESPECT ? `An institution will not sell to somebody with less than ${INSTITUTION_RESPECT} respect.` : undefined;
      return q({ label: `Buy ${biz.name} (${money(cost)} clean)`, cash: cost, clean: true, gain: `Yours: ${money(biz.income)} a day, clean, and a solid foothold.`, risk: willing ? 'Nothing.' : 'They want a premium to sell to a stranger.', disabled: inst });
    }
    case 'crew_pay': case 'crew_take': case 'crew_run': {
      const c = crewOf(w, n.id);
      if (!c) return q({ label: 'Their crew', disabled: 'Not the boss of a street crew.' });
      if (kind === 'crew_pay') {
        if (c.terms === 'paid') return q({ label: 'Pay them', disabled: 'They are on your money already.' });
        if (c.terms === 'yours') return q({ label: 'Pay them', disabled: 'They are yours.' });
        const chance = clamp(Math.round(45 + n.rel.trust / 2 + p.respect / 4 + p.skills.charm * 2 - (n.traits.includes('ambitious') ? 15 : 0)), 5, 95);
        return q({ label: `Put them on a wage (${money(crewWage(c))}/day)`, chance, factors: [{ label: 'Their trust', n: Math.round(n.rel.trust / 2) }, { label: 'Your respect', n: Math.round(p.respect / 4) }, { label: 'Your charm', n: p.skills.charm * 2 }], gain: 'They stop skimming your places on their block and hold the corner for you.', risk: 'A no, and they think you are soft.', disabled: away });
      }
      if (kind === 'crew_take') {
        if (c.terms === 'yours') return q({ label: 'Take them in', disabled: 'They are yours.' });
        const chance = clamp(Math.round(20 + n.rel.trust / 2 + p.respect / 3 + p.fear / 4 - c.members * 2 - (n.traits.includes('ambitious') ? 20 : 0)), 3, 90);
        return q({ label: `Take them in (${money(crewCost(c))}/day)`, chance, factors: [{ label: 'Their trust', n: Math.round(n.rel.trust / 2) }, { label: 'What the street thinks of you', n: Math.round(p.respect / 3 + p.fear / 4) }, { label: `A crew of ${c.members}`, n: -c.members * 2 }], gain: 'Their corner builds your ground every day, and they grow for you instead of against you.', risk: 'A no, and they think you are a threat.', disabled: away ?? (n.rel.trust < 10 && p.respect < 30 ? 'They would need to trust you (10), or respect you (30).' : undefined) });
      }
      const chance = clamp(Math.round(30 + p.skills.muscle * 4 + p.fear / 3 + carried(w) * 5 - c.members * 4), 5, 95);
      return q({ label: 'Run them off', chance, factors: [{ label: 'Your muscle', n: p.skills.muscle * 4 }, { label: 'Your name', n: Math.round(p.fear / 3) }, { label: 'What you carry', n: carried(w) * 5 }, { label: `A crew of ${c.members}`, n: -c.members * 4 }], gain: 'The corner is empty by tonight, and the street sees who emptied it.', risk: 'A fight you lose is a fight everybody hears about.', disabled: away });
    }
    case 'favour': {
      if (!n.rel.owes) return q({ label: 'Call in a favour', disabled: 'They owe you nothing.' });
      const what = n.official ? 'Heat −15, and a case file loses paper.' : biz?.ownerId === n.id ? `${money(Math.round(biz.income * 3))} from the till, freely given.` : 'A tip: a job on the board.';
      return q({ label: 'Call in a favour', ap: 0, gain: what, risk: 'The favour is spent.' });
    }
  }
}

/** Play a scene. `quote` has already been checked by `can()`. */
export function playScene(w: World, kind: SceneKind, npcId: Id, rng: Rng, opts: { businessId?: Id; rate?: number } = {}) {
  const n = w.npcs[npcId]; const p = w.player;
  const qt = quote(w, kind, npcId, opts);
  const biz = opts.businessId ? w.businesses[opts.businessId] : n.workId ? w.businesses[n.workId] : undefined;
  const ok = rng.float() * 100 < qt.chance;
  const first = !n.rel.met;
  if (first) { n.rel.met = w.day; p.introduced = (p.introduced ?? 0) + 1; remember(n, w.day, 'met', 'You introduced yourself.'); }
  switch (kind) {
    case 'chat': {
      const gain = Math.round(4 + p.skills.charm * 0.9 + (n.traits.includes('connected') ? 2 : 0) + (p.background === 'grifter' ? 3 : 0));
      n.rel.trust = clamp(n.rel.trust + gain, -100, 100);
      const learned: string[] = [];
      if (!n.known) { n.known = true; learned.push(`${they(n)} ${vb(n, 'are', 'is')} ${n.traits.map(t => TRAITS[t].label.toLowerCase()).join(' and ')}`); }
      if (n.agenda && !n.agenda.known && rng.chance(0.35 + p.skills.charm * 0.04)) { n.agenda.known = true; learned.push(`what ${they(n)} ${vb(n, 'need', 'needs')}: ${agendaLine(w, n)}`); }
      else if (n.secret && !n.secret.known && rng.chance(0.08 + p.skills.brains * 0.02)) { n.secret.known = true; learned.push(`something ${they(n)} would rather you did not know: ${secretLine(n)}`); }
      practise(w, 'charm', 3);
      log(w, `You talk with ${fullName(n)}. Trust +${gain}.${learned.length ? ` You learn ${learned.join('; and ')}.` : ''}`, 'info', { npcId });
      // a connected person who likes you starts bringing you work
      if (n.traits.includes('connected') && n.rel.trust >= 25 && rng.chance(0.35)) {
        const blk = w.blocks[n.homeBlockId];
        const bz = blk.businessIds.map(id => w.businesses[id]).filter(b => b.ownedBy !== PLAYER && b.protection?.by !== PLAYER);
        if (bz.length) { const t = rng.pick(bz); const j = buildJob(w, rng, { kind: rng.chance(0.5) ? 'burglary' : 'fraud', blockId: t.blockId, businessId: t.id, source: n }); if (j) log(w, `${shortName(n)} mentions something about ${t.name}. It is on your board.`, 'good', { npcId }); }
      }
      break;
    }
    case 'intimidate': {
      addHeat(w, 2, n.homeBlockId); practise(w, 'muscle', 4);
      if (ok) {
        const f = Math.round(22 + p.skills.muscle * 2 + (n.traits.includes('coward') ? 12 : 0) - (n.traits.includes('tough') ? 8 : 0));
        n.rel.fear = clamp(n.rel.fear + f); n.rel.trust = clamp(n.rel.trust - 8, -100, 100);
        remember(n, w.day, 'threatened', 'You leaned on them.');
        spreadWord(w, npcId, n.homeBlockId, 6, 0);
        log(w, `${fullName(n)} goes pale. Fear +${f}.`, 'warn', { npcId });
      } else {
        n.rel.trust = clamp(n.rel.trust - 12, -100, 100); n.rel.fear = clamp(n.rel.fear + 5);
        p.respect = clamp(p.respect - 1);
        if (n.traits.includes('hothead') && rng.chance(0.6)) { addHeat(w, 5, n.homeBlockId); p.ap = Math.max(0, p.ap - 1); log(w, `${fullName(n)} takes a swing at you. It turns into a brawl on the pavement; you lose an hour and some dignity.`, 'bad', { npcId }); }
        else if (n.traits.includes('honest') && rng.chance(0.5)) { openCase(w, 'violence', PLAYER, n.id, `Threatening ${fullName(n)}.`, 12); }
        else log(w, `${fullName(n)} stares back and does not blink.`, 'bad', { npcId });
      }
      break;
    }
    case 'protect': {
      if (!biz) break;
      if (ok) {
        const prev = biz.protection?.by;
        biz.protection = { by: PLAYER, rate: opts.rate ?? 0.12, since: w.day };
        n.rel.trust = clamp(n.rel.trust + 4, -100, 100);
        remember(n, w.day, 'protected', 'Pays you for protection.');
        addInfluence(w, biz.blockId, PLAYER, 6);
        if (prev && w.factions[prev]) { const f = w.factions[prev]; f.standing = clamp(f.standing - 15, -100, 100); f.grievances.unshift(`You took ${biz.name} off them`); f.grievances = f.grievances.slice(0, 5); log(w, `${biz.name} pays you now, not the ${f.short}. They will have heard by tonight.`, 'war', { businessId: biz.id }); }
        else log(w, `${biz.name} pays you now: ${money(Math.round(biz.income * (opts.rate ?? 0.12)))} a day.`, 'money', { businessId: biz.id });
        spreadWord(w, npcId, biz.blockId, 2, 3);
        practise(w, 'charm', 3);
      } else {
        n.rel.trust = clamp(n.rel.trust - 5, -100, 100);
        log(w, `${fullName(n)} says no. Not yet, anyway.`, 'bad', { npcId });
      }
      break;
    }
    case 'squeeze': {
      if (!biz) break;
      addHeat(w, 4, biz.blockId); practise(w, 'muscle', 3);
      if (ok) {
        const take = Math.round(Math.min(biz.till, biz.income * (1 + n.rel.fear / 40)));
        biz.till = Math.max(0, biz.till - take); p.dirty += take;
        n.rel.trust = clamp(n.rel.trust - (biz.protection?.by === PLAYER ? 35 : 15), -100, 100);
        n.rel.fear = clamp(n.rel.fear + 8);
        remember(n, w.day, 'squeezed', `You took ${money(take)} out of the till.`);
        log(w, `${fullName(n)} empties the till: ${money(take)}.`, 'money', { npcId });
      } else {
        n.rel.trust = clamp(n.rel.trust - 10, -100, 100);
        if (n.traits.includes('honest') || rng.chance(0.25)) openCase(w, 'robbery', PLAYER, n.id, `Extortion at ${biz.name}.`, 14);
        log(w, `${fullName(n)} refuses, loudly enough for the street to hear.`, 'bad', { npcId });
      }
      break;
    }
    case 'recruit': {
      if (ok) {
        hire(w, n, crewCut(n));
        if (n.workId) { const b = w.businesses[n.workId]; if (b && b.ownerId !== n.id) n.workId = undefined; }
        log(w, `${fullName(n)} is with you now, for ${money(n.crew!.cut)} a day.`, 'good', { npcId });
        practise(w, 'charm', 5);
      } else { n.rel.trust = clamp(n.rel.trust - 4, -100, 100); log(w, `${fullName(n)} thinks about it, and says no.`, 'bad', { npcId }); }
      break;
    }
    case 'bribe': {
      if (ok) {
        n.payroll = qt.cash ?? 0; spend(w, n.payroll);
        n.rel.trust = clamp(n.rel.trust + 10, -100, 100);
        log(w, `${fullName(n)} (${OFFICIALS[n.official!].label}) is on your payroll: ${money(n.payroll)} a week.`, 'good', { npcId });
      } else {
        n.rel.trust = clamp(n.rel.trust - 10, -100, 100);
        if (n.traits.includes('honest')) openCase(w, 'fraud', PLAYER, n.id, `Attempting to bribe ${fullName(n)}.`, 25);
        log(w, `${fullName(n)} does not know what you are talking about, and would like you to leave.`, 'bad', { npcId });
      }
      break;
    }
    case 'settle': {
      const a = n.agenda!;
      if (a.cost) {
        spend(w, a.cost);
        n.agenda = undefined; n.rel.trust = clamp(n.rel.trust + 30, -100, 100); n.rel.owes++;
        remember(n, w.day, 'helped', 'You settled what they could not.');
        spreadWord(w, npcId, n.homeBlockId, 0, 5);
        log(w, `You take care of it for ${fullName(n)}. ${cap(they(n))} will not forget.`, 'good', { npcId });
      } else {
        const t = a.targetId ? w.npcs[a.targetId] : undefined;
        if (t?.alive) {
          const tb = t.workId ? w.businesses[t.workId] : undefined;
          const j = a.kind === 'revenge' ? buildJob(w, rng, { kind: 'hit', blockId: t.homeBlockId, npcId: t.id, source: n })
            : tb ? buildJob(w, rng, { kind: 'arson', blockId: tb.blockId, businessId: tb.id, source: n }) : buildJob(w, rng, { kind: 'frame', blockId: t.homeBlockId, npcId: t.id, source: n });
          if (j) { j.expires = w.day + 10; log(w, `${fullName(n)} tells you about ${fullName(t)}. It is on your board: ${j.title}.`, 'info', { npcId }); }
        } else { n.agenda = undefined; log(w, `Whoever ${fullName(n)} had a problem with is not a problem any more.`, 'info', { npcId }); }
      }
      break;
    }
    case 'lean': {
      if (ok) {
        n.rel.fear = clamp(n.rel.fear + 35); n.rel.trust = clamp(n.rel.trust - 25, -100, 100); n.rel.owes++;
        if (n.official) { n.payroll = 1; log(w, `${fullName(n)} listens to what you know, and agrees to be helpful. For free.`, 'good', { npcId }); w.scheduled.push({ day: w.day + 28, template: 'payroll_lapses', npcId }); }
        else log(w, `${fullName(n)} understands exactly what you are saying. They owe you now.`, 'warn', { npcId });
        remember(n, w.day, 'threatened', 'You used their secret against them.');
      } else {
        openCase(w, 'fraud', PLAYER, n.id, `Blackmailing ${fullName(n)}.`, 25);
        n.rel.trust = clamp(n.rel.trust - 40, -100, 100);
        log(w, `${fullName(n)} calls your bluff and calls the police.`, 'law', { npcId });
      }
      break;
    }
    case 'buy': {
      if (!biz) break;
      spendClean(w, qt.cash ?? 0);
      buyBusiness(w, biz);
      n.rel.trust = clamp(n.rel.trust + 5, -100, 100);
      log(w, `${biz.name} is yours for ${money(qt.cash ?? 0)}. ${fullName(n)} stays on to run it.`, 'money', { businessId: biz.id });
      break;
    }
    case 'crew_pay': case 'crew_take': case 'crew_run': {
      const c = crewOf(w, n.id)!;
      if (kind === 'crew_run') {
        addHeat(w, 5, c.blockId); practise(w, 'muscle', 5);
        if (ok) { delete w.crews[c.id]; n.rel.fear = clamp(n.rel.fear + 40); spreadWord(w, n.id, c.blockId, 10, 3); addInfluence(w, c.blockId, PLAYER, 8); log(w, `You run the ${c.name} off their corner on ${w.blocks[c.blockId].name}. They will not be back.`, 'good', { blockId: c.blockId }); }
        else { c.members = Math.max(1, c.members - 1); p.respect = clamp(p.respect - 3); p.ap = Math.max(0, p.ap - 1); log(w, `The ${c.name} do not run. It turns into a fight in the street, and it does not go your way.`, 'bad', { blockId: c.blockId }); }
        break;
      }
      if (ok) {
        c.terms = kind === 'crew_pay' ? 'paid' : 'yours'; c.wage = kind === 'crew_pay' ? crewWage(c) : crewCost(c);
        n.rel.trust = clamp(n.rel.trust + 10, -100, 100);
        log(w, kind === 'crew_pay' ? `The ${c.name} take your money: ${money(c.wage)} a day, and your places on ${w.blocks[c.blockId].name} are left alone.` : `The ${c.name} are yours now — ${c.members} of them, holding ${w.blocks[c.blockId].name} for you at ${money(c.wage)} a day.`, 'good', { blockId: c.blockId });
      } else { n.rel.trust = clamp(n.rel.trust - 6, -100, 100); log(w, `${fullName(n)} laughs at the offer.`, 'bad', { npcId }); }
      break;
    }
    case 'favour': {
      n.rel.owes--;
      if (n.official) {
        p.heat = clamp(p.heat - 15);
        const c = Object.values(w.cases).filter(x => x.status === 'open').sort((a, b) => b.evidence - a.evidence)[0];
        if (c) c.evidence = clamp(c.evidence - 25);
        log(w, `${fullName(n)} makes some calls. Heat −15${c ? ', and a file thins out' : ''}.`, 'good', { npcId });
      } else if (biz?.ownerId === n.id) {
        const gift = Math.round(biz.income * 3); p.dirty += gift;
        log(w, `${fullName(n)} hands you an envelope: ${money(gift)}.`, 'money', { npcId });
      } else {
        const blk = w.blocks[n.homeBlockId];
        const bz = [...blk.businessIds, ...blk.neighborIds.flatMap(b => w.blocks[b].businessIds)].map(id => w.businesses[id]).filter(b => b.ownedBy !== PLAYER);
        if (bz.length) { const t = rng.pick(bz); const j = buildJob(w, rng, { kind: t.tier === 3 ? 'heist' : 'burglary', blockId: t.blockId, businessId: t.id, source: n }); if (j) { j.intel = 2; log(w, `${fullName(n)} tells you everything about ${t.name}. ${j.title} is on your board, half-planned already.`, 'good', { npcId }); } }
      }
      break;
    }
  }
  n.rel.trust = Math.round(n.rel.trust); n.rel.fear = Math.round(n.rel.fear); n.rel.respect = Math.round(n.rel.respect);
}

export function buyBusiness(w: World, biz: Business) {
  biz.ownedBy = PLAYER; biz.protection = undefined;
  if (!w.player.businessIds.includes(biz.id)) w.player.businessIds.push(biz.id);
  addInfluence(w, biz.blockId, PLAYER, 12);
  // rackets somebody else ran here are shut: the new owner decides
  for (const rid of biz.racketIds) { const r = w.rackets[rid]; if (r && r.owner !== PLAYER) delete w.rackets[rid]; }
  biz.racketIds = biz.racketIds.filter(id => w.rackets[id]);
  void BUSINESSES;
}

export function agendaLine(w: World, n: Npc): string {
  const a = n.agenda; if (!a) return '';
  const t = a.targetId ? w.npcs[a.targetId] : undefined;
  switch (a.kind) {
    case 'debt': return `${money(a.cost ?? 0)} to somebody who is losing patience`;
    case 'sick': return `${money(a.cost ?? 0)} for a doctor for somebody ${they(n)} ${vb(n, 'love', 'loves')}`;
    case 'escape': return `${money(a.cost ?? 0)} and a way out of ${w.city.name}`;
    case 'kid': return `${money(a.cost ?? 0)} to keep ${their(n)} kid out of trouble`;
    case 'revenge': return t ? `${fullName(t)} dead, for what they did` : 'somebody to pay for a death';
    case 'rival': return t ? `${fullName(t)} out of business` : 'a rival gone';
  }
}
export function secretLine(n: Npc): string {
  switch (n.secret?.kind) {
    case 'affair': return 'an affair nobody at home knows about';
    case 'skimming': return `${they(n)} ${vb(n, 'have', 'has')} been skimming from ${their(n)} own books`;
    case 'debts': return 'debts to people who break fingers';
    case 'past': return 'a name and a record from another city';
    case 'informant': return `${they(n)} ${vb(n, 'talk', 'talks')} to a detective`;
    case 'habit': return 'a habit that costs more than it should';
    default: return '';
  }
}

/** The weapon on the boss, in muscle points: what a scene reads as "what you carry". */
function carried(w: World) { return kitBonus(kitOf(w, PLAYER), 'muscle'); }
